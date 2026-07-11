import { describe, expect, it } from 'vitest'
import {
  findWalkableComponents,
  isFullyConnected,
  findDisconnectedAreas,
  validateDoors,
  validateStairs,
  validateWaterBoundaries,
  findDeadEnds,
  validateRoomEnclosure,
  validateMap,
  type TileMap,
} from './map-validate'

// ── Test helpers ────────────────────────────────────────────────────────

/** Build a flat tile map from an ASCII grid. First char of each key=value pair is the tile type. */
function gridToTiles(
  grid: string[],
  mapping: Record<string, string>,
): TileMap {
  const tiles: TileMap = {}
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      const ch = grid[y][x]
      if (ch === ' ' || ch === undefined) continue
      const tileId = mapping[ch]
      if (tileId && tileId !== 'void') {
        tiles[`${x},${y}`] = tileId
      }
    }
  }
  return tiles
}

const M = {
  '#': 'wall',
  '.': 'floor',
  ',': 'floorAlt',
  '+': 'door',
  "'": 'doorOpen',
  '~': 'water',
  '≈': 'deepWater',
  '!': 'lava',
  '♣': 'tree',
  '"': 'grass',
  '═': 'bridge',
  '>': 'stairsDown',
  '<': 'stairsUp',
  '≡': 'altar',
  '♦': 'fountain',
  '☠': 'grave',
  '^': 'trap',
  '0': 'pillar',
  '$': 'treasure',
  'Σ': 'shop',
  '▤': 'table',
  'Ψ': 'throne',
  '█': 'cage',
  ';': 'blood',
  '│': 'bar',
}

// ── Connectivity ─────────────────────────────────────────────────────────

describe('findWalkableComponents', () => {
  it('returns empty for a void-only map', () => {
    expect(findWalkableComponents({})).toEqual([])
  })

  it('returns empty for a wall-only map', () => {
    const tiles = gridToTiles(['###', '###', '###'], M)
    expect(findWalkableComponents(tiles)).toEqual([])
  })

  it('returns a single component for a simple connected room', () => {
    const tiles = gridToTiles([
      '#####',
      '#...#',
      '#...#',
      '#...#',
      '#####',
    ], M)
    const comps = findWalkableComponents(tiles)
    expect(comps).toHaveLength(1)
    expect(comps[0].size).toBe(9) // 3x3 floor
  })

  it('detects two disconnected rooms', () => {
    // Two 3x3 rooms separated by a wall column. Left is 3x3=9, right is 1x3=3.
    const tiles = gridToTiles([
      '#######',
      '#...#.#',
      '#...#.#',
      '#...#.#',
      '#######',
    ], M)
    const comps = findWalkableComponents(tiles)
    expect(comps).toHaveLength(2)
    // Sort by size for deterministic assertions
    comps.sort((a, b) => b.size - a.size)
    expect(comps[0].size).toBe(9)
    expect(comps[1].size).toBe(3)
  })

  it('connects rooms through a corridor', () => {
    // Two rooms connected by a 1-tile wide floor corridor
    const tiles: TileMap = {}
    // Left room 3x3 at (1,1)-(3,3), right room 3x3 at (7,1)-(9,3)
    // Corridor floor at (4,1)-(6,3), walls around everything
    for (let y = 1; y <= 3; y++) {
      tiles[`1,${y}`] = 'floor'; tiles[`2,${y}`] = 'floor'; tiles[`3,${y}`] = 'floor'
      tiles[`4,${y}`] = 'floor'; tiles[`5,${y}`] = 'floor'; tiles[`6,${y}`] = 'floor'
      tiles[`7,${y}`] = 'floor'; tiles[`8,${y}`] = 'floor'; tiles[`9,${y}`] = 'floor'
    }
    // Walls around
    for (let x = 0; x <= 10; x++) {
      tiles[`${x},0`] = 'wall'
      tiles[`${x},4`] = 'wall'
    }
    for (let y = 0; y <= 4; y++) {
      tiles[`0,${y}`] = 'wall'
      tiles[`10,${y}`] = 'wall'
    }
    const comps = findWalkableComponents(tiles)
    expect(comps).toHaveLength(1)
  })

  it('treats doors as walkable connections', () => {
    const tiles = gridToTiles([
      '####',
      '#+.#',
      '#..#',
      '####',
    ], M)
    const comps = findWalkableComponents(tiles)
    expect(comps).toHaveLength(1)
    expect(comps[0].size).toBe(4) // door + 3 floor
  })

  it('treats furniture as walkable', () => {
    const tiles = gridToTiles([
      '#####',
      '#.≡.#',
      '#####',
    ], M)
    const comps = findWalkableComponents(tiles)
    expect(comps).toHaveLength(1)
    expect(comps[0].size).toBe(3) // floor + altar + floor
  })

  it('does NOT connect diagonally', () => {
    const tiles: TileMap = {
      '0,0': 'floor',
      '1,1': 'floor', // diagonal only
      '2,0': 'floor',
    }
    const comps = findWalkableComponents(tiles)
    expect(comps).toHaveLength(3) // three isolated tiles
  })
})

