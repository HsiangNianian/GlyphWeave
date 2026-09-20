import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles, TriangleAlert, Loader2, WandSparkles } from 'lucide-react'

import type { GenUiField, GenUiPlan } from '@/types'
import { useMapStore } from '@/stores/map-store'
import { useUiStore } from '@/stores/ui-store'
import { computeTileBounds } from '@/lib/map-core'
import { formatVoxelSliceId } from '@/lib/voxel-map'
import { pointerToTile } from '@/lib/viewport'
import {
  fieldNumber,
  planToActions,
  visibleFields,
  withFieldValue,
  type PlanContext,
} from '@/lib/gen-ui-apply'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Toggle } from '@/components/ui/toggle'

/** A single generated control, chosen from the field type registry. */
function GeneratedField({
  field,
  onChange,
}: {
  field: GenUiField
  onChange: (value: string | number) => void
}) {
  const { t } = useTranslation()
  const label = t(field.labelKey, field.id)

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] text-zinc-400">{label}</Label>
        {field.confidence !== null && (
          <span className="font-mono text-[10px] text-zinc-500">
            {t('genUi.confidence', 'confidence')} {(field.confidence * 100).toFixed(0)}%
          </span>
        )}
      </div>

      {field.type === 'noul' ? (
        <Toggle
          variant="outline"
          size="sm"
          pressed={typeof field.value === 'number' && field.value >= 0.5}
          onPressedChange={(pressed) => onChange(pressed ? 1 : 0)}
          className="w-full justify-start text-xs data-[state=on]:bg-amber-500/20 data-[state=on]:text-amber-300"
        >
          {typeof field.value === 'number' && field.value >= 0.5
            ? t('genUi.noulTrue', 'Yes')
            : t('genUi.noulFalse', 'No')}
          <span className="ml-2 font-mono text-[10px] text-zinc-500">
            p={typeof field.value === 'number' ? field.value.toFixed(2) : '—'}
          </span>
        </Toggle>
      ) : (
        <Select value={String(field.value)} onValueChange={onChange}>
          <SelectTrigger size="sm" className="w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((option) => (
              <SelectItem key={option.value} value={option.value} className="text-xs">
                <span>{option.label}</span>
                {option.description && (
                  <span className="ml-2 text-[10px] text-zinc-500">{option.description}</span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}

interface GenUiPanelProps {
  containerSize: { w: number; h: number }
}

/**
 * Generative UI panel: a natural-language goal becomes a typed action plan
 * from TypeSafe's Jev. The card is composed from a fixed control registry and
 * nothing runs until the user reviews and applies it.
 */
export function GenUiPanel({ containerSize }: GenUiPanelProps) {
  const { t } = useTranslation()
  const genUiOpen = useUiStore((s) => s.genUiOpen)
  const setGenUiOpen = useUiStore((s) => s.setGenUiOpen)

  const worldName = useMapStore((s) => s.worldName)
  const themeId = useMapStore((s) => s.themeId)
  const activeZ = useMapStore((s) => s.activeZ)
  const activeTileType = useMapStore((s) => s.activeTileType)
  const tileSize = useMapStore((s) => s.tileSize)
  const tiles = useMapStore((s) => s.tiles)
  const viewport = useUiStore((s) => s.viewport)

  const [goal, setGoal] = useState('')
  const [plan, setPlan] = useState<GenUiPlan | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)

  const sliceId = formatVoxelSliceId(activeZ)
  const activeTiles = useMemo(() => tiles[sliceId] ?? {}, [tiles, sliceId])
  const bounds = useMemo(() => computeTileBounds(activeTiles), [activeTiles])

  const viewportCenter = useMemo(() => {
    if (containerSize.w <= 0 || containerSize.h <= 0) return null
    const [x, y] = pointerToTile(
      { x: containerSize.w / 2, y: containerSize.h / 2 },
      viewport,
      tileSize,
    )
    return { x, y }
  }, [containerSize, viewport, tileSize])

  const context = useMemo<PlanContext>(
    () => ({ bounds, tiles: activeTiles, viewportCenter }),
    [bounds, activeTiles, viewportCenter],
  )

  const fields = useMemo(() => (plan ? visibleFields(plan) : []), [plan])
  const actions = useMemo(() => (plan ? planToActions(plan, context) : []), [plan, context])
  const destructive =
    plan?.intent === 'paint_tiles' && (fieldNumber(plan, 'overwrites_existing') ?? 0) >= 0.5
  const canApply = plan !== null && actions.length > 0 && (!destructive || confirmed)

  const generate = async () => {
    const text = goal.trim()
    if (!text || loading) return
    setLoading(true)
    setError(null)
    setConfirmed(false)
    try {
      const response = await fetch('/api/gen-ui', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: text,
          editor: {
            worldName,
            themeId,
            activeTileType,
            activeZ,
            paintedTileCount: Object.keys(activeTiles).length,
            viewportCenter,
            bounds,
          },
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload?.error || `Request failed (${response.status})`)
      }
      setPlan(payload as GenUiPlan)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPlan(null)
    } finally {
      setLoading(false)
    }
  }

  const applyViewAction = (action: string) => {
    const ui = useUiStore.getState()
    switch (action) {
      case 'zoom_in':
        ui.zoomIn()
        break
      case 'zoom_out':
        ui.zoomOut()
        break
      case 'reset_zoom':
        ui.resetZoom()
        break
      case 'toggle_grid':
        ui.setShowGrid(!ui.showGrid)
        break
      case 'toggle_minimap':
        ui.setShowMinimap(!ui.showMinimap)
        break
    }
  }

  const apply = () => {
    if (!plan || !canApply) return
    for (const action of planToActions(plan, context)) {
      if (action.kind === 'tool') {
        TOOL_EXECUTORS[action.tool]?.(action.args as Record<string, unknown>)
      } else {
        applyViewAction(action.action)
      }
    }
    setConfirmed(false)
    setPlan(null)
    setGoal('')
    setGenUiOpen(false)
  }

  return (
    <Dialog open={genUiOpen} onOpenChange={setGenUiOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <WandSparkles className="h-4 w-4 text-emerald-400" />
            {t('genUi.title', 'Generate an action')}
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-400">
            {t('genUi.description', 'Describe an edit in plain language. Jev turns it into typed controls you can review before applying.')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="gen-ui-goal" className="text-[11px] text-zinc-400">
              {t('genUi.goalLabel', 'What do you want to do?')}
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="gen-ui-goal"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void generate()
                }}
                placeholder={t('genUi.goalPlaceholder', 'e.g. add a treasure vault east of the map')}
                disabled={loading}
                className="flex-1 text-sm"
              />
              <Button
                type="button"
                size="sm"
                onClick={() => void generate()}
                disabled={!goal.trim() || loading}
                className="shrink-0"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {plan ? t('genUi.regenerate', 'Regenerate') : t('genUi.generate', 'Generate')}
              </Button>
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-red-900/40 bg-red-950/30 px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}

          {!plan && !error && !loading && (
            <p className="py-6 text-center text-xs text-zinc-500">
              {t('genUi.empty', 'Describe an edit and I will turn it into a reviewable action.')}
            </p>
          )}

          {plan && (
            <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wide text-zinc-500">
                  {t('genUi.generatedControls', 'Generated controls')}
                </span>
                {plan.confidence !== null && (
                  <span className="font-mono text-[10px] text-zinc-500">
                    {t('genUi.overallConfidence', 'intent confidence')}{' '}
                    {(plan.confidence * 100).toFixed(0)}%
                  </span>
                )}
              </div>

              {fields.map((field) => (
                <GeneratedField
                  key={field.id}
                  field={field}
                  onChange={(value) =>
                    setPlan((prev) => (prev ? withFieldValue(prev, field.id, value) : prev))
                  }
                />
              ))}

              <div className="space-y-1 border-t border-zinc-800 pt-2">
                <span className="text-[11px] uppercase tracking-wide text-zinc-500">
                  {t('genUi.preview', 'This will run')}
                </span>
                {plan.intent === 'unsupported' ? (
                  <p className="text-xs text-amber-400">
                    {t('genUi.unsupported', 'This edit is not supported yet. Try painting tiles, stamping a preset, or changing the view.')}
                  </p>
                ) : actions.length === 0 ? (
                  <p className="text-xs text-amber-400">
                    {t('genUi.warning.no_actions', 'Nothing to apply — pick valid values above.')}
                  </p>
                ) : (
                  <ul className="space-y-0.5">
                    {actions.map((action) => (
                      <li key={action.label} className="font-mono text-[11px] text-zinc-300">
                        {action.label}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {destructive && (
                <div className="space-y-2 rounded-md border border-amber-900/50 bg-amber-950/20 px-3 py-2">
                  <div className="flex items-center gap-1.5 text-xs text-amber-400">
                    <TriangleAlert className="h-3.5 w-3.5" />
                    {t('genUi.warning.destructive', 'This flood fill overwrites existing tiles.')}
                  </div>
                  <Toggle
                    variant="outline"
                    size="sm"
                    pressed={confirmed}
                    onPressedChange={setConfirmed}
                    className="w-full justify-start text-xs"
                  >
                    {t('genUi.confirmDestructive', 'I understand, overwrite existing tiles')}
                  </Toggle>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setGenUiOpen(false)}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button size="sm" onClick={apply} disabled={!canApply}>
            {t('genUi.apply', 'Apply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
