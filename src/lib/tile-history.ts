export type TileHistoryValue = string | null
export type TileHistoryInputValue = string | null | undefined
export type TileLayerTiles = Record<string, TileHistoryValue>
export type TileLayers = Record<string, TileLayerTiles>

export type TileEdit = {
  layerId: string
  key: string
  before: TileHistoryInputValue
  after: TileHistoryInputValue
}

export type TileDelta = {
  layerId: string
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
  return `${patch.layerId}\u0000${patch.key}`
}

function applyTileValue(layerTiles: TileLayerTiles, key: string, value: TileHistoryValue): TileLayerTiles {
  const nextLayerTiles = { ...layerTiles }
  if (value === null) {
    delete nextLayerTiles[key]
    return nextLayerTiles
  }

  nextLayerTiles[key] = value
  return nextLayerTiles
}

export function createTilePatch(edit: TileEdit): TilePatch {
  return {
    layerId: edit.layerId,
    key: edit.key,
    before: normalizeTileValue(edit.before),
    after: normalizeTileValue(edit.after),
  }
}

export function applyTilePatch(tiles: TileLayers, patch: TilePatch): TileLayers {
  return {
    ...tiles,
    [patch.layerId]: applyTileValue(tiles[patch.layerId] ?? {}, patch.key, patch.after),
  }
}

export function applyTileTransaction(tiles: TileLayers, transaction: TileTransaction): TileLayers {
  return transaction.patches.reduce(
    (nextTiles, patch) => applyTilePatch(nextTiles, patch),
    tiles,
  )
}

export function invertTilePatch(patch: TilePatch): TilePatch {
  return {
    layerId: patch.layerId,
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
