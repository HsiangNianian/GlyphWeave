/**
 * Voronoi surface renderer (placeholder).
 * Will render colored Voronoi cells with borders between different tile types.
 */

import type { SurfaceStyle } from '@/types'
import { registerSurface, type SurfaceRenderer, type RenderTileOptions } from './register'

const VORONOI_RENDERER: SurfaceRenderer = {
  id: 'voronoi' as SurfaceStyle,
  name: 'Voronoi',
  description: 'Voronoi diagram cells colored by tile type.',

  renderTile({ ctx, tileTypeId: _tileTypeId, x, y, tileSize, colors }: RenderTileOptions): void {
    // Placeholder: render as colored rect with a small inset
    ctx.fillStyle = colors?.bgColor || '#000000'
    ctx.fillRect(x, y, tileSize, tileSize)

    const inset = Math.max(1, Math.floor(tileSize * 0.1))
    ctx.fillStyle = colors?.fgColor || '#ffffff'
    ctx.fillRect(x + inset, y + inset, tileSize - inset * 2, tileSize - inset * 2)
  },
}

registerSurface(VORONOI_RENDERER)
