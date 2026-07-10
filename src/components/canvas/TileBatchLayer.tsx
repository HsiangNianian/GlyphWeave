'use client'
import { useCallback, useMemo } from 'react'
import { Shape } from 'react-konva'
import type { Context } from 'konva/lib/Context'
import { buildTileRenderBatches } from '@/lib/render-batches'
import type { VisibleTile } from '@/lib/map-core'
import type { TileColors } from '@/types'

type TileBatchLayerProps = {
  tiles: readonly VisibleTile[]
  tileSize: number
  colorsByTileId: Record<string, TileColors>
}

export function TileBatchLayer({ tiles, tileSize, colorsByTileId }: TileBatchLayerProps) {
  const batches = useMemo(
    () => buildTileRenderBatches(tiles, colorsByTileId),
    [colorsByTileId, tiles],
  )

  const sceneFunc = useCallback((context: Context): void => {
    context.imageSmoothingEnabled = false
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.font = `${Math.round(tileSize * 0.75)}px "Geist", "Noto Sans SC", "Microsoft YaHei", "PingFang SC", monospace`

    for (const batch of batches) {
      context.fillStyle = batch.bgColor
      for (const cell of batch.cells) {
        context.fillRect(cell.x * tileSize, cell.y * tileSize, tileSize, tileSize)
      }
    }

    for (const batch of batches) {
      if (!batch.glyph) continue
      context.fillStyle = batch.fgColor
      for (const cell of batch.cells) {
        const x = cell.x * tileSize
        const y = cell.y * tileSize
        context.fillText(batch.glyph, x + tileSize / 2, y + tileSize / 2, tileSize)
      }
    }
  }, [batches, tileSize])

  return <Shape listening={false} perfectDrawEnabled={false} sceneFunc={sceneFunc} />
}
