export type ToolType = 'brush' | 'erase' | 'pan' | 'fill' | 'select'
export type TileCategory = 'wall' | 'floor' | 'water' | 'terrain' | 'vegetation' | 'furniture' | 'item' | 'decoration' | 'special'
export type PresetCategory = 'rooms' | 'corridors' | 'features' | 'dungeon' | 'traps'

/** Visual surface style for rendering the tilemap. */
export type SurfaceStyle = 'ascii' | 'voronoi' | 'voxel' | 'pixel'

export interface TileType {
  id: string
  name: string
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

export type WorldConfig = {
  worldName: string
  tileSize: number
  themeId: string
  activeZ?: number
  initialTiles?: Record<string, string | null>
  initialSlices?: Record<string, Record<string, string | null>>
  initialVoxels?: Array<{
    block: string
    coord: [number, number, number]
  }>
  initialTheme?: Theme
}

export interface Layer {
  id: string
  name: string
  visible: boolean
  locked: boolean
}

// ── Generative UI (TypeSafe / Jev) ──────────────────────────────────────

/** Editor action branch the generated plan dispatches on. */
export type GenUiIntent = 'place_preset' | 'paint_tiles' | 'adjust_view' | 'unsupported'

export type GenUiFieldType = 'choice' | 'noul'

export interface GenUiOption {
  value: string
  label: string
  description: string
}

/** One generated control. `visibleFor: null` means it always applies. */
export interface GenUiField {
  id: string
  type: GenUiFieldType
  labelKey: string
  visibleFor: string[] | null
  /** Extra condition: only visible when another field's value is in `values`. */
  visibleWhen?: { field: string; values: string[] } | null
  value: string | number
  confidence: number | null
  options: GenUiOption[] | null
}

export interface GenUiPlan {
  model: string
  intent: GenUiIntent | null
  confidence: number | null
  destructive: boolean
  warningCodes: string[]
  fields: GenUiField[]
  usage: { input_tokens?: number; output_tokens?: number } | null
}

// ── Multi-step dungeon builder ──────────────────────────────────────────

export interface DungeonRoom {
  presetId: string
  x: number
  y: number
  w: number
  h: number
}

export type DungeonDirection = 'north' | 'south' | 'east' | 'west'

export interface DungeonPlan {
  model: string
  phase: 'plan'
  roomCountKey: string | null
  targetRooms: number
  connect: boolean
  confidence: number | null
  usage: { input_tokens?: number; output_tokens?: number } | null
}

export interface DungeonStep {
  model: string
  phase: 'step'
  shouldContinue: boolean
  presetId: string | null
  direction: DungeonDirection
  confidence: number | null
  warningCodes: string[]
  usage: { input_tokens?: number; output_tokens?: number } | null
}

export interface DungeonProgress {
  step: number
  targetRooms: number
  roomCount: number
  done: boolean
  aborted: boolean
  lastRoom?: string
  warning?: string
}

