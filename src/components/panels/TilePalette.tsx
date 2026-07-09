'use client'
import { useTranslation } from 'react-i18next'
import { useMapStore } from '@/stores/map-store'
import { TILE_TYPE_LIST, TILE_CATEGORIES } from '@/constants/tiles'
import { ASCII_GLYPHS } from '@/constants/ascii-glyphs'
import { resolveTheme } from '@/lib/theme-registry'

export function TilePalette() {
  const { t } = useTranslation()
  const activeTileType = useMapStore((s) => s.activeTileType)
  const setActiveTileType = useMapStore((s) => s.setActiveTileType)
  const currentTool = useMapStore((s) => s.currentTool)
  const themeId = useMapStore((s) => s.themeId)
  const customThemes = useMapStore((s) => s.customThemes)
  const setCurrentTool = useMapStore((s) => s.setCurrentTool)
  const setActivePreset = useMapStore((s) => s.setActivePreset)

  const theme = resolveTheme(themeId, customThemes)

  const handleSelect = (id: string) => {
    setActiveTileType(id)
    setActivePreset(null)
    if (currentTool === 'pan' || currentTool === 'select') {
      setCurrentTool('brush')
    }
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-custom">
      <div className="px-2 py-2 space-y-4">
        {TILE_CATEGORIES.map((cat) => {
          const tiles = TILE_TYPE_LIST.filter((t) => t.category === cat.key && t.id !== 'void')
          if (tiles.length === 0) return null
          return (
            <div key={cat.key}>
              <h4 className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-1.5 px-1">
                {t(`tilepalette.${cat.key}`, cat.label)}
              </h4>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(48px,48px))] gap-1">
                {tiles.map((tile) => {
                  const colors = theme.colors[tile.id]
                  const isSelected = activeTileType === tile.id
                  return (
                    <button
                      key={tile.id}
                      onClick={() => handleSelect(tile.id)}
                      className={`
                        flex flex-col items-center justify-center rounded-md p-1.5 gap-0.5
                        transition-colors cursor-pointer
                        ${isSelected
                          ? 'bg-zinc-700 ring-1 ring-inset ring-zinc-400'
                          : 'hover:bg-zinc-800 bg-zinc-900'
                        }
                      `}
                    >
                      <span
                        className="text-base leading-none font-mono"
                        style={{ color: colors?.fgColor || '#fff' }}
                      >
                        {ASCII_GLYPHS[tile.id] ?? ''}
                      </span>
                      <span className="text-[9px] text-zinc-500 truncate w-full text-center leading-tight">
                        {t(`tileType.${tile.id}`, tile.name)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
