import { describe, expect, it } from 'vitest'

import {
  applyTilePatch,
  applyTileTransaction,
  compactTileTransaction,
  createTilePatch,
  invertTileTransaction,
  mergeStrokeTransaction,
  type TileTransaction,
} from './tile-history'

describe('tile-history', () => {
  it('creates and applies set patches without mutating source tiles', () => {
    const tiles = { 'z:0': {} }
    const patch = createTilePatch({
      sliceId: 'z:0',
      key: '0,0',
      before: null,
      after: 'wall',
    })

    const nextTiles = applyTilePatch(tiles, patch)

    expect(patch).toEqual({
      sliceId: 'z:0',
      key: '0,0',
      before: null,
      after: 'wall',
    })
    expect(nextTiles).toEqual({ 'z:0': { '0,0': 'wall' } })
    expect(tiles).toEqual({ 'z:0': {} })
  })

  it('deletes tiles when after is null or void', () => {
    const tiles = { 'z:0': { '0,0': 'wall', '1,0': 'floor' } }
    const nullPatch = createTilePatch({
      sliceId: 'z:0',
      key: '0,0',
      before: 'wall',
      after: null,
    })
    const voidPatch = createTilePatch({
      sliceId: 'z:0',
      key: '0,0',
      before: 'wall',
      after: 'void',
    })

    expect(applyTilePatch(tiles, nullPatch)).toEqual({
      'z:0': { '1,0': 'floor' },
    })
    expect(applyTilePatch(tiles, voidPatch)).toEqual({
      'z:0': { '1,0': 'floor' },
    })
    expect(voidPatch).toEqual({
      sliceId: 'z:0',
      key: '0,0',
      before: 'wall',
      after: null,
    })
    expect(tiles).toEqual({ 'z:0': { '0,0': 'wall', '1,0': 'floor' } })
  })

  it('undoes and redoes a transaction through inverted patches', () => {
    const transaction: TileTransaction = {
      patches: [
        createTilePatch({
          sliceId: 'z:0',
          key: '0,0',
          before: 'wall',
          after: 'water',
        }),
        createTilePatch({
          sliceId: 'z:1',
          key: '2,0',
          before: 'floor',
          after: null,
        }),
      ],
    }
    const tiles = {
      'z:0': { '0,0': 'wall' },
      'z:1': { '2,0': 'floor', '3,0': 'door' },
    }

    const redoneTiles = applyTileTransaction(tiles, transaction)
    const undoneTiles = applyTileTransaction(redoneTiles, invertTileTransaction(transaction))
    const redoneAgainTiles = applyTileTransaction(undoneTiles, transaction)

    expect(redoneTiles).toEqual({
      'z:0': { '0,0': 'water' },
      'z:1': { '3,0': 'door' },
    })
    expect(undoneTiles).toEqual(tiles)
    expect(redoneAgainTiles).toEqual(redoneTiles)
  })

  it('compacts a stroke to the first before and last after per layer/key', () => {
    let transaction: TileTransaction = { patches: [] }

    transaction = mergeStrokeTransaction(
      transaction,
      createTilePatch({ sliceId: 'z:0', key: '0,0', before: null, after: 'wall' }),
    )
    transaction = mergeStrokeTransaction(
      transaction,
      createTilePatch({ sliceId: 'z:0', key: '0,0', before: 'wall', after: 'water' }),
    )
    transaction = mergeStrokeTransaction(
      transaction,
      createTilePatch({ sliceId: 'z:0', key: '1,0', before: null, after: 'floor' }),
    )
    transaction = mergeStrokeTransaction(
      transaction,
      createTilePatch({ sliceId: 'z:1', key: '0,0', before: null, after: 'door' }),
    )
    transaction = mergeStrokeTransaction(
      transaction,
      createTilePatch({ sliceId: 'z:0', key: '0,0', before: 'water', after: 'lava' }),
    )

    expect(transaction).toEqual({
      patches: [
        { sliceId: 'z:0', key: '0,0', before: null, after: 'lava' },
        { sliceId: 'z:0', key: '1,0', before: null, after: 'floor' },
        { sliceId: 'z:1', key: '0,0', before: null, after: 'door' },
      ],
    })
  })

  it('drops compacted stroke patches with no net tile change', () => {
    const transaction = compactTileTransaction({
      patches: [
        createTilePatch({ sliceId: 'z:0', key: '0,0', before: 'wall', after: 'floor' }),
        createTilePatch({ sliceId: 'z:0', key: '0,0', before: 'floor', after: 'wall' }),
      ],
    })

    expect(transaction).toEqual({ patches: [] })
  })

  it('keeps deletions scoped to the requested layer', () => {
    const tiles = {
      'z:0': { '0,0': 'wall' },
      'z:1': { '0,0': 'water' },
    }
    const nextTiles = applyTilePatch(
      tiles,
      createTilePatch({ sliceId: 'z:1', key: '0,0', before: 'water', after: null }),
    )

    expect(nextTiles).toEqual({
      'z:0': { '0,0': 'wall' },
      'z:1': {},
    })
    expect(tiles).toEqual({
      'z:0': { '0,0': 'wall' },
      'z:1': { '0,0': 'water' },
    })
  })

  it('creates a missing layer when applying a set patch', () => {
    const nextTiles = applyTilePatch(
      {},
      createTilePatch({ sliceId: 'z:0', key: '0,0', before: null, after: 'wall' }),
    )

    expect(nextTiles).toEqual({ 'z:0': { '0,0': 'wall' } })
  })
})
