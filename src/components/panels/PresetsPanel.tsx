'use client'
import { useState } from 'react'
import { useMapStore } from '@/stores/map-store'
import { PRESETS, PRESET_CATEGORIES } from '@/constants/presets'
import { TILE_TYPES } from '@/constants/tiles'
import { resolveTheme, type ThemeRegistry } from '@/lib/theme-registry'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { Preset } from '@/types'

function PresetPreview({ preset, themeId, customThemes }: { preset: Preset; themeId: string; customThemes: ThemeRegistry }) {
  const theme = resolveTheme(themeId, customThemes)
  const cellSize = 10
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${preset.grid[0]?.length || 1}, ${cellSize}px)`,
        gap: 0,
      }}
    >
      {preset.grid.flat().map((cellId, i) => {
        const colors = theme.colors[cellId]
        const tileDef = TILE_TYPES[cellId]
        return (
          <div
            key={i}
            style={{
              width: cellSize,
              height: cellSize,
              backgroundColor: colors?.bgColor || '#000',
              color: colors?.fgColor || '#fff',
              fontSize: 8,
              lineHeight: `${cellSize}px`,
              textAlign: 'center',
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {tileDef?.char || ' '}
          </div>
        )
      })}
    </div>
  )
}

export function PresetsPanel() {
  const [activeCategory, setActiveCategory] = useState<string>('rooms')
  const activePreset = useMapStore((s) => s.activePreset)
  const setActivePreset = useMapStore((s) => s.setActivePreset)
  const setActiveTileType = useMapStore((s) => s.setActiveTileType)
  const themeId = useMapStore((s) => s.themeId)
  const customThemes = useMapStore((s) => s.customThemes)

  const filtered = PRESETS.filter((p) => p.category === activeCategory)

  const handleSelect = (preset: Preset) => {
    setActivePreset(preset)
    setActiveTileType('wall')
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-1 px-2 py-1.5 border-b border-zinc-800 overflow-x-auto">
        {PRESET_CATEGORIES.map((cat) => (
          <Button
            key={cat.key}
            variant={activeCategory === cat.key ? 'default' : 'ghost'}
            size="sm"
            className="text-xs h-7 px-2"
            onClick={() => setActiveCategory(cat.key)}
          >
            {cat.label}
          </Button>
        ))}
      </div>
      <ScrollArea className="flex-1 px-2 py-2">
        <div className="grid grid-cols-2 gap-2">
          {filtered.map((preset) => (
            <Card
              key={preset.id}
              className={`
                p-2 cursor-pointer transition-colors
                ${activePreset?.id === preset.id
                  ? 'bg-zinc-700 border-zinc-400'
                  : 'bg-zinc-900 border-zinc-800 hover:bg-zinc-800'
                }
              `}
              onClick={() => handleSelect(preset)}
            >
              <div className="flex justify-center mb-1">
                <PresetPreview preset={preset} themeId={themeId} customThemes={customThemes} />
              </div>
              <p className="text-[11px] font-medium text-zinc-300 text-center truncate">
                {preset.name}
              </p>
              <p className="text-[9px] text-zinc-500 text-center leading-tight">
                {preset.description}
              </p>
            </Card>
          ))}
        </div>
        {activePreset && (
          <div className="mt-3 p-2 rounded bg-zinc-800/50 border border-zinc-700">
            <p className="text-xs text-zinc-400 text-center">
              Click on the canvas to place "{activePreset.name}"
            </p>
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
