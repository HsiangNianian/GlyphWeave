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

export const defaultTileBounds: TileBounds = {
  minX: 0,
  minY: 0,
  maxX: 0,
  maxY: 0,
  w: 1,
  h: 1,
}

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
