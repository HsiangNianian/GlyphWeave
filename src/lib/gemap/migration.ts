import { sha256 } from '@noble/hashes/sha2.js'

import { TILE_SURFACES } from '../render-surface'
import { buildGemapDocument } from './builder'
import { gemapFail } from './errors'
import type { GemapDocument, GemapVoxel } from './types'

const INT32_MIN = -2_147_483_648
const INT32_MAX = 2_147_483_647
const UINT32_MAX = 0xffff_ffff
const utf8Decoder = new TextDecoder('utf-8', { fatal: true })
const utf8Encoder = new TextEncoder()

export type LegacyTileMap = Record<string, string | null>

export type LegacyLayer = {
  id: string
  locked: boolean
  name: string
  visible: boolean
}

export type LegacyGemap = {
  layerTiles?: Record<string, LegacyTileMap>
  layers: LegacyLayer[]
  themeId?: string
  tileSize?: number
  tiles: LegacyTileMap
  version: 1 | 2
  worldName?: string
}

export type MigrationMode = 'flatten' | 'preserve-layers'

export type SkippedHiddenLayer = {
  id: string
  name: string
  tileCount: number
}

export type MigrationReport = {
  mode: MigrationMode
  outputVoxelCount: number
  overwrittenTileCount: number
  skippedHiddenLayers: SkippedHiddenLayer[]
  sourceVersion: 1 | 2
  unknownTileIds: string[]
}

export type MigrationMetadata = {
  layerZ?: Record<string, number>
  mode: MigrationMode
  sourceFormat: 'gemap-v1' | 'gemap-v2'
  sourceThemeId?: string
  sourceTileSize?: number
}

export type LegacyMigrationResult = {
  document: GemapDocument
  layerZ: Record<string, number>
  metadata: MigrationMetadata
  report: MigrationReport
  voxels: GemapVoxel[]
}

export type LegacyTileMapping =
  | { kind: 'air' }
  | { block: string; kind: 'known' | 'unknown' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalidLegacy(message: string): never {
  return gemapFail('migration.invalid_legacy', message)
}

function parseTileMap(value: unknown, field: string): LegacyTileMap {
  if (!isRecord(value)) invalidLegacy(`${field} must be an object`)
  const output: LegacyTileMap = Object.create(null) as LegacyTileMap
  for (const [coord, tile] of Object.entries(value)) {
    if (tile !== null && typeof tile !== 'string') {
      invalidLegacy(`${field}.${coord} must be a tile ID or null`)
    }
    output[coord] = tile
  }
  return output
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') invalidLegacy(`${field} must be a string when present`)
  return value
}

export function validateLegacyGemap(value: unknown): LegacyGemap {
  if (!isRecord(value)) invalidLegacy('legacy .gemap must be a JSON object')
  const hasTiles = Object.hasOwn(value, 'tiles')
  const hasLayerTiles = Object.hasOwn(value, 'layerTiles')
  if (!hasTiles && !hasLayerTiles) {
    invalidLegacy('legacy JSON has neither tiles nor layerTiles')
  }
  const sourceVersion = value.version === undefined || value.version === null ? 1 : value.version
  if (sourceVersion !== 1 && sourceVersion !== 2) {
    gemapFail('migration.unsupported_version', `unsupported legacy version: ${String(sourceVersion)}`)
  }

  const tiles = hasTiles ? parseTileMap(value.tiles, 'tiles') : {}
  let layerTiles: Record<string, LegacyTileMap> | undefined
  if (hasLayerTiles && value.layerTiles !== null && value.layerTiles !== undefined) {
    if (!isRecord(value.layerTiles)) invalidLegacy('layerTiles must be an object')
    layerTiles = Object.create(null) as Record<string, LegacyTileMap>
    for (const [layerId, layer] of Object.entries(value.layerTiles)) {
      layerTiles[layerId] = parseTileMap(layer, `layerTiles.${layerId}`)
    }
  }

  const rawLayers = value.layers === undefined ? [] : value.layers
  if (!Array.isArray(rawLayers)) invalidLegacy('layers must be an array')
  const layerIds = new Set<string>()
  const layers: LegacyLayer[] = rawLayers.map((layer, index) => {
    if (!isRecord(layer)) invalidLegacy(`layers[${index}] must be an object`)
    if (typeof layer.id !== 'string' || typeof layer.name !== 'string') {
      invalidLegacy(`layers[${index}] must contain string id and name fields`)
    }
    if (layerIds.has(layer.id)) {
      gemapFail('migration.duplicate_layer', `duplicate legacy layer ID: ${layer.id}`)
    }
    layerIds.add(layer.id)
    if (layer.visible !== undefined && typeof layer.visible !== 'boolean') {
      invalidLegacy(`layers[${index}].visible must be boolean`)
    }
    if (layer.locked !== undefined && typeof layer.locked !== 'boolean') {
      invalidLegacy(`layers[${index}].locked must be boolean`)
    }
    return {
      id: layer.id,
      locked: layer.locked === true,
      name: layer.name,
      visible: layer.visible !== false,
    }
  })

  let tileSize: number | undefined
  if (value.tileSize !== undefined && value.tileSize !== null) {
    if (
      !Number.isInteger(value.tileSize)
      || (value.tileSize as number) < 0
      || (value.tileSize as number) > UINT32_MAX
    ) {
      invalidLegacy('tileSize must be a uint32 when present')
    }
    tileSize = value.tileSize as number
  }

  return {
    layerTiles,
    layers,
    themeId: optionalString(value.themeId, 'themeId'),
    tileSize,
    tiles,
    version: sourceVersion,
    worldName: optionalString(value.worldName, 'worldName'),
  }
}

export function parseLegacyGemap(input: string | Uint8Array): LegacyGemap {
  let source: string
  try {
    source = typeof input === 'string' ? input : utf8Decoder.decode(input)
  } catch (error) {
    gemapFail('migration.invalid_json', 'legacy .gemap is not valid UTF-8', { cause: error })
  }
  let value: unknown
  try {
    value = JSON.parse(source) as unknown
  } catch (error) {
    gemapFail('migration.invalid_json', 'legacy .gemap is not valid JSON', { cause: error })
  }
  return validateLegacyGemap(value)
}

function normalizeLegacyId(id: string): string {
  const characters = [...id]
  let normalized = ''
  let pendingSeparator = false
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index]
    const isAsciiLetter = /^[A-Za-z]$/u.test(character)
    const isAsciiDigit = /^[0-9]$/u.test(character)
    if (isAsciiLetter || isAsciiDigit) {
      const previous = characters[index - 1]
      const next = characters[index + 1]
      const isUppercase = /^[A-Z]$/u.test(character)
      const wordBoundary = isUppercase && previous !== undefined && (
        /^[a-z0-9]$/u.test(previous)
        || (/^[A-Z]$/u.test(previous) && next !== undefined && /^[a-z]$/u.test(next))
      )
      if ((pendingSeparator || wordBoundary) && normalized !== '' && !normalized.endsWith('-')) {
        normalized += '-'
      }
      normalized += character.toLowerCase()
      pendingSeparator = false
    } else {
      pendingSeparator = normalized !== ''
    }
  }
  normalized = normalized.replace(/-+$/u, '')
  return normalized === '' ? `unknown-${sha256Prefix(id)}` : normalized
}

