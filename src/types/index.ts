export type ToolType = 'brush' | 'erase' | 'pan' | 'fill' | 'select'
export type TileCategory = 'wall' | 'floor' | 'water' | 'terrain' | 'vegetation' | 'furniture' | 'item' | 'decoration' | 'special'
export type PresetCategory = 'rooms' | 'corridors' | 'features' | 'dungeon' | 'traps'

export interface TileType {
  id: string
  name: string
  char: string
  category: TileCategory
  sortOrder: number
}

export interface TileColors {
  fgColor: string
  bgColor: string
}

export interface Theme {
  id: string
  name: string
  description: string
  renderMode?: 'glyph' | 'pixel'
  colors: Record<string, TileColors>
}

export interface Preset {
  id: string
  name: string
  description: string
  category: PresetCategory
  grid: string[][]
}

export interface WorldConfig {
  worldName: string
  tileSize: number
  themeId: string
  initialTiles?: Record<string, string | null>
  initialLayerTiles?: Record<string, Record<string, string | null>>
  initialLayers?: Layer[]
}

export interface Layer {
  id: string
  name: string
  visible: boolean
  locked: boolean
}
