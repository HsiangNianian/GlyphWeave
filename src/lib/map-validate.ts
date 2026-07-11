/**
 * Map validation — connectivity & logic checks for tilemaps.
 *
 * Pure functions with zero dependencies. Works with flat tile maps
 * (Record<"{x},{y}", tileTypeId>), compatible with both the editor
 * and server-side usage.
 */

// ── Tile classifications ────────────────────────────────────────────────

/** Tiles you can walk through. */
const WALKABLE = new Set([
  'floor', 'floorAlt', 'door', 'doorOpen', 'bridge',
  'stairsDown', 'stairsUp',
  // Furniture / items / decorations — imply walkable floor underneath
  'altar', 'fountain', 'shop', 'table', 'throne', 'cage',
  'treasure', 'grave', 'trap', 'blood',
  // Vegetation
  'grass',
])

/** Tiles that block movement (walls, obstacles, liquids). */
const BLOCKING = new Set([
  'wall', 'pillar', 'bar',
  'water', 'deepWater', 'lava',
  'tree',
])

const DIRS: readonly [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]]

const DIR_NAMES = ['N', 'E', 'S', 'W'] as const

// ── Helpers ─────────────────────────────────────────────────────────────

function tileKey(x: number, y: number): string {
  return `${x},${y}`
}

function parseKey(key: string): { x: number; y: number } {
  const [x, y] = key.split(',').map(Number)
  return { x, y }
}

function isWalkable(tileType: string | undefined): boolean {
  return tileType != null && WALKABLE.has(tileType)
}

function isBlocking(tileType: string | undefined): boolean {
  return tileType != null && BLOCKING.has(tileType)
}

function getTile(tiles: Record<string, string | null>, x: number, y: number): string | undefined {
  const v = tiles[tileKey(x, y)]
  return v == null ? undefined : v
}

export type TileMap = Record<string, string | null>

// ── Types ────────────────────────────────────────────────────────────────

export interface TileCoord {
  x: number
  y: number
}

export interface TileBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface WalkableComponent {
  size: number
  tiles: string[]
}

export interface DisconnectedArea {
  size: number
  largestComponentSize: number
  percentageOfLargest: number
  bounds: TileBounds
  sampleCoords: TileCoord[]
}

export interface DoorIssue {
  x: number
  y: number
  reason: string
}

export interface StairIssue {
  type: 'missing_up' | 'missing_down'
  message: string
}

export interface WaterBoundaryIssue {
  x: number
  y: number
  tileType: string
  reason: string
}

export interface DeadEnd {
  x: number
  y: number
  tileType: string
}

export interface ValidationReport {
  connected: boolean
  componentCount: number
  totalWalkableTiles: number
  disconnectedAreas: DisconnectedArea[]
  doorIssues: DoorIssue[]
  stairIssues: StairIssue[]
  waterBoundaryIssues: WaterBoundaryIssue[]
  deadEnds: DeadEnd[]
  issueSummary: string
}

// ── Connectivity analysis ────────────────────────────────────────────────

/**
 * Find all connected components of walkable tiles using BFS.
 * Tiles are considered connected if they are cardinally adjacent (N/E/S/W).
 */
export function findWalkableComponents(tiles: TileMap): WalkableComponent[] {
  const visited = new Set<string>()
  const components: WalkableComponent[] = []

  for (const key of Object.keys(tiles)) {
    if (visited.has(key)) continue
    const tileType = tiles[key]
    if (!isWalkable(tileType ?? undefined)) continue

    // BFS from this tile
    const componentTiles: string[] = []
    const queue: string[] = [key]
    visited.add(key)

    while (queue.length > 0) {
      const current = queue.shift()!
      componentTiles.push(current)
      const { x, y } = parseKey(current)

      for (const [dx, dy] of DIRS) {
        const nKey = tileKey(x + dx, y + dy)
        if (visited.has(nKey)) continue

        const nType = tiles[nKey]
        if (isWalkable(nType ?? undefined)) {
          visited.add(nKey)
          queue.push(nKey)
        }
      }
    }

    components.push({ size: componentTiles.length, tiles: componentTiles })
  }

  return components
}

/**
 * Check if all walkable tiles form a single connected component.
 */
export function isFullyConnected(tiles: TileMap): boolean {
  return findWalkableComponents(tiles).length <= 1
}

/**
 * Find disconnected areas (components smaller than the largest one).
 */
