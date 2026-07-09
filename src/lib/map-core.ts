export type TileCoord = {
  x: number
  y: number
}

export type TileRange = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export type TileBounds = TileRange & {
  w: number
  h: number
}

export type TileValue = string | null | undefined
export type TileMap = Record<string, TileValue>
export type FlatTileMap = Record<string, string>
export type LayerTileMap = Record<string, TileMap>

export type MapLayer = {
  id: string
  visible?: boolean
}

export type VisibleTile = {
  key: string
  tileKey: string
  layerId: string
  gridX: number
  gridY: number
  tileTypeId: string
}

export type ComputeTileBoundsOptions = {
  emptyBounds?: TileBounds
}

export type IterateVisibleTilesOptions = {
  range?: TileRange
}

export type TileChunkCoord = {
  x: number
  y: number
}

export type VisibleTileChunkIndex = {
  chunkSize: number
  chunks: Record<string, VisibleTile[]>
}

export type IterateVisibleTileChunkOptions = {
  range?: TileRange
}

export const defaultTileBounds: TileBounds = {
  minX: 0,
  minY: 0,
  maxX: 0,
  maxY: 0,
  w: 1,
  h: 1,
}

export const DEFAULT_TILE_CHUNK_SIZE = 32

export function formatTileKey(x: number, y: number): string {
  return `${x},${y}`
}

export function parseTileKey(key: string): TileCoord {
  const [sx = '', sy = ''] = key.split(',', 2)
  return {
    x: Number.parseInt(sx, 10),
    y: Number.parseInt(sy, 10),
  }
}

export function tileInRange(coord: TileCoord, range: TileRange): boolean {
  return (
    coord.x >= range.minX &&
    coord.x <= range.maxX &&
    coord.y >= range.minY &&
    coord.y <= range.maxY
  )
}

export function tileCoordToChunk(
  coord: TileCoord,
  chunkSize: number = DEFAULT_TILE_CHUNK_SIZE,
): TileChunkCoord {
  return {
    x: Math.floor(coord.x / chunkSize),
    y: Math.floor(coord.y / chunkSize),
  }
}

export function formatTileChunkKey(x: number, y: number): string {
  return `${x},${y}`
}

export function computeTileBounds(
  tiles: Readonly<Record<string, unknown>>,
  options: ComputeTileBoundsOptions = {},
): TileBounds {
  const emptyBounds = options.emptyBounds ?? defaultTileBounds
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let hasTiles = false

  for (const key of Object.keys(tiles)) {
    const coord = parseTileKey(key)
    if (!Number.isFinite(coord.x) || !Number.isFinite(coord.y)) continue

    if (coord.x < minX) minX = coord.x
    if (coord.y < minY) minY = coord.y
    if (coord.x > maxX) maxX = coord.x
    if (coord.y > maxY) maxY = coord.y
    hasTiles = true
  }

  if (!hasTiles) return { ...emptyBounds }

  return {
    minX,
    minY,
    maxX,
    maxY,
    w: maxX - minX + 1,
    h: maxY - minY + 1,
  }
}

export function flattenLayerTiles(
  layerTiles: Readonly<LayerTileMap> | undefined,
  layers: readonly MapLayer[] | undefined,
): FlatTileMap {
  const result: FlatTileMap = {}
  if (!layerTiles || !layers) return result

  for (const layer of layers) {
    if (layer.visible === false) continue

    const tiles = layerTiles[layer.id]
    if (!tiles) continue

    for (const [key, tileTypeId] of Object.entries(tiles)) {
      if (tileTypeId) result[key] = tileTypeId
    }
  }

  return result
}

export function* iterateVisibleTiles(
  layerTiles: Readonly<LayerTileMap> | undefined,
  layers: readonly MapLayer[] | undefined,
  options: IterateVisibleTilesOptions = {},
): Generator<VisibleTile, void, unknown> {
  if (!layerTiles || !layers) return

  for (const layer of layers) {
    if (layer.visible === false) continue

    const tiles = layerTiles[layer.id]
    if (!tiles) continue

    for (const [tileKey, tileTypeId] of Object.entries(tiles)) {
      if (!tileTypeId) continue

      const coord = parseTileKey(tileKey)
      if (!Number.isFinite(coord.x) || !Number.isFinite(coord.y)) continue
      if (options.range && !tileInRange(coord, options.range)) continue

      yield {
        key: `${layer.id}:${tileKey}`,
        tileKey,
        layerId: layer.id,
        gridX: coord.x,
        gridY: coord.y,
        tileTypeId,
      }
    }
  }
}

export function buildVisibleTileChunkIndex(
  layerTiles: Readonly<LayerTileMap> | undefined,
  layers: readonly MapLayer[] | undefined,
  chunkSize: number = DEFAULT_TILE_CHUNK_SIZE,
): VisibleTileChunkIndex {
  const index: VisibleTileChunkIndex = {
    chunkSize,
    chunks: {},
  }

  for (const tile of iterateVisibleTiles(layerTiles, layers)) {
    const chunk = tileCoordToChunk({ x: tile.gridX, y: tile.gridY }, chunkSize)
    const chunkKey = formatTileChunkKey(chunk.x, chunk.y)
    index.chunks[chunkKey] ??= []
    index.chunks[chunkKey].push(tile)
  }

  return index
}

export function* iterateVisibleTileChunks(
  index: VisibleTileChunkIndex,
  options: IterateVisibleTileChunkOptions = {},
): Generator<VisibleTile, void, unknown> {
  const range = options.range
  if (!range) {
    for (const chunkTiles of Object.values(index.chunks)) {
      yield* chunkTiles
    }
    return
  }

  const minChunk = tileCoordToChunk({ x: range.minX, y: range.minY }, index.chunkSize)
  const maxChunk = tileCoordToChunk({ x: range.maxX, y: range.maxY }, index.chunkSize)

  for (let cy = minChunk.y; cy <= maxChunk.y; cy++) {
    for (let cx = minChunk.x; cx <= maxChunk.x; cx++) {
      const chunkTiles = index.chunks[formatTileChunkKey(cx, cy)]
      if (!chunkTiles) continue

      for (const tile of chunkTiles) {
        if (!tileInRange({ x: tile.gridX, y: tile.gridY }, range)) continue
        yield tile
      }
    }
  }
}