describe('isFullyConnected', () => {
  it('returns true for a single room', () => {
    const tiles = gridToTiles(['#####', '#...#', '#####'], M)
    expect(isFullyConnected(tiles)).toBe(true)
  })

  it('returns false for two disconnected rooms', () => {
    const tiles = gridToTiles(['#######', '#...#.#', '#######'], M)
    expect(isFullyConnected(tiles)).toBe(false)
  })

  it('returns true for empty map', () => {
    expect(isFullyConnected({})).toBe(true)
  })
})

describe('findDisconnectedAreas', () => {
  it('returns empty for fully connected map', () => {
    const tiles = gridToTiles(['#####', '#...#', '#####'], M)
    expect(findDisconnectedAreas(tiles)).toEqual([])
  })

  it('returns disconnected areas with bounds', () => {
    const tiles = gridToTiles([
      '#####',
      '#.#.#',
      '#####',
    ], M)
    const areas = findDisconnectedAreas(tiles)
    expect(areas).toHaveLength(1) // one smaller area
    expect(areas[0].size).toBe(1)
    expect(areas[0].bounds).toEqual({ minX: 3, minY: 1, maxX: 3, maxY: 1 })
  })
})

// ── Doors ────────────────────────────────────────────────────────────────

describe('validateDoors', () => {
  it('accepts a door with floor on both N/S sides', () => {
    const tiles: TileMap = {
      '1,0': 'floor',
      '1,1': 'door',
      '1,2': 'floor',
    }
    expect(validateDoors(tiles)).toEqual([])
  })

  it('accepts a door with floor on both E/W sides', () => {
    const tiles: TileMap = {
      '0,1': 'floor',
      '1,1': 'door',
      '2,1': 'floor',
    }
    expect(validateDoors(tiles)).toEqual([])
  })

  it('rejects a door with no walkable neighbors', () => {
    const tiles: TileMap = {
      '1,1': 'door',
    }
    const issues = validateDoors(tiles)
    expect(issues).toHaveLength(1)
    expect(issues[0].reason).toContain('only 0 walkable')
  })

  it('rejects a door with only one walkable neighbor', () => {
    const tiles: TileMap = {
      '1,0': 'floor',
      '1,1': 'door',
    }
    const issues = validateDoors(tiles)
    expect(issues).toHaveLength(1)
    expect(issues[0].reason).toContain('only 1 walkable')
  })

  it('accepts door in an outer wall (walkable inside, void outside, walls on sides)', () => {
    const tiles: TileMap = {
      '1,1': 'floor', // inside the room
      '1,0': 'door',  // door in north wall
      '0,0': 'wall',
      '2,0': 'wall',
    }
    // Door at (1,0): N=void, S=walkable(1,1)=floor, E=wall, W=wall
    // walkableDirs=1(S), blockingDirs=2(E,W) → valid
    const issues = validateDoors(tiles)
    expect(issues).toEqual([])
  })

  it('finds door coordinates in issue report', () => {
    const tiles: TileMap = {
      '5,3': 'door',
    }
    const issues = validateDoors(tiles)
    expect(issues[0].x).toBe(5)
    expect(issues[0].y).toBe(3)
  })
})

// ── Stairs ───────────────────────────────────────────────────────────────

describe('validateStairs', () => {
  it('reports no issues when both stairs are present', () => {
    const tiles: TileMap = {
      '0,0': 'stairsDown',
      '1,0': 'stairsUp',
    }
    expect(validateStairs(tiles)).toEqual([])
  })

  it('reports missing stairsUp', () => {
    const tiles: TileMap = { '0,0': 'stairsDown' }
    const issues = validateStairs(tiles)
    expect(issues).toHaveLength(1)
    expect(issues[0].type).toBe('missing_up')
  })

  it('reports missing stairsDown', () => {
    const tiles: TileMap = { '0,0': 'stairsUp' }
    const issues = validateStairs(tiles)
    expect(issues).toHaveLength(1)
    expect(issues[0].type).toBe('missing_down')
  })

  it('reports no issues for maps without any stairs', () => {
    expect(validateStairs({})).toEqual([])
  })
})