export function findDisconnectedAreas(tiles: TileMap): DisconnectedArea[] {
  const components = findWalkableComponents(tiles)
  if (components.length <= 1) return []

  // Sort by size descending
  const sorted = [...components].sort((a, b) => b.size - a.size)
  const largest = sorted[0]

  return sorted.slice(1).map((comp) => {
    const coords = comp.tiles.map((k) => parseKey(k))
    const xs = coords.map((c) => c.x)
    const ys = coords.map((c) => c.y)
    return {
      size: comp.size,
      largestComponentSize: largest.size,
      percentageOfLargest: Math.round((comp.size / largest.size) * 100),
      bounds: {
        minX: Math.min(...xs),
        minY: Math.min(...ys),
        maxX: Math.max(...xs),
        maxY: Math.max(...ys),
      },
      sampleCoords: coords.slice(0, 5),
    }
  })
}

// ── Door validation ─────────────────────────────────────────────────────

/**
 * Validate door placements. Each door should have walkable tiles on
 * at least two opposite sides (e.g., both N/S or both E/W).
 */
export function validateDoors(tiles: TileMap): DoorIssue[] {
  const issues: DoorIssue[] = []

  for (const key of Object.keys(tiles)) {
    if (tiles[key] !== 'door') continue
    const { x, y } = parseKey(key)

    const neighbors = DIRS.map(([dx, dy], i) => ({
      dir: DIR_NAMES[i],
      type: getTile(tiles, x + dx, y + dy),
    }))

    const walkableDirs = neighbors.filter((n) => isWalkable(n.type))
    const blockingDirs = neighbors.filter((n) => isBlocking(n.type))

    if (walkableDirs.length < 2) {
      // Accept doors with 1 walkable side + blocking sides (e.g., outer wall door)
      if (walkableDirs.length === 1 && blockingDirs.length >= 1) {
        continue
      }
      issues.push({
        x, y,
        reason: `Door has only ${walkableDirs.length} walkable neighbor(s) (${walkableDirs.map(d => d.dir).join(',') || 'none'}). ` +
          `Doors should connect two spaces.`,
      })
      continue
    }

    // Check for opposite walkable sides
    const hasNS = isWalkable(neighbors[0].type) && isWalkable(neighbors[2].type)
    const hasEW = isWalkable(neighbors[1].type) && isWalkable(neighbors[3].type)
    // Door can also be valid if it has walkable on one side and blocking on the opposite
    // (e.g., door in outer wall: outside=void, inside=floor, two walls on sides)
    const hasValidOrientation = hasNS || hasEW ||
      (walkableDirs.length >= 1 && blockingDirs.length >= 1)

    if (!hasValidOrientation) {
      issues.push({
        x, y,
        reason: `Door does not have opposite walkable neighbors (walkable: ${walkableDirs.map(d => d.dir).join(',')}).`,
      })
    }
  }

  return issues
}

// ── Stairs validation ───────────────────────────────────────────────────

/**
 * Check for stairs pairing. Having both stairsUp and stairsDown
 * is conventional for multi-level dungeons.
 */
export function validateStairs(tiles: TileMap): StairIssue[] {
  const issues: StairIssue[] = []
  let hasDown = false
  let hasUp = false

  for (const key of Object.keys(tiles)) {
    if (tiles[key] === 'stairsDown') hasDown = true
    if (tiles[key] === 'stairsUp') hasUp = true
  }

  if (hasDown && !hasUp) {
    issues.push({
      type: 'missing_up',
      message: 'Map has stairsDown but no stairsUp. Consider adding stairsUp for a multi-level dungeon.',
    })
  }
  if (hasUp && !hasDown) {
    issues.push({
      type: 'missing_down',
      message: 'Map has stairsUp but no stairsDown. Consider adding stairsDown for a multi-level dungeon.',
    })
  }

  return issues
}

// ── Water/Lava boundary validation ──────────────────────────────────────

// Direction name lookup for validation messages
const DIR_MAP: Record<string, string> = {
  '0,-1': 'N',
  '1,0': 'E',
  '0,1': 'S',
  '-1,0': 'W',
}

/** Tiles that represent liquids needing enclosure. */
const LIQUID_TILES = new Set(['water', 'deepWater', 'lava'])

/**
 * Check for liquid tiles that are adjacent to void (unset area).
 * Water/lava should be enclosed by walls, floors, or bridges.
 */
export function validateWaterBoundaries(tiles: TileMap): WaterBoundaryIssue[] {
  const issues: WaterBoundaryIssue[] = []

  for (const key of Object.keys(tiles)) {
    const tileType = tiles[key]
    if (!tileType || !LIQUID_TILES.has(tileType)) continue

    const { x, y } = parseKey(key)

    for (const [dx, dy] of DIRS) {
      const nType = getTile(tiles, x + dx, y + dy)
      if (nType === undefined) {
        issues.push({
          x, y, tileType,
          reason: `${tileType} tile is adjacent to void (no tile at ${x + dx},${y + dy}). Liquids should be enclosed.`,
        })
        break // One issue per liquid tile is enough
      }
    }
  }

  // Cap at 20 to keep AI context manageable
  return issues.slice(0, 20)
}

