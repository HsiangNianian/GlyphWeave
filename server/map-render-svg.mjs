/**
 * SVG-based tilemap renderer for Cloudflare Workers / Pages Functions.
 * Zero native dependencies — generates pure SVG strings.
 */

import { flattenTiles, computeBounds, ASCII_GLYPHS, THEMES, TILE_SIZE, MAX_OUTPUT_SIZE } from './map-shared.mjs'

export function renderMapSVG(data, options = {}) {
  const themeId = options.themeId || 'ansi-16'
  const padding = options.padding ?? 1
  const explicitScale = options.scale
  const customTheme = options.theme

  // Custom theme: merge into THEMES copy so built-in themes can be overridden
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

  const ox = (canvasW - contentW * scale) / 2
  const oy = (canvasH - contentH * scale) / 2

  const parts = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">`)
  parts.push(`<rect width="${canvasW}" height="${canvasH}" fill="#000"/>`)

  for (const [key, tileTypeId] of Object.entries(tiles)) {
    if (!tileTypeId || tileTypeId === 'void') continue
    const [sx, sy] = key.split(',')
    const x = parseInt(sx, 10) - bounds.minX
    const y = parseInt(sy, 10) - bounds.minY

    const colors = theme.colors[tileTypeId]
    if (!colors) continue

    const px = ox + x * TILE_SIZE * scale
    const py = oy + y * TILE_SIZE * scale
    const ts = Math.ceil(TILE_SIZE * scale) + 0.5

    parts.push(`<rect x="${px}" y="${py}" width="${ts}" height="${ts}" fill="${colors.bgColor}"/>`)

    const ch = ASCII_GLYPHS[tileTypeId]
    if (ch && ch !== ' ') {
      const fontSize = Math.round(TILE_SIZE * scale * 0.75)
      if (fontSize >= 4) {
        const cx = px + ts / 2
        const cy = py + ts / 2
        const escaped = ch.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        parts.push(`<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-family="monospace" font-size="${fontSize}" fill="${colors.fgColor}">${escaped}</text>`)
      }
    }
  }

  parts.push('</svg>')
  return parts.join('\n')
}
