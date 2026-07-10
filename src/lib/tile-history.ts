export type TileHistoryValue = string | null
export type TileHistoryInputValue = string | null | undefined
export type TileSliceTiles = Record<string, TileHistoryValue>
export type TileSlices = Record<string, TileSliceTiles>

export type TileEdit = {
  sliceId: string
  key: string
  before: TileHistoryInputValue
  after: TileHistoryInputValue
}

export type TileDelta = {
  sliceId: string
  key: string
  before: TileHistoryValue
  after: TileHistoryValue
}

export type TilePatch = TileDelta

export type TileTransaction = {
  patches: TilePatch[]
}

function normalizeTileValue(value: TileHistoryInputValue): TileHistoryValue {
  return value === null || value === undefined || value === 'void' ? null : value
}

function transactionKey(patch: TilePatch): string {
  return `${patch.sliceId}\u0000${patch.key}`
}

function applyTileValue(sliceTiles: TileSliceTiles, key: string, value: TileHistoryValue): TileSliceTiles {
  const nextSliceTiles = { ...sliceTiles }
  if (value === null) {
    delete nextSliceTiles[key]
    return nextSliceTiles
  }

  nextSliceTiles[key] = value
  return nextSliceTiles
}

export function createTilePatch(edit: TileEdit): TilePatch {
  return {
    sliceId: edit.sliceId,
    key: edit.key,
    before: normalizeTileValue(edit.before),
    after: normalizeTileValue(edit.after),
  }
}

export function applyTilePatch(tiles: TileSlices, patch: TilePatch): TileSlices {
  return {
    ...tiles,
    [patch.sliceId]: applyTileValue(tiles[patch.sliceId] ?? {}, patch.key, patch.after),
  }
}

export function applyTileTransaction(tiles: TileSlices, transaction: TileTransaction): TileSlices {
  return transaction.patches.reduce(
    (nextTiles, patch) => applyTilePatch(nextTiles, patch),
    tiles,
  )
}

export function invertTilePatch(patch: TilePatch): TilePatch {
  return {
    sliceId: patch.sliceId,
    key: patch.key,
    before: patch.after,
    after: patch.before,
  }
}

export function invertTileTransaction(transaction: TileTransaction): TileTransaction {
  return {
    patches: transaction.patches.map(invertTilePatch).reverse(),
  }
}

export function compactTileTransaction(transaction: TileTransaction): TileTransaction {
  const compacted = new Map<string, TilePatch>()

  for (const patch of transaction.patches) {
    const key = transactionKey(patch)
    const existingPatch = compacted.get(key)
    const nextPatch = existingPatch
      ? { ...existingPatch, after: patch.after }
      : patch

    if (nextPatch.before === nextPatch.after) {
      compacted.delete(key)
    } else {
      compacted.set(key, nextPatch)
    }
  }

  return { patches: [...compacted.values()] }
}

export function mergeStrokeTransaction(
  transaction: TileTransaction,
  patch: TilePatch,
): TileTransaction {
  return compactTileTransaction({
    patches: [...transaction.patches, patch],
  })
}
