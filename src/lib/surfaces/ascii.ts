/**
 * ASCII surface renderer.
 * Renders tiles as text characters over colored backgrounds.
 */

import type { SurfaceStyle } from '@/types'
import { ASCII_GLYPHS } from '@/constants/ascii-glyphs'
import { registerSurface, type SurfaceRenderer, type RenderTileOptions, type RenderBatchOptions } from './register'

const ASCII_RENDERER: SurfaceRenderer = {
  id: 'ascii' as SurfaceStyle,
  name: 'ASCII',
  description: 'Text characters with colored foreground/background.',

  renderTile({ ctx, tileTypeId, x, y, tileSize, colors }: RenderTileOptions): void {
    ctx.imageSmoothingEnabled = false

    // Background
    ctx.fillStyle = colors?.bgColor || '#000000'
    ctx.fillRect(x, y, tileSize, tileSize)

    // Character
    const char = ASCII_GLYPHS[tileTypeId]
    if (!char || char === ' ') return

    ctx.fillStyle = colors?.fgColor || '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `${Math.round(tileSize * 0.75)}px "Geist", "Noto Sans SC", "Microsoft YaHei", "PingFang SC", monospace`
    ctx.fillText(char, x + tileSize / 2, y + tileSize / 2, tileSize)
  },

  renderBatch({ ctx, tiles, tileSize, colorsByTileId }: RenderBatchOptions): void {
    ctx.imageSmoothingEnabled = false
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `${Math.round(tileSize * 0.75)}px "Geist", "Noto Sans SC", "Microsoft YaHei", "PingFang SC", monospace`

    for (const tile of tiles) {
      const colors = colorsByTileId[tile.tileTypeId]
      const x = tile.gridX * tileSize
      const y = tile.gridY * tileSize

      ctx.fillStyle = colors?.bgColor || '#000000'
      ctx.fillRect(x, y, tileSize, tileSize)

      const char = ASCII_GLYPHS[tile.tileTypeId]
      if (!char || char === ' ') continue

      ctx.fillStyle = colors?.fgColor || '#ffffff'
      ctx.fillText(char, x + tileSize / 2, y + tileSize / 2, tileSize)
    }
  },
}

registerSurface(ASCII_RENDERER)