function bytesToHex(bytes: Uint8Array): string {
  let output = ''
  for (const byte of bytes) output += byte.toString(16).padStart(2, '0')
  return output
}

function sha256Prefix(value: string): string {
  return bytesToHex(sha256(utf8Encoder.encode(value))).slice(0, 8)
}

export function legacyTileMapping(tileId: string): LegacyTileMapping {
  if (tileId === 'void') return { kind: 'air' }
  const surface = TILE_SURFACES[tileId]
  const known = surface?.tileId === 'void' ? undefined : surface?.blockName
  return known === undefined
    ? { block: `legacy:${normalizeLegacyId(tileId)}`, kind: 'unknown' }
    : { block: known, kind: 'known' }
}

function effectiveLayers(legacy: LegacyGemap): LegacyLayer[] {
  if (legacy.layerTiles !== undefined) {
    const layers = [...legacy.layers]
    const declared = new Set(layers.map((layer) => layer.id))
    for (const id of Object.keys(legacy.layerTiles).sort()) {
      if (!declared.has(id)) layers.push({ id, locked: false, name: id, visible: true })
    }
    return layers
  }
  return legacy.layers.length === 0
    ? [{ id: 'layer-1', locked: false, name: 'Layer 1', visible: true }]
    : [...legacy.layers]
}

function tilesForLayer(legacy: LegacyGemap, layerId: string): LegacyTileMap {
  if (legacy.layerTiles !== undefined) return legacy.layerTiles[layerId] ?? {}
  const firstLayerId = legacy.layers[0]?.id ?? 'layer-1'
  return firstLayerId === layerId ? legacy.tiles : {}
}

function parseLegacyCoordinate(key: string): [number, number] {
  const parts = key.split(',')
  if (parts.length !== 2) {
    gemapFail('migration.invalid_coordinate', `invalid legacy coordinate: ${key}`)
  }
  const values = parts.map((part) => {
    const trimmed = part.trim()
    if (!/^[+-]?[0-9]+$/u.test(trimmed)) {
      gemapFail('migration.invalid_coordinate', `invalid legacy coordinate: ${key}`)
    }
    const value = Number(trimmed)
    if (!Number.isInteger(value) || value < INT32_MIN || value > INT32_MAX) {
      gemapFail('migration.invalid_coordinate', `legacy coordinate is outside i32: ${key}`)
    }
    return value
  })
  return [values[0], values[1]]
}

