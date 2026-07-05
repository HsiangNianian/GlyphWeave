'use client'
import { useMapStore } from '@/stores/map-store'
import { TILE_TYPE_LIST, TILE_CATEGORIES } from '@/constants/tiles'
import { THEMES } from '@/constants/themes'
import { ScrollArea } from '@/components/ui/scroll-area'

export function TilePalette() {
  const activeTileType = useMapStore((s) => s.activeTileType)
  const setActiveTileType = useMapStore((s) => s.setActiveTileType)
  const currentTool = useMapStore((s) => s.currentTool)
  const themeId = useMapStore((s) => s.themeId)
  const setCurrentTool = useMapStore((s) => s.setCurrentTool)
  const setActivePreset = useMapStore((s) => s.setActivePreset)

  const theme = THEMES[themeId]

  const handleSelect = (id: string) => {
    setActiveTileType(id)
    setActivePreset(null)
    if (currentTool === 'pan' || currentTool === 'select') {
      setCurrentTool('brush')
    }
  }

  return (
    <ScrollArea className="flex-1 px-2 py-2">
      <div className="space-y-4">
        {TILE_CATEGORIES.map((cat) => {
          const tiles = TILE_TYPE_LIST.filter((t) => t.category === cat.key && t.id !== 'void')
          if (tiles.length === 0) return null
          return (
            <div key={cat.key}>
              <h4 className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-1.5 px-1">
                {cat.label}
              </h4>
              <div className="grid grid-cols-4 gap-1">
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
                          ? 'bg-zinc-700 ring-1 ring-zinc-400'
                          : 'hover:bg-zinc-800 bg-zinc-900'
                        }
                      `}
                    >
                      <span
                        className="text-base leading-none font-mono"
                        style={{ color: colors?.fgColor || '#fff' }}
                      >
                        {tile.char}
                      </span>
                      <span className="text-[9px] text-zinc-500 truncate w-full text-center leading-tight">
                        {tile.name}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </ScrollArea>
  )
}
