/**
 * Pixel surface renderer (placeholder).
 * Will render tiles as colored pixel squares.
 */

import type { SurfaceStyle } from '@/types'
import { registerSurface, type SurfaceRenderer, type RenderTileOptions } from './register'

const PIXEL_RENDERER: SurfaceRenderer = {
  id: 'pixel' as SurfaceStyle,
  name: 'Pixel',
  description: 'Flat pixel squares with 1px border.',

  renderTile({ ctx, tileTypeId: _tileTypeId, x, y, tileSize, colors }: RenderTileOptions): void {
    // Renders as solid colored squares with a subtle border
    ctx.fillStyle = colors?.bgColor || '#000000'
    ctx.fillRect(x, y, tileSize, tileSize)

    const fillColor = colors?.fgColor || '#ffffff'
    ctx.fillStyle = fillColor
    ctx.fillRect(x + 1, y + 1, tileSize - 2, tileSize - 2)

    // Single pixel border
    if (tileSize > 4) {
      ctx.fillStyle = darken(fillColor, 40)
      ctx.fillRect(x + 1, y + 1, tileSize - 2, 1)
      ctx.fillRect(x + 1, y + 1, 1, tileSize - 2)
    }
  },
}

function darken(hex: string, amount: number): string {
  const num = parseInt(hex.slice(1), 16)
  const r = Math.max(0, ((num >> 16) & 0xff) - amount)
  const g = Math.max(0, ((num >> 8) & 0xff) - amount)
  const b = Math.max(0, (num & 0xff) - amount)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

registerSurface(PIXEL_RENDERER)
