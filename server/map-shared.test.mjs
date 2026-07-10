import { describe, expect, it } from 'vitest'

import { computeBounds, flattenTiles } from './map-shared.mjs'

describe('computeBounds', () => {
  it('returns a one-cell origin box for empty maps', () => {
    expect(computeBounds({})).toEqual({
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
      w: 1,
      h: 1,
    })
  })

  it('computes inclusive bounds across negative and positive tile coordinates', () => {
    expect(computeBounds({
      '-2,3': 'water',
      '4,-1': 'wall',
      '0,0': 'floor',
    })).toEqual({
      minX: -2,
      minY: -1,
      maxX: 4,
      maxY: 3,
      w: 7,
      h: 5,
    })
  })
})

describe('flattenTiles', () => {
  it('returns a defensive copy for already serialized tile maps', () => {
    const tiles = { '1,2': 'door' }
    const result = flattenTiles({ tiles })

    expect(result).toEqual(tiles)
    expect(result).not.toBe(tiles)
  })

  it('flattens visible layers in order while skipping hidden layers and empty tiles', () => {
    expect(flattenTiles({
      layers: [
        { id: 'terrain' },
        { id: 'hidden', visible: false },
        { id: 'overlay' },
      ],
      layerTiles: {
        terrain: {
          '0,0': 'floor',
          '1,0': 'water',
        },
        hidden: {
          '0,0': 'lava',
        },
        overlay: {
          '1,0': 'wall',
          '2,0': '',
          '3,0': 'void',
        },
      },
    })).toEqual({
      '0,0': 'floor',
      '1,0': 'wall',
    })
  })
})