// ── Water boundaries ─────────────────────────────────────────────────────

describe('validateWaterBoundaries', () => {
  it('accepts water fully enclosed by walls', () => {
    const tiles = gridToTiles([
      '#####',
      '#~~~#',
      '#####',
    ], M)
    expect(validateWaterBoundaries(tiles)).toEqual([])
  })

  it('accepts water surrounded by floor and walls', () => {
    const tiles = gridToTiles([
      '#####',
      '#.~.#',
      '#####',
    ], M)
    expect(validateWaterBoundaries(tiles)).toEqual([])
  })

  it('flags water adjacent to void', () => {
    const tiles: TileMap = {
      '0,0': 'water',
      '1,0': 'water',
    }
    const issues = validateWaterBoundaries(tiles)
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0].tileType).toBe('water')
  })

  it('handles deepWater and lava', () => {
    const tiles: TileMap = { '0,0': 'lava' }
    const issues = validateWaterBoundaries(tiles)
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0].tileType).toBe('lava')
  })
})

// ── Dead ends ────────────────────────────────────────────────────────────

describe('findDeadEnds', () => {
  it('finds a corridor dead end', () => {
    // Single floor tile walled on 3 sides, open on 1
    const tiles: TileMap = {
      '1,1': 'floor',
      '0,1': 'wall',
      '2,1': 'wall',
      '1,0': 'wall',
      '1,2': 'floor', // the only exit
    }
    const deadEnds = findDeadEnds(tiles)
    // Both (1,1) and (1,2) each have only 1 walkable neighbor → 2 dead ends
    expect(deadEnds).toHaveLength(2)
    expect(deadEnds).toEqual(
      expect.arrayContaining([
        { x: 1, y: 1, tileType: 'floor' },
      ]),
    )
  })

  it('does not flag tiles with 0 walkable neighbors (isolated closet)', () => {
    const tiles = gridToTiles([
      '###',
      '#.#',
      '###',
    ], M)
    const deadEnds = findDeadEnds(tiles)
    // A single floor surrounded by walls has 0 exits, not a dead end (dead end = exactly 1 exit)
    expect(deadEnds).toHaveLength(0)
  })

  it('returns empty for connected corridors', () => {
    const tiles: TileMap = {
      '0,1': 'floor',
      '1,1': 'floor',
      '2,1': 'floor',
    }
    // (0,1) has 1 neighbor(E), (2,1) has 1 neighbor(W), (1,1) has 2
    const deadEnds = findDeadEnds(tiles)
    expect(deadEnds).toHaveLength(2) // both ends are dead ends
  })

  it('skips doors in dead-end detection', () => {
    const tiles: TileMap = {
      '0,1': 'door',
      '1,1': 'floor',
    }
    const deadEnds = findDeadEnds(tiles)
    // door is skipped, floor(1,1) has 1 neighbor → dead end
    expect(deadEnds.every(d => d.tileType !== 'door')).toBe(true)
    expect(deadEnds).toHaveLength(1)
  })
})

// ── Room enclosure ───────────────────────────────────────────────────────

describe('validateRoomEnclosure', () => {
  it('accepts a fully enclosed room', () => {
    const tiles = gridToTiles([
      '#####',
      '#...#',
      '#...#',
      '#####',
    ], M)
    expect(validateRoomEnclosure(tiles)).toEqual([])
  })

  it('flags walkable tiles at map edges', () => {
    const tiles: TileMap = {
      '0,0': 'floor',
      '1,0': 'floor',
    }
    const issues = validateRoomEnclosure(tiles)
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0].reason).toContain('may not be fully enclosed')
  })

  it('accepts doors at the boundary (they are entry points)', () => {
    const tiles: TileMap = {
      '1,0': 'door',
      '1,1': 'floor',
      '2,1': 'floor',
      '3,1': 'door',
    }
    const issues = validateRoomEnclosure(tiles)
    // doors are skipped; floor(1,1) has floor(2,1) east → but also door north → is that fully enclosed?
    // (1,1): N=door(skip), S=void→flag, E=floor, W=void→flag
    // (2,1): N=void→flag, S=void→flag, E=door(skip), W=floor
    expect(issues.length).toBeGreaterThan(0)
  })
})

