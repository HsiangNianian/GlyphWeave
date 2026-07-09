/**
 * Voxel surface renderer (placeholder).
 * Will render 3D-like isometric blocks.
 */

import type { SurfaceStyle } from '@/types'
import { registerSurface, type SurfaceRenderer, type RenderTileOptions } from './register'

const VOXEL_RENDERER: SurfaceRenderer = {
  id: 'voxel' as SurfaceStyle,
  name: 'Voxel',
  description: '3D isometric blocks with shade based on elevation.',

  renderTile({ ctx, tileTypeId: _tileTypeId, x, y, tileSize, colors }: RenderTileOptions): void {
    // Placeholder: render as colored rect with gradient
    ctx.fillStyle = colors?.bgColor || '#000000'
    ctx.fillRect(x, y, tileSize, tileSize)

    const m = Math.floor(tileSize * 0.15)
    const grad = ctx.createLinearGradient(x, y, x + tileSize, y + tileSize)
    grad.addColorStop(0, lighten(colors?.fgColor || '#fff', 20))
    grad.addColorStop(0.5, colors?.fgColor || '#ffffff')
    grad.addColorStop(1, darken(colors?.fgColor || '#aaa', 20))
    ctx.fillStyle = grad
    ctx.fillRect(x + m, y + m, tileSize - m * 2, tileSize - m * 2)
  },
}

function lighten(hex: string, amount: number): string {
  return adjust(hex, amount)
}

function darken(hex: string, amount: number): string {
  return adjust(hex, -amount)
}

function adjust(hex: string, amount: number): string {
  const num = parseInt(hex.slice(1), 16)
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + amount))
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount))
  const b = Math.min(255, Math.max(0, (num & 0xff) + amount))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

registerSurface(VOXEL_RENDERER)
