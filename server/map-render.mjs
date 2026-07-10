import {
  MAX_OUTPUT_SIZE,
  THEMES,
  TILE_SIZE,
  colorsForTileToken,
  computeBounds,
  flattenTiles,
  glyphForTileToken,
} from './map-shared.mjs'
import { createCanvas } from '@napi-rs/canvas'

export function renderMap(data, options = {}) {
  const themeId = options.themeId || 'ansi-16'
  const padding = options.padding ?? 1
  const explicitScale = options.scale
  const customTheme = options.theme

  const themes = customTheme
    ? { ...THEMES, [themeId]: { ...customTheme, colors: { ...customTheme.colors } } }
    : THEMES
  const theme = themes[themeId]
  if (!theme) throw new Error(`Unknown theme: ${themeId}`)

  const tiles = flattenTiles(data)
  const bounds = computeBounds(tiles)

  const tileW = bounds.w
  const tileH = bounds.h
  const contentW = tileW * TILE_SIZE
  const contentH = tileH * TILE_SIZE
  const padPx = padding * TILE_SIZE

  // Determine scale
  let scale
  if (explicitScale) {
    scale = explicitScale / TILE_SIZE
  } else {
    const maxDim = MAX_OUTPUT_SIZE - padPx * 2
    const sx = maxDim / contentW
    const sy = maxDim / contentH
    scale = Math.min(1, sx, sy)
  }

  const canvasW = Math.ceil(contentW * scale + padPx * 2)
  const canvasH = Math.ceil(contentH * scale + padPx * 2)

  const canvas = createCanvas(canvasW, canvasH)
  const ctx = canvas.getContext('2d')

  // Fill background
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, canvasW, canvasH)

  const ox = (canvasW - contentW * scale) / 2
  const oy = (canvasH - contentH * scale) / 2

  // Draw tiles
  for (const [key, tileTypeId] of Object.entries(tiles)) {
    if (!tileTypeId || tileTypeId === 'void') continue
    const [sx, sy] = key.split(',')
    const x = parseInt(sx, 10) - bounds.minX
    const y = parseInt(sy, 10) - bounds.minY

    const colors = colorsForTileToken(theme, tileTypeId)
    if (!colors) continue

    const px = ox + x * TILE_SIZE * scale
    const py = oy + y * TILE_SIZE * scale
    const ts = Math.ceil(TILE_SIZE * scale) + 0.5

    // Background
    ctx.fillStyle = colors.bgColor
    ctx.fillRect(px, py, ts, ts)

    // Character
    const glyph = glyphForTileToken(tileTypeId)
    if (glyph && glyph !== ' ') {
      ctx.fillStyle = colors.fgColor
      const fontSize = Math.round(TILE_SIZE * scale * 0.75)
      if (fontSize >= 4) {
        // Use a simple approach: draw centered text
        ctx.font = `${fontSize}px monospace`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(glyph, px + ts / 2, py + ts / 2)
      }
    }
  }

  return canvas.toBuffer('image/png')
}
