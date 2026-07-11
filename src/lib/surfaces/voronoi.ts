/**
 * Voronoi surface renderer.
 * Renders tiles as Voronoi cells with perturbed, blurred boundaries
 * between different terrain types for an organic hand-drawn look.
 */

import { Delaunay } from 'd3-delaunay'
import type { SurfaceStyle } from '@/types'
import { registerSurface, type SurfaceRenderer, type RenderTileOptions, type RenderBatchOptions } from './register'

/** Number of blur passes for boundary edges. */
const BLUR_PASSES = 4
/** Base line width for blur. */
const BLUR_BASE_WIDTH = 0.5
/** Alpha step per blur pass. */
const BLUR_ALPHA_STEP = 0.06
/** Epsilon for matching polygon vertices. */
const EPSILON = 0.5
/** Number of sub-points per tile (higher = finer, more irregular cells). */
const SUBDIVISION = 5
/** How many segments to split each shared edge into for perturbation. */
const EDGE_SEGMENTS = 5
/** Max perpendicular displacement as fraction of edge length. */
const DISPLACE_FACTOR = 0.1

/**
 * Deterministic pseudo-random hash.
 * Returns a value in [0, 1).
 */
function hashRand(a: number, b: number, seed: number): number {
  let h = ((a * 374761393 + b * 668265263 + seed * 1274126177) | 0) >>> 0
  h = ((h ^ (h >> 13)) * 1274126177) >>> 0
  h = h ^ (h >> 16)
  return h / 4294967296
}

/** Check if two points are approximately equal. */
function pointsEqual(ax: number, ay: number, bx: number, by: number): boolean {
  return Math.abs(ax - bx) < EPSILON && Math.abs(ay - by) < EPSILON
}

/**
 * Generate a zigzag polyline between two shared Voronoi vertices.
 * Subdivides the straight edge and displaces intermediate points
 * perpendicular to the edge with deterministic noise.
 */
function perturbedEdge(
  sx: number, sy: number, ex: number, ey: number,
  seed: number,
): [number, number][] {
  const dx = ex - sx
  const dy = ey - sy
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 1) return [[sx, sy], [ex, ey]]

  // Unit perpendicular: (-dy/len, dx/len)
  const px = -dy / len
  const py = dx / len

  const pts: [number, number][] = [[sx, sy]]
  for (let s = 1; s < EDGE_SEGMENTS; s++) {
    const t = s / EDGE_SEGMENTS
    const mx = sx + dx * t
    const my = sy + dy * t
    const noise = (hashRand(Math.floor(sx), Math.floor(sy), seed * 7 + s) - 0.5) * 2 * DISPLACE_FACTOR * len
    pts.push([mx + px * noise, my + py * noise])
  }
  pts.push([ex, ey])
  return pts
}

