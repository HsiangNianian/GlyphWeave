/**
 * Shared tilemap data and utilities.
 * No native dependencies — safe for Node.js and Cloudflare Workers.
 */
import {
  DEFAULT_RENDER_THEMES,
  MAX_OUTPUT_SIZE,
  TILE_SIZE,
  TILE_TYPES,
  colorsForTileToken,
  glyphForTileToken,
  normalizeRenderTileToken,
} from '../src/lib/render-surface-protocol.mjs'

export { MAX_OUTPUT_SIZE, TILE_SIZE, TILE_TYPES, colorsForTileToken, glyphForTileToken }
export const THEMES = DEFAULT_RENDER_THEMES

export function flattenTiles(data) {
  const result = {}
  if (data.layerTiles && data.layers) {
    for (const layer of data.layers) {
      const lt = data.layerTiles[layer.id]
      if (lt && layer.visible !== false) {
        for (const [key, id] of Object.entries(lt)) {
          const normalized = normalizeRenderTileToken(id)
          if (normalized !== null) result[key] = normalized
        }
      }
    }
    return result
  }

  const tiles = data.tiles ?? data
  for (const [key, id] of Object.entries(tiles)) {
    const normalized = normalizeRenderTileToken(id)
    if (normalized !== null) result[key] = normalized
  }
  return result
}

/**
 * Compute bounds from a flat tiles record.
 */
export function computeBounds(tiles) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const key of Object.keys(tiles)) {
    const [sx, sy] = key.split(',')
    const x = parseInt(sx, 10)
    const y = parseInt(sy, 10)
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0, w: 1, h: 1 }
  return { minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

/**
 * Render a tilemap to a PNG buffer.
 *
 * @param {object} data       - Map data: { tiles?, layerTiles?, layers?, ... }
 * @param {object} options
 * @param {string} options.themeId  - Theme ID ('ansi-16' or 'cogmind')
 * @param {number} options.padding  - Extra tiles around bounds (default 1)
 * @param {number} options.scale    - Pixels per tile (default: auto-fit)
 * @returns {Buffer} PNG image buffer
 */
