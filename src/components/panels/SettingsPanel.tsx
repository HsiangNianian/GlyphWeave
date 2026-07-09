'use client'
import { useUiStore } from '@/stores/ui-store'
import { useTranslation } from 'react-i18next'

export function SettingsPanel() {
  const { t } = useTranslation()
  const viewDistance = useUiStore((s) => s.viewDistance)
  const setViewDistance = useUiStore((s) => s.setViewDistance)
  const showGrid = useUiStore((s) => s.showGrid)
  const setShowGrid = useUiStore((s) => s.setShowGrid)
  const showMinimap = useUiStore((s) => s.showMinimap)
  const setShowMinimap = useUiStore((s) => s.setShowMinimap)

  return (
    <div className="flex flex-col gap-4 p-3">
      <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">{t('settings.view')}</h4>

      {/* View Distance */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs text-zinc-400">{t('settings.viewDistance')}</label>
          <span className="text-xs text-zinc-500 font-mono w-6 text-right">{viewDistance}</span>
        </div>
        <input
          type="range"
          min={1}
          max={50}
          value={viewDistance}
          onChange={(e) => setViewDistance(Number(e.target.value))}
          className="w-full h-1.5 appearance-none rounded-full bg-zinc-800 accent-zinc-400 cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-zinc-300
            [&::-webkit-slider-thumb]:cursor-pointer"
        />
        <p className="text-[10px] text-zinc-600 leading-relaxed">
          {t('settings.viewDistanceDesc')}
        </p>
      </div>

      <div className="h-px bg-zinc-800" />

      <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">{t('settings.display')}</h4>

      {/* Grid toggle */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={showGrid}
          onChange={() => setShowGrid(!showGrid)}
          className="accent-zinc-400 w-3.5 h-3.5"
        />
        <span className="text-xs text-zinc-300">{t('settings.showGrid')}</span>
      </label>

      {/* Minimap toggle */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={showMinimap}
          onChange={() => setShowMinimap(!showMinimap)}
          className="accent-zinc-400 w-3.5 h-3.5"
        />
        <span className="text-xs text-zinc-300">{t('settings.showMinimap')}</span>
      </label>
    </div>
  )
}