const VORONOI_RENDERER: SurfaceRenderer = {
  id: 'voronoi' as SurfaceStyle,
  name: 'Voronoi',
  description: 'Voronoi diagram with organic blurred edges between terrain types.',

  renderTile({ ctx, tileTypeId: _tileTypeId, x, y, tileSize, colors }: RenderTileOptions): void {
    ctx.fillStyle = colors?.bgColor || '#000000'
    ctx.fillRect(x, y, tileSize, tileSize)
  },

  renderBatch({ ctx, tiles, tileSize, colorsByTileId, getTile: _getTile }: RenderBatchOptions): void {
    if (tiles.length < 3) {
      for (const t of tiles) {
        const c = colorsByTileId[t.tileTypeId]
        ctx.fillStyle = c?.bgColor || '#000'
        ctx.fillRect(t.gridX * tileSize, t.gridY * tileSize, tileSize, tileSize)
      }
      return
    }

    ctx.imageSmoothingEnabled = false

    const tileCount = tiles.length
    const totalPts = tileCount * SUBDIVISION

    // Build sub-points per tile with deterministic jitter
    const pts = new Float64Array(totalPts * 2)
    const parentTile = new Uint16Array(totalPts)

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

    for (let ti = 0; ti < tileCount; ti++) {
      const gx = tiles[ti].gridX
      const gy = tiles[ti].gridY
      const baseX = gx * tileSize
      const baseY = gy * tileSize

      for (let si = 0; si < SUBDIVISION; si++) {
        const idx = ti * SUBDIVISION + si
        const ox = (0.2 + hashRand(gx, gy, si * 2) * 0.6) * tileSize
        const oy = (0.2 + hashRand(gx, gy, si * 2 + 1) * 0.6) * tileSize
        const px = baseX + ox
        const py = baseY + oy
        pts[idx * 2] = px
        pts[idx * 2 + 1] = py
        parentTile[idx] = ti

        if (px < minX) minX = px
        if (py < minY) minY = py
        if (px > maxX) maxX = px
        if (py > maxY) maxY = py
      }
    }

    const pad = tileSize * 3
    const bounds: [number, number, number, number] = [
      minX - pad, minY - pad, maxX + pad, maxY + pad,
    ]

    const delaunay = new Delaunay(pts)
    const voronoi = delaunay.voronoi(bounds)

    // Pass 1: fill each Voronoi cell with its parent tile's bgColor
    for (let i = 0; i < totalPts; i++) {
      const cell = voronoi.cellPolygon(i)
      if (!cell || cell.length < 3) continue
      const ti = parentTile[i]
      const colors = colorsByTileId[tiles[ti].tileTypeId]
      ctx.fillStyle = colors?.bgColor || '#000000'
      ctx.beginPath()
      ctx.moveTo(cell[0][0], cell[0][1])
      for (let j = 1; j < cell.length; j++) {
        ctx.lineTo(cell[j][0], cell[j][1])
      }
      ctx.closePath()
      ctx.fill()
    }

    // Pass 2: draw perturbed blurred boundaries between different tile types
    for (let i = 0; i < totalPts; i++) {
      const myType = tiles[parentTile[i]].tileTypeId
      const neighborsIter = delaunay.neighbors(i)
      const myColors = colorsByTileId[myType]

      for (const j of neighborsIter) {
        if (j < i) continue
        const neighborType = tiles[parentTile[j]].tileTypeId
        if (neighborType === myType) continue

        const cellI = voronoi.cellPolygon(i)
        const cellJ = voronoi.cellPolygon(j)
        if (!cellI || !cellJ) continue

        // Find the two shared vertices between adjacent Voronoi cells
        const shared: [number, number][] = []
        for (const vi of cellI) {
          for (const vj of cellJ) {
            if (pointsEqual(vi[0], vi[1], vj[0], vj[1])) {
              shared.push([vi[0], vi[1]])
              break
            }
          }
        }
        if (shared.length < 2) continue

        const [sx, sy] = shared[0]
        const [ex, ey] = shared[1]

        // Generate jagged edge between the two shared vertices
        const edgePts = perturbedEdge(sx, sy, ex, ey, Math.floor(sx + sy))

        // Use my side's fgColor as boundary tint (inverted for dark themes)
        ctx.strokeStyle = myColors?.fgColor || '#888888'

        for (let pass = 0; pass < BLUR_PASSES; pass++) {
          ctx.globalAlpha = BLUR_ALPHA_STEP * (BLUR_PASSES - pass)
          ctx.lineWidth = BLUR_BASE_WIDTH * (pass + 1) * 1.3
          ctx.beginPath()
          ctx.moveTo(edgePts[0][0], edgePts[0][1])
          for (let k = 1; k < edgePts.length; k++) {
            ctx.lineTo(edgePts[k][0], edgePts[k][1])
          }
          ctx.stroke()
        }
      }
    }
    ctx.globalAlpha = 1
  },
}

registerSurface(VORONOI_RENDERER)