function isOccupied(tileId: string | null): tileId is string {
  return tileId !== null && tileId !== 'void'
}

function collisionSafeUnknownMappings(tileIds: ReadonlySet<string>): Map<string, string> {
  const byBase = new Map<string, string[]>()
  for (const tileId of tileIds) {
    const base = normalizeLegacyId(tileId)
    const group = byBase.get(base) ?? []
    group.push(tileId)
    byBase.set(base, group)
  }
  const output = new Map<string, string>()
  for (const [base, ids] of byBase) {
    for (const id of ids) {
      const suffix = ids.length > 1 ? `-${sha256Prefix(id)}` : ''
      output.set(id, `legacy:${base}${suffix}`)
    }
  }
  return output
}

function migrateLegacyValue(legacy: LegacyGemap, mode: MigrationMode): LegacyMigrationResult {
  if (mode !== 'flatten' && mode !== 'preserve-layers') {
    invalidLegacy(`unsupported migration mode: ${String(mode)}`)
  }
  const layers = effectiveLayers(legacy)
  const layerZ: Record<string, number> = {}
  const skippedHiddenLayers: SkippedHiddenLayer[] = []
  const rawVoxels = new Map<string, { coord: [number, number, number]; tileId: string }>()
  const unknownTileIds = new Set<string>()
  let overwrittenTileCount = 0

  for (let index = 0; index < layers.length; index += 1) {
    if (index > INT32_MAX) invalidLegacy('too many legacy layers for signed 32-bit z coordinates')
    const layer = layers[index]
    const tiles = tilesForLayer(legacy, layer.id)
    if (mode === 'flatten' && !layer.visible) {
      const tileCount = Object.values(tiles).filter(isOccupied).length
      if (tileCount > 0) skippedHiddenLayers.push({ id: layer.id, name: layer.name, tileCount })
      continue
    }
    const z = mode === 'flatten' ? 0 : index
    if (mode === 'preserve-layers') layerZ[layer.id] = z
    for (const [coordinate, tileId] of Object.entries(tiles).sort(([left], [right]) => (
      left < right ? -1 : left > right ? 1 : 0
    ))) {
      if (!isOccupied(tileId)) continue
      const [x, y] = parseLegacyCoordinate(coordinate)
      const targetKey = `${z},${x},${y}`
      if (mode === 'flatten' && rawVoxels.has(targetKey)) overwrittenTileCount += 1
      rawVoxels.set(targetKey, { coord: [z, x, y], tileId })
      if (legacyTileMapping(tileId).kind === 'unknown') unknownTileIds.add(tileId)
    }
  }

  const unknownMappings = collisionSafeUnknownMappings(unknownTileIds)
  const voxels: GemapVoxel[] = [...rawVoxels.values()].map(({ coord, tileId }) => {
    const mapping = legacyTileMapping(tileId)
    if (mapping.kind === 'air') throw new Error('air tile escaped migration filtering')
    return {
      block: mapping.kind === 'unknown' ? (unknownMappings.get(tileId) ?? mapping.block) : mapping.block,
      coord,
    }
  }).sort((left, right) => (
    left.coord[0] - right.coord[0]
    || left.coord[1] - right.coord[1]
    || left.coord[2] - right.coord[2]
    || left.block.localeCompare(right.block, 'en')
  ))

  const report: MigrationReport = {
    mode,
    outputVoxelCount: voxels.length,
    overwrittenTileCount,
    skippedHiddenLayers,
    sourceVersion: legacy.version,
    unknownTileIds: [...unknownTileIds].sort(),
  }
  const metadata: MigrationMetadata = {
    mode,
    sourceFormat: `gemap-v${legacy.version}`,
    ...(mode === 'preserve-layers' ? { layerZ: { ...layerZ } } : {}),
    ...(legacy.themeId === undefined ? {} : { sourceThemeId: legacy.themeId }),
    ...(legacy.tileSize === undefined ? {} : { sourceTileSize: legacy.tileSize }),
  }
  return {
    document: buildGemapDocument(legacy.worldName ?? 'Untitled', voxels),
    layerZ,
    metadata,
    report,
    voxels,
  }
}

export function migrateLegacyGemap(
  input: string | Uint8Array | LegacyGemap | unknown,
  mode: MigrationMode = 'flatten',
): LegacyMigrationResult {
  const legacy = typeof input === 'string' || input instanceof Uint8Array
    ? parseLegacyGemap(input)
    : validateLegacyGemap(input)
  return migrateLegacyValue(legacy, mode)
}