// ── Dead-end detection ──────────────────────────────────────────────────

/**
 * Find dead ends: walkable tiles (excluding doors) with only 1 walkable neighbor.
 */
export function findDeadEnds(tiles: TileMap): DeadEnd[] {
  const deadEnds: DeadEnd[] = []

  for (const key of Object.keys(tiles)) {
    const tileType = tiles[key]
    if (!isWalkable(tileType ?? undefined)) continue
    if (tileType === 'door' || tileType === 'doorOpen') continue

    const { x, y } = parseKey(key)
    const walkableCount = DIRS.filter(([dx, dy]) =>
      isWalkable(getTile(tiles, x + dx, y + dy)),
    ).length

    if (walkableCount === 1) {
      deadEnds.push({ x, y, tileType: tileType! })
    }
  }

  // Cap at 20 to keep AI context manageable
  return deadEnds.slice(0, 20)
}

// ── Room enclosure check ────────────────────────────────────────────────

/**
 * Check for unenclosed rooms: walkable tiles at the map boundary that
 * are adjacent to void instead of walls. Returns the count of exposed edges.
 */
export interface EnclosureIssue {
  x: number
  y: number
  direction: string
  reason: string
}

export function validateRoomEnclosure(tiles: TileMap): EnclosureIssue[] {
  const issues: EnclosureIssue[] = []

  for (const key of Object.keys(tiles)) {
    const tileType = tiles[key]
    if (!isWalkable(tileType ?? undefined)) continue
    if (tileType === 'door' || tileType === 'doorOpen') continue

    const { x, y } = parseKey(key)

    for (const [dx, dy] of DIRS) {
      const nType = getTile(tiles, x + dx, y + dy)
      if (nType === undefined) {
        const dirName = DIR_MAP[`${dx},${dy}`] ?? '?'
        issues.push({
          x, y,
          direction: dirName,
          reason: `Walkable tile "${tileType}" at (${x},${y}) has no tile to the ${dirName}. Room may not be fully enclosed.`,
        })
        break
      }
    }
  }

  return issues.slice(0, 30)
}

// ── Full validation report ──────────────────────────────────────────────

/**
 * Run all validation checks and return a comprehensive report.
 */
export function validateMap(tiles: TileMap): ValidationReport {
  const components = findWalkableComponents(tiles)
  const totalWalkable = components.reduce((sum, c) => sum + c.size, 0)
  const disconnectedAreas = findDisconnectedAreas(tiles)
  const doorIssues = validateDoors(tiles)
  const stairIssues = validateStairs(tiles)
  const waterBoundaryIssues = validateWaterBoundaries(tiles)
  const deadEnds = findDeadEnds(tiles)

  // Build human-readable summary for AI consumption
  const parts: string[] = []

  if (components.length === 0) {
    parts.push('No walkable tiles found in the map.')
  } else if (components.length === 1) {
    parts.push(`✓ Map is fully connected (${totalWalkable} walkable tiles in 1 component).`)
  } else {
    const largest = disconnectedAreas[0]?.largestComponentSize ?? 0
    parts.push(
      `✗ ${components.length} disconnected walkable areas. ` +
      `Largest: ${largest} tiles. ` +
      `Other areas: ${disconnectedAreas.map(a => `${a.size} tiles near (${a.bounds.minX},${a.bounds.minY})`).join(', ')}.`
    )
  }

  if (doorIssues.length > 0) {
    parts.push(`${doorIssues.length} door(s) have placement issues: ${doorIssues.map(d => `(${d.x},${d.y})`).join(', ')}.`)
  }
  if (stairIssues.length > 0) {
    parts.push(stairIssues.map(s => s.message).join(' '))
  }
  if (waterBoundaryIssues.length > 0) {
    parts.push(`${waterBoundaryIssues.length} water/lava tile(s) adjacent to void.`)
  }
  if (deadEnds.length > 0) {
    parts.push(`${deadEnds.length} dead end(s) found (tiles with only 1 exit).`)
  }
  if (parts.length === 0) {
    parts.push('No issues found.')
  }

  return {
    connected: components.length <= 1,
    componentCount: components.length,
    totalWalkableTiles: totalWalkable,
    disconnectedAreas,
    doorIssues,
    stairIssues,
    waterBoundaryIssues,
    deadEnds,
    issueSummary: parts.join(' '),
  }
}

/**
 * Quick summary (one line) suitable for non-AI contexts.
 */
export function validateMapQuick(tiles: TileMap): string {
  const report = validateMap(tiles)
  return report.issueSummary
}
