import type { VisibleTile } from '@/lib/map-core'
import { resolveTileRenderStyle } from '@/lib/render-surface'
import type { Theme, TileColors } from '@/types'

export type RenderBatchCell = {
  x: number
  y: number
}

export type TileRenderBatch = {
  bgColor: string
  cells: RenderBatchCell[]
  fgColor: string
  glyph: string
}

export function buildTileRenderBatches(
  tiles: readonly VisibleTile[],
  colorsByTileId: Theme['colors'],
): TileRenderBatch[] {
  const theme = { colors: colorsByTileId }
  const batches = new Map<string, TileRenderBatch>()

  for (const tile of tiles) {
    const style = resolveTileRenderStyle(theme, tile.tileTypeId)
    if (style === null) continue
    const glyph = style.surface.glyph === ' ' ? '' : style.surface.glyph
    const key = batchKey(style.colors, glyph)
    let batch = batches.get(key)
    if (!batch) {
      batch = {
        bgColor: style.colors.bgColor,
        cells: [],
        fgColor: style.colors.fgColor,
        glyph,
      }
      batches.set(key, batch)
    }
    batch.cells.push({ x: tile.gridX, y: tile.gridY })
  }

  return [...batches.values()]
}

function batchKey(colors: TileColors, glyph: string): string {
  return `${colors.bgColor}\u0000${colors.fgColor}\u0000${glyph}`
}
