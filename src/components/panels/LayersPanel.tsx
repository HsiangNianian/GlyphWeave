'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Box, Crosshair, LocateFixed } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { parseVoxelSliceId } from '@/lib/voxel-map'
import { useMapStore } from '@/stores/map-store'

const INT32_MIN = -2_147_483_648
const INT32_MAX = 2_147_483_647

export function LayersPanel() {
  const { t } = useTranslation()
  const tiles = useMapStore((state) => state.tiles)
  const activeZ = useMapStore((state) => state.activeZ)
  const setActiveZ = useMapStore((state) => state.setActiveZ)
  const [draftZ, setDraftZ] = useState(String(activeZ))

  useEffect(() => setDraftZ(String(activeZ)), [activeZ])

  const levelCounts = useMemo(() => {
    const counts = new Map<number, number>()
    for (const [sliceId, sliceTiles] of Object.entries(tiles)) {
      const z = parseVoxelSliceId(sliceId)
      if (z === null) continue
      const count = Object.values(sliceTiles).filter((value) => value !== null).length
      if (count > 0) counts.set(z, count)
    }
    return counts
  }, [tiles])

  const visibleLevels = useMemo(() => {
    const levels = new Set(levelCounts.keys())
    for (let offset = -2; offset <= 2; offset += 1) {
      const z = activeZ + offset
      if (z >= INT32_MIN && z <= INT32_MAX) levels.add(z)
    }
    levels.add(0)
    return [...levels].sort((left, right) => right - left)
  }, [activeZ, levelCounts])

  const commitDraft = (): void => {
    if (!/^-?[0-9]+$/u.test(draftZ.trim())) {
      setDraftZ(String(activeZ))
      return
    }
    const next = Number(draftZ)
    if (!Number.isInteger(next) || next < INT32_MIN || next > INT32_MAX) {
      setDraftZ(String(activeZ))
      return
    }
    setActiveZ(next)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-zinc-950">
      <div className="border-b border-zinc-800 px-3 py-3">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-zinc-300">
              {t('elevation.title')}
            </h3>
            <p className="mt-1 text-[10px] leading-relaxed text-zinc-600">
              {t('elevation.description')}
            </p>
          </div>
          <div className="rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-right">
            <span className="block text-[8px] uppercase tracking-[0.2em] text-amber-500/70">
              {t('elevation.current')}
            </span>
            <span className="font-mono text-sm font-semibold tabular-nums text-amber-300">
              Z {activeZ >= 0 ? '+' : ''}{activeZ}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-[2rem_1fr_2rem] gap-1.5">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 border-zinc-700 bg-zinc-900 text-zinc-400"
            disabled={activeZ === INT32_MIN}
            onClick={() => setActiveZ(activeZ - 1)}
            title={t('elevation.lower')}
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          <Input
            aria-label={t('elevation.zInput')}
            inputMode="numeric"
            value={draftZ}
            onChange={(event) => setDraftZ(event.target.value)}
            onBlur={commitDraft}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
              if (event.key === 'Escape') setDraftZ(String(activeZ))
            }}
            className="h-8 border-zinc-700 bg-black px-2 text-center font-mono text-xs tabular-nums text-zinc-200"
          />
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 border-zinc-700 bg-zinc-900 text-zinc-400"
            disabled={activeZ === INT32_MAX}
            onClick={() => setActiveZ(activeZ + 1)}
            title={t('elevation.raise')}
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="mt-1.5 h-6 w-full justify-center gap-1.5 text-[10px] text-zinc-600 hover:text-zinc-300"
          onClick={() => setActiveZ(0)}
        >
          <LocateFixed className="h-3 w-3" />
          {t('elevation.returnZero')}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 scrollbar-custom">
        <div className="mb-2 flex items-center justify-between text-[9px] uppercase tracking-[0.16em] text-zinc-600">
          <span>{t('elevation.verticalWell')}</span>
          <span>{t('elevation.occupiedCount', { count: levelCounts.size })}</span>
        </div>
        <div className="relative space-y-1 before:absolute before:bottom-3 before:left-[13px] before:top-3 before:w-px before:bg-zinc-800">
          {visibleLevels.map((z) => {
            const isActive = z === activeZ
            const cellCount = levelCounts.get(z) ?? 0
            return (
              <Button
                key={z}
                variant="ghost"
                className={`relative h-10 w-full justify-start rounded border px-2 font-normal transition-colors ${
                  isActive
                    ? 'border-amber-500/40 bg-amber-500/10 text-zinc-100 hover:bg-amber-500/15'
                    : 'border-transparent bg-zinc-900/35 text-zinc-500 hover:border-zinc-800 hover:bg-zinc-900'
                }`}
                onClick={() => setActiveZ(z)}
              >
                <span className={`relative z-10 mr-3 flex h-3 w-3 items-center justify-center rounded-full border ${
                  isActive
                    ? 'border-amber-300 bg-amber-400 text-black shadow-[0_0_10px_rgba(251,191,36,0.35)]'
                    : cellCount > 0
                      ? 'border-zinc-500 bg-zinc-700'
                      : 'border-zinc-700 bg-zinc-950'
                }`}>
                  {isActive && <Crosshair className="h-2 w-2" />}
                </span>
                <span className="w-16 text-left font-mono text-xs tabular-nums">
                  Z {z >= 0 ? '+' : ''}{z}
                </span>
                <span className="h-px flex-1 bg-zinc-800/70" />
                <span className="ml-2 flex min-w-16 items-center justify-end gap-1 font-mono text-[10px] tabular-nums text-zinc-600">
                  {cellCount > 0 && <Box className="h-3 w-3" />}
                  {cellCount} {t('elevation.cells')}
                </span>
              </Button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
