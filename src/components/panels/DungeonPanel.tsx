import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Hammer, Loader2, Square, TriangleAlert } from 'lucide-react'

import type { DungeonProgress } from '@/types'
import { useMapStore } from '@/stores/map-store'
import { useUiStore } from '@/stores/ui-store'
import { computeTileBounds } from '@/lib/map-core'
import { formatVoxelSliceId } from '@/lib/voxel-map'
import { ROOM_GAP, runDungeonGenerator, type DungeonToolAction } from '@/lib/dungeon-generator'
import type { ValidationReport } from '@/lib/map-validate'
import { TOOL_EXECUTORS } from '@/lib/map-tools'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/**
 * Bounded multi-step dungeon builder. Each iteration asks Jev for one typed
 * decision, code places it and asks again. The loop, its caps, and the
 * corridor geometry all live in code — the model never loops on its own.
 */
export function DungeonPanel() {
  const { t } = useTranslation()
  const dungeonOpen = useUiStore((s) => s.dungeonOpen)
  const setDungeonOpen = useUiStore((s) => s.setDungeonOpen)

  const worldName = useMapStore((s) => s.worldName)
  const themeId = useMapStore((s) => s.themeId)
  const activeZ = useMapStore((s) => s.activeZ)
  const tiles = useMapStore((s) => s.tiles)

  const [goal, setGoal] = useState('')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<DungeonProgress | null>(null)
  const [validation, setValidation] = useState<ValidationReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const activeTiles = useMemo(
    () => tiles[formatVoxelSliceId(activeZ)] ?? {},
    [tiles, activeZ],
  )
  const bounds = useMemo(() => computeTileBounds(activeTiles), [activeTiles])
  const paintedTileCount = Object.keys(activeTiles).length

  const start = async () => {
    const text = goal.trim()
    if (!text || running) return
    setError(null)
    setProgress(null)
    setValidation(null)
    setRunning(true)

    const controller = new AbortController()
    abortRef.current = controller
    const startOrigin =
      paintedTileCount > 0 ? { x: bounds.minX, y: bounds.maxY + 1 + ROOM_GAP } : { x: 0, y: 0 }

    try {
      const result = await runDungeonGenerator({
        goal: text,
        editor: { worldName, themeId, activeZ, paintedTileCount, bounds },
        startOrigin,
        signal: controller.signal,
        onProgress: setProgress,
        place: (action: DungeonToolAction) => {
          TOOL_EXECUTORS[action.tool]?.(action.args)
        },
      })

      // Code owns verification too: report connectivity after the build.
      if (result.rooms.length > 0 && !controller.signal.aborted) {
        const report = TOOL_EXECUTORS.validateMap({})
        if (report.success && report.data) setValidation(report.data as ValidationReport)
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setRunning(false)
      abortRef.current = null
    }
  }

  const stop = () => {
    abortRef.current?.abort()
    setRunning(false)
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) stop()
    setDungeonOpen(open)
  }

  const target = progress?.targetRooms ?? 0
  const placed = progress?.roomCount ?? 0
  const percent = target > 0 ? Math.min(100, Math.round((placed / target) * 100)) : 0

  return (
    <Dialog open={dungeonOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Hammer className="h-4 w-4 text-amber-400" />
            {t('dungeon.title', 'Build a dungeon')}
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-400">
            {t('dungeon.description', 'Describe a dungeon. The editor asks Jev for one room at a time, places it, then connects the rooms. You can stop at any point.')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="dungeon-goal" className="text-[11px] text-zinc-400">
              {t('dungeon.goalLabel', 'Describe the dungeon')}
            </Label>
            <Input
              id="dungeon-goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void start()
              }}
              placeholder={t('dungeon.goalPlaceholder', 'e.g. a small crypt with a prison and a treasure vault')}
              disabled={running}
              className="text-sm"
            />
          </div>

          {progress && (
            <div className="space-y-2 rounded-md border border-zinc-800 bg-zinc-900/40 p-3">
              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                <span>
                  {t('dungeon.progress', 'Rooms placed')} {placed}/{target}
                </span>
                {running && <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />}
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full rounded-full bg-amber-500 transition-all"
                  style={{ width: `${percent}%` }}
                />
              </div>
              {progress.lastRoom && (
                <p className="font-mono text-[11px] text-zinc-500">
                  {t('dungeon.lastRoom', 'Last room')}: {progress.lastRoom}
                </p>
              )}
              {progress.done && !running && (
                <p className="text-[11px] text-emerald-400">
                  {progress.aborted
                    ? t('dungeon.aborted', 'Stopped. Placed rooms were kept.')
                    : t('dungeon.done', 'Dungeon built and rooms connected.')}
                </p>
              )}
              {validation && !running && (
                <p
                  className={
                    validation.connected
                      ? 'text-[11px] text-emerald-400'
                      : 'text-[11px] text-amber-400'
                  }
                >
                  {validation.connected
                    ? t('dungeon.connected', 'Validation: all walkable areas are connected.')
                    : t('dungeon.disconnected', 'Validation: {{count}} disconnected area(s) — see the map validator.', {
                        count: validation.disconnectedAreas.length,
                      })}
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="flex items-start gap-1.5 rounded-md border border-red-900/40 bg-red-950/30 px-3 py-2 text-xs text-red-400">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!progress && !error && !running && (
            <p className="py-4 text-center text-xs text-zinc-500">
              {t('dungeon.empty', 'Rooms are added one Jev decision at a time, then connected with corridors.')}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => handleOpenChange(false)} disabled={running}>
            {t('common.close', 'Close')}
          </Button>
          {running ? (
            <Button variant="destructive" size="sm" onClick={stop}>
              <Square className="h-3.5 w-3.5" />
              {t('dungeon.stop', 'Stop')}
            </Button>
          ) : (
            <Button size="sm" onClick={() => void start()} disabled={!goal.trim()}>
              <Hammer className="h-3.5 w-3.5" />
              {t('dungeon.start', 'Build')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
