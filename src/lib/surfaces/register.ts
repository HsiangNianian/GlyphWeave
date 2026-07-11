/**
 * Surface rendering system.
 * Each surface style defines how logical tile types are visually rendered.
 */

import type { SurfaceStyle, TileColors } from '@/types'

/** Options passed to a surface renderer for a single tile cell. */
export interface RenderTileOptions {
  ctx: CanvasRenderingContext2D
  tileTypeId: string
  x: number // pixel x (gridX * tileSize)
  y: number // pixel y (gridY * tileSize)
  tileSize: number
  colors: TileColors
  /** Access nearby tile types (for context-dependent rendering like Voronoi edges) */
  getNeighbor?: (dx: number, dy: number) => string | null
}

/** Options for batch rendering a set of tiles. */
export interface RenderBatchOptions {
  ctx: CanvasRenderingContext2D
  tiles: readonly { gridX: number; gridY: number; tileTypeId: string }[]
  tileSize: number
  colorsByTileId: Record<string, TileColors>
  /** Neighbor lookup for the batch. */
  getTile?: (gridX: number, gridY: number) => string | null
}

/** A surface style renderer. */
export interface SurfaceRenderer {
  id: SurfaceStyle
  name: string
  description: string
  /** Render a single tile cell. */
  renderTile: (options: RenderTileOptions) => void
  /** Render a batch of tiles. Falls back to per-tile renderTile if not provided. */
  renderBatch?: (options: RenderBatchOptions) => void
}

/** Registry of all available surface renderers. */
const surfaceRenderers: Record<SurfaceStyle, SurfaceRenderer> = {} as Record<SurfaceStyle, SurfaceRenderer>

export function registerSurface(renderer: SurfaceRenderer): void {
  surfaceRenderers[renderer.id] = renderer
}

export function getSurface(id: SurfaceStyle): SurfaceRenderer {
  return surfaceRenderers[id]
}

export function getAllSurfaces(): SurfaceRenderer[] {
  return Object.values(surfaceRenderers)
}
