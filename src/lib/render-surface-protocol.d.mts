import type { Theme, TileCategory, TileColors, TileType } from '@/types'

export type RenderTrait =
  | 'air'
  | 'decal'
  | 'door'
  | 'emissive'
  | 'hazard'
  | 'item'
  | 'liquid'
  | 'opaque'
  | 'organic'
  | 'solid'
  | 'transparent'
  | 'unknown'
  | 'vertical'
  | 'walkable'

export type RenderSurface = {
  blockName: string
  category: TileCategory
  glyph: string
  name: string
  sortOrder: number
  tileId: string
  traits: readonly RenderTrait[]
}

export type TileRenderStyle = {
  colors: TileColors
  surface: RenderSurface
}

export const RENDER_SURFACE_PROTOCOL_VERSION: 1
export const TILE_SIZE: 24
export const MAX_OUTPUT_SIZE: 4096
export const UNKNOWN_TILE_COLORS: TileColors
export const TILE_SURFACES: Readonly<Record<string, RenderSurface>>
export const TILE_TYPES: Readonly<Record<string, TileType>>
export const TILE_TYPE_LIST: readonly TileType[]
export const TILE_CATEGORIES: readonly { key: TileCategory; label: string }[]
export const DEFAULT_RENDER_THEMES: Readonly<Record<string, Theme>>

export function tileTokenToBlockName(tileToken: string): string | null
export function blockNameToTileToken(blockName: string): string | null
export function normalizeRenderTileToken(tileToken: unknown): string | null
export function renderSurfaceForTileToken(tileToken: unknown): RenderSurface | null
export function glyphForTileToken(tileToken: unknown): string
export function colorsForTileToken(theme: Pick<Theme, 'colors'> | undefined, tileToken: unknown): TileColors | null
export function resolveTileRenderStyle(theme: Pick<Theme, 'colors'> | undefined, tileToken: unknown): TileRenderStyle | null
