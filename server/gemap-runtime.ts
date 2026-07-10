/**
 * Cross-runtime API adapter around the shared TypeScript `.gemap` codec.
 *
 * Vite and Wrangler bundle this source directly. The production Node server
 * loads the Rollup entry emitted to `dist/server/gemap-runtime.mjs` by the
 * normal frontend build, so no second codec implementation is maintained.
 */
import { gemapVoxels, readGemap, writeGemap } from '../src/lib/gemap/codec'
import { migrateLegacyGemap } from '../src/lib/gemap/migration'
import { blockNameToTileToken } from '../src/lib/render-surface'
import type { GemapManifest, JsonValue } from '../src/lib/gemap/types'

export const API_GEMAP_ZIP_LIMITS = {
  maxCompressionRatio: 100,
  maxEntries: 1_024,
  maxEntryUncompressedBytes: 16 * 1024 * 1024,
  maxTotalUncompressedBytes: 64 * 1024 * 1024,
} as const

type FlatLegacyMap = {
  conversion?: unknown
  themeId?: unknown
  tiles?: unknown
  worldName?: unknown
}

export type RenderSlice = {
  themeId?: string
  tiles: Record<string, string>
  worldName: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function metadataThemeId(manifest: GemapManifest): string | undefined {
  const metadata = manifest.metadata
  if (!isRecord(metadata)) return undefined
  const appearance = metadata.appearance
  if (!isRecord(appearance)) return undefined
  return typeof appearance.themeId === 'string' && appearance.themeId.length > 0
    ? appearance.themeId
    : undefined
}

function jsonMetadataValue(value: unknown): JsonValue | undefined {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (Array.isArray(value)) {
    const result: JsonValue[] = []
    for (const item of value) {
      const normalized = jsonMetadataValue(item)
      if (normalized === undefined) return undefined
      result.push(normalized)
    }
    return result
  }
  if (!isRecord(value)) return undefined
  const result: Record<string, JsonValue> = {}
  for (const [key, item] of Object.entries(value)) {
    const normalized = jsonMetadataValue(item)
    if (normalized === undefined) return undefined
    result[key] = normalized
  }
  return result
}

/** Decode and project exactly one explicit z slice for the legacy renderer. */
export function decodeGemapSlice(archive: Uint8Array, z: number): RenderSlice {
  if (!Number.isInteger(z) || z < -2_147_483_648 || z > 2_147_483_647) {
    throw new RangeError('z must be a signed 32-bit integer')
  }
  const document = readGemap(archive, { limits: API_GEMAP_ZIP_LIMITS })
  const tiles: Record<string, string> = {}
  for (const voxel of gemapVoxels(document)) {
    if (voxel.coord[0] !== z) continue
    const tile = blockNameToTileToken(voxel.block)
    if (tile !== null) tiles[`${voxel.coord[1]},${voxel.coord[2]}`] = tile
  }
  return {
    themeId: metadataThemeId(document.manifest),
    tiles,
    worldName: document.manifest.world.name,
  }
}

/** Encode the converter's flat, legacy-shaped intermediate map as v3 ZIP. */
export function encodeConvertedMap(map: FlatLegacyMap): Uint8Array {
  if (!isRecord(map) || !isRecord(map.tiles)) {
    throw new TypeError('converted map must contain a flat tiles object')
  }

  const worldName = typeof map.worldName === 'string' && map.worldName.length > 0
    ? map.worldName
    : 'converted-image'
  const migration = migrateLegacyGemap({
    layers: [],
    themeId: typeof map.themeId === 'string' ? map.themeId : undefined,
    tiles: map.tiles,
    version: 2,
    worldName,
  })
  const document = migration.document
  const metadata: Record<string, JsonValue> = {
    migration: migration.metadata,
  }
  if (typeof map.themeId === 'string' && map.themeId.length > 0) {
    metadata.appearance = { themeId: map.themeId }
  }
  const conversion = jsonMetadataValue(map.conversion)
  if (conversion !== undefined) metadata.conversion = conversion
  if (Object.keys(metadata).length > 0) document.manifest.metadata = metadata
  return writeGemap(document)
}