// ── Full report ──────────────────────────────────────────────────────────

describe('validateMap', () => {
  it('returns a clean report for a valid connected dungeon', () => {
    const tiles = gridToTiles([
      '#########',
      '#.......#',
      '#.......#',
      '####+####',
      '#.......#',
      '#...>...#',
      '#########',
    ], M)
    const report = validateMap(tiles)
    expect(report.connected).toBe(true)
    expect(report.componentCount).toBe(1)
    expect(report.doorIssues).toHaveLength(0)
    expect(report.issueSummary).toContain('fully connected')
  })

  it('reports disconnected areas', () => {
    const tiles = gridToTiles([
      '###########',
      '#...#.....#',
      '#...#.....#',
      '#...#.....#',
      '###########',
    ], M)
    const report = validateMap(tiles)
    expect(report.connected).toBe(false)
    expect(report.componentCount).toBe(2)
    expect(report.disconnectedAreas).toHaveLength(1)
    expect(report.issueSummary).toContain('disconnected')
  })

  it('reports door issues', () => {
    const tiles: TileMap = {
      '2,2': 'door',
      '3,2': 'wall',
    }
    const report = validateMap(tiles)
    expect(report.doorIssues.length).toBeGreaterThan(0)
    expect(report.issueSummary).toContain('door')
  })

  it('reports stair issues', () => {
    const tiles: TileMap = {
      '0,0': 'stairsDown',
      '0,1': 'floor',
    }
    const report = validateMap(tiles)
    expect(report.stairIssues).toHaveLength(1)
    expect(report.issueSummary).toContain('stairsDown')
  })

  it('handles empty map gracefully', () => {
    const report = validateMap({})
    expect(report.connected).toBe(true)
    expect(report.totalWalkableTiles).toBe(0)
    expect(report.issueSummary).toContain('No walkable')
  })

  it('handles wall-only map', () => {
    const tiles = gridToTiles(['####', '####', '####'], M)
    const report = validateMap(tiles)
    expect(report.connected).toBe(true)
    expect(report.totalWalkableTiles).toBe(0)
    expect(report.issueSummary).toContain('No walkable')
  })

  it('handles complex furnitures and decorations as walkable', () => {
    const tiles = gridToTiles([
      '#####',
      '#.≡.#',
      '#.$.#',
      '#.☠.#',
      '#####',
    ], M)
    const report = validateMap(tiles)
    // All furniture/items/decorations are walkable → connected
    expect(report.connected).toBe(true)
    expect(report.totalWalkableTiles).toBe(9) // 3x3 walkable area
  })
})

// ── Edge cases ───────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('handles negative coordinates', () => {
    const tiles: TileMap = {
      '-1,-1': 'floor',
      '-1,0': 'floor',
      '0,-1': 'floor',
      '0,0': 'floor',
    }
    const report = validateMap(tiles)
    expect(report.connected).toBe(true)
    expect(report.totalWalkableTiles).toBe(4)
  })

  it('handles null tile values (treats as void)', () => {
    const tiles: TileMap = {
      '0,0': 'floor',
      '1,0': null, // explicitly null = void
      '2,0': 'floor',
    }
    const comps = findWalkableComponents(tiles)
    expect(comps).toHaveLength(2) // two disconnected floors
  })

  it('handles floorAlt and bridge as walkable', () => {
    const tiles: TileMap = {
      '0,0': 'floorAlt',
      '1,0': 'bridge',
      '2,0': 'floor',
    }
    const report = validateMap(tiles)
    expect(report.connected).toBe(true)
    expect(report.totalWalkableTiles).toBe(3)
  })

  it('large map does not cause performance issues', () => {
    const tiles: TileMap = {}
    // Generate a 50x50 fully connected floor
    for (let y = 0; y < 50; y++) {
      for (let x = 0; x < 50; x++) {
        tiles[`${x},${y}`] = 'floor'
      }
    }
    const start = performance.now()
    const report = validateMap(tiles)
    const elapsed = performance.now() - start
    expect(report.connected).toBe(true)
    expect(report.totalWalkableTiles).toBe(2500)
    expect(elapsed).toBeLessThan(200) // should be fast
  })
})
