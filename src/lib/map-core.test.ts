import {
  buildVisibleTileChunkIndex,
  computeTileBounds,
  flattenLayerTiles,
  formatTileChunkKey,
  formatTileKey,
  iterateVisibleTileChunks,
  iterateVisibleTiles,
  parseTileKey,
  tileCoordToChunk,
  tileInRange,
  type LayerTileMap,
  type MapLayer,
} from './map-core'

type TestRunner = (name: string, fn: () => void) => void
type Matcher = {
  toBe: (expected: unknown) => void
  toEqual: (expected: unknown) => void
}
type TestGlobals = typeof globalThis & {
  describe?: TestRunner
  it?: TestRunner
  expect?: (actual: unknown) => Matcher
}

function stringify(value: unknown): string {
  return JSON.stringify(value)
}

function fallbackExpect(actual: unknown): Matcher {
  return {
    toBe: (expected) => {
      if (actual !== expected) {
        throw new Error(`Expected ${stringify(actual)} to be ${stringify(expected)}`)
      }
    },
    toEqual: (expected) => {
      if (stringify(actual) !== stringify(expected)) {
        throw new Error(`Expected ${stringify(actual)} to equal ${stringify(expected)}`)
      }
    },
  }
}

const testGlobals = globalThis as TestGlobals
const describeTest: TestRunner = testGlobals.describe ?? ((_name, fn) => fn())
const itTest: TestRunner = testGlobals.it ?? ((_name, fn) => fn())
const expectTest = testGlobals.expect ?? fallbackExpect

describeTest('map-core', () => {
  itTest('formats and parses negative tile keys', () => {
    expectTest(formatTileKey(-12, 34)).toBe('-12,34')
    expectTest(parseTileKey('-12,34')).toEqual({ x: -12, y: 34 })
  })

  itTest('computes bounds across negative coordinates', () => {
    expectTest(computeTileBounds({ '-2,5': 'wall', '3,-4': 'water' })).toEqual({
      minX: -2,
      minY: -4,
      maxX: 3,
      maxY: 5,
      w: 6,
      h: 10,
    })
  })

  itTest('returns default bounds for an empty map', () => {
    expectTest(computeTileBounds({})).toEqual({
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
      w: 1,
      h: 1,
    })
    expectTest(flattenLayerTiles({}, [])).toEqual({})
  })

  itTest('flattens layers from bottom to top', () => {
    const layers: MapLayer[] = [
      { id: 'ground', visible: true },
      { id: 'detail', visible: true },
    ]
    const layerTiles: LayerTileMap = {
      ground: {
        '0,0': 'floor',
        '-1,0': 'wall',
      },
      detail: {
        '0,0': 'water',
      },
    }

    expectTest(flattenLayerTiles(layerTiles, layers)).toEqual({
      '0,0': 'water',
      '-1,0': 'wall',
    })
  })

  itTest('skips visible=false layers when flattening and iterating', () => {
    const layers: MapLayer[] = [
      { id: 'ground', visible: true },
      { id: 'hidden', visible: false },
      { id: 'overlay' },
    ]
    const layerTiles: LayerTileMap = {
      ground: { '0,0': 'floor' },
      hidden: { '0,0': 'lava', '2,2': 'wall' },
      overlay: { '1,0': 'door' },
    }

    expectTest(flattenLayerTiles(layerTiles, layers)).toEqual({
      '0,0': 'floor',
      '1,0': 'door',
    })
    expectTest(Array.from(iterateVisibleTiles(layerTiles, layers))).toEqual([
      {
        key: 'ground:0,0',
        tileKey: '0,0',
        layerId: 'ground',
        gridX: 0,
        gridY: 0,
        tileTypeId: 'floor',
      },
      {
        key: 'overlay:1,0',
        tileKey: '1,0',
        layerId: 'overlay',
        gridX: 1,
        gridY: 0,
        tileTypeId: 'door',
      },
    ])
  })

  itTest('filters iterated tiles by inclusive visible range', () => {
    const layers: MapLayer[] = [{ id: 'ground', visible: true }]
    const layerTiles: LayerTileMap = {
      ground: {
        '-1,-1': 'floor',
        '0,0': 'wall',
        '2,0': 'water',
      },
    }

    expectTest(tileInRange({ x: -1, y: -1 }, { minX: -1, minY: -1, maxX: 0, maxY: 0 })).toBe(true)
    expectTest(Array.from(iterateVisibleTiles(layerTiles, layers, {
      range: { minX: -1, minY: -1, maxX: 0, maxY: 0 },
    }))).toEqual([
      {
        key: 'ground:-1,-1',
        tileKey: '-1,-1',
        layerId: 'ground',
        gridX: -1,
        gridY: -1,
        tileTypeId: 'floor',
      },
      {
        key: 'ground:0,0',
        tileKey: '0,0',
        layerId: 'ground',
        gridX: 0,
        gridY: 0,
        tileTypeId: 'wall',
      },
    ])
  })

  itTest('maps negative coordinates into stable tile chunks', () => {
    expectTest(tileCoordToChunk({ x: 0, y: 31 }, 32)).toEqual({ x: 0, y: 0 })
    expectTest(tileCoordToChunk({ x: 32, y: 32 }, 32)).toEqual({ x: 1, y: 1 })
    expectTest(tileCoordToChunk({ x: -1, y: -32 }, 32)).toEqual({ x: -1, y: -1 })
    expectTest(tileCoordToChunk({ x: -33, y: -33 }, 32)).toEqual({ x: -2, y: -2 })
    expectTest(formatTileChunkKey(-2, 3)).toBe('-2,3')
  })

  itTest('indexes visible tiles by chunk and filters ranges without scanning all chunks', () => {
    const layers: MapLayer[] = [
      { id: 'ground', visible: true },
      { id: 'hidden', visible: false },
      { id: 'overlay', visible: true },
    ]
    const layerTiles: LayerTileMap = {
      ground: {
        '0,0': 'floor',
        '31,31': 'wall',
        '32,0': 'water',
        '-1,-1': 'lava',
      },
      hidden: {
        '0,0': 'door',
      },
      overlay: {
        '0,0': 'grass',
      },
    }

    const index = buildVisibleTileChunkIndex(layerTiles, layers, 32)

    expectTest(Object.keys(index.chunks).sort()).toEqual(['-1,-1', '0,0', '1,0'])
    expectTest(index.chunks['0,0']?.map((tile) => tile.key)).toEqual([
      'ground:0,0',
      'ground:31,31',
      'overlay:0,0',
    ])
    expectTest(Array.from(iterateVisibleTileChunks(index, {
      range: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    })).map((tile) => tile.key)).toEqual([
      'ground:0,0',
      'overlay:0,0',
    ])
  })
})
