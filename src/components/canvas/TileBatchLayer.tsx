'use client'
import { useCallback } from 'react'
import { Shape } from 'react-konva'
import type { Context } from 'konva/lib/Context'
import { TILE_TYPES } from '@/constants/tiles'
import type { VisibleTile } from '@/lib/map-core'
import type { TileColors } from '@/types'

type TileBatchLayerProps = {
  tiles: readonly VisibleTile[]
  tileSize: number
  colorsByTileId: Record<string, TileColors>
}

export function TileBatchLayer({ tiles, tileSize, colorsByTileId }: TileBatchLayerProps) {
  const sceneFunc = useCallback((context: Context): void => {
    context.imageSmoothingEnabled = false
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.font = `${Math.round(tileSize * 0.75)}px "Geist", "Noto Sans SC", "Microsoft YaHei", "PingFang SC", monospace`

    for (const tile of tiles) {
      const colors = colorsByTileId[tile.tileTypeId]
      const x = tile.gridX * tileSize
      const y = tile.gridY * tileSize
      context.fillStyle = colors?.bgColor || '#000000'
      context.fillRect(x, y, tileSize, tileSize)

      const char = TILE_TYPES[tile.tileTypeId]?.char
      if (!char) continue

      context.fillStyle = colors?.fgColor || '#ffffff'
      context.fillText(char, x + tileSize / 2, y + tileSize / 2, tileSize)
    }
  }, [colorsByTileId, tileSize, tiles])

  return <Shape listening={false} perfectDrawEnabled={false} sceneFunc={sceneFunc} />
}
