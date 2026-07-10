import { GEMAP_CHUNK_VOLUME } from './bitpack'
import { canonicalizeChunk, decodeChunkBlockIds, minimumPaletteBits } from './canonical'
import { gemapFail } from './errors'
import type {
  GemapChunkRecord,
  GemapDocument,
  GemapManifest,
  GemapRegion,
  GemapRegionDocument,
} from './types'
import { isSafeZipEntryName } from './zip'

const BLOCK_NAME_PATTERN = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/u
const CHUNK_ID_PATTERN = /^[0-9a-f]{64}$/u
const SIGNED_INTEGER_PATTERN = /^(?:0|-?[1-9][0-9]*)$/u
const UINT32_KEY_PATTERN = /^(?:0|[1-9][0-9]*)$/u
const UINT32_MAX = 0xffff_ffff
const REGION_MIN = -4_194_304
const REGION_MAX = 4_194_303
const CHUNK_COORD_MIN = -134_217_728
const CHUNK_COORD_MAX = 134_217_727

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function schemaManifest(message: string): never {
  return gemapFail('schema.invalid_manifest', message)
}

function schemaRegion(message: string): never {
  return gemapFail('schema.invalid_region', message)
}

function parseCanonicalInteger(text: string, minimum: number, maximum: number): number | undefined {
  if (!SIGNED_INTEGER_PATTERN.test(text)) return undefined
  const value = Number(text)
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum
    ? value
    : undefined
}

export function isValidBlockName(name: string): boolean {
  if (!BLOCK_NAME_PATTERN.test(name)) return false
  const separator = name.indexOf(':')
  const path = name.slice(separator + 1)
  return path.split('/').every((segment) => (
    segment !== '' && segment !== '.' && segment !== '..'
  ))
}

export function parseRegionKey(key: string): [number, number] | undefined {
  const parts = key.split(',')
  if (parts.length !== 2) return undefined
  const rx = parseCanonicalInteger(parts[0], REGION_MIN, REGION_MAX)
  const ry = parseCanonicalInteger(parts[1], REGION_MIN, REGION_MAX)
  return rx === undefined || ry === undefined ? undefined : [rx, ry]
}

export function parseSectionKey(key: string): [number, number, number] | undefined {
  const parts = key.split(',')
  if (parts.length !== 3) return undefined
  const cz = parseCanonicalInteger(parts[0], CHUNK_COORD_MIN, CHUNK_COORD_MAX)
  const rcx = parseCanonicalInteger(parts[1], 0, 31)
  const rcy = parseCanonicalInteger(parts[2], 0, 31)
  return cz === undefined || rcx === undefined || rcy === undefined
    ? undefined
    : [cz, rcx, rcy]
}

export function canonicalRegionPath(rx: number, ry: number): string {
  return `regions/${rx}.${ry}/region.json`
}

export function validateGemapManifest(value: unknown): asserts value is GemapManifest {
  if (!isRecord(value)) schemaManifest('manifest must be a JSON object')
  if (value.format !== 'glyphweave-map') schemaManifest('manifest format must be glyphweave-map')
  if (value.version !== 3) schemaManifest('manifest version must be 3')
  if (!isRecord(value.world) || typeof value.world.name !== 'string' || value.world.name.length === 0) {
    schemaManifest('manifest world.name must be a non-empty string')
  }
  if (value.axisOrder !== 'z,x,y') schemaManifest('manifest axisOrder must be z,x,y')
  if (
    !Array.isArray(value.chunkShape)
    || value.chunkShape.length !== 3
    || value.chunkShape[0] !== 16
    || value.chunkShape[1] !== 16
    || value.chunkShape[2] !== 16
  ) {
    schemaManifest('manifest chunkShape must be [16,16,16]')
  }
  if (
    !Array.isArray(value.regionShape)
    || value.regionShape.length !== 3
    || value.regionShape[0] !== 'infinite'
    || value.regionShape[1] !== 32
    || value.regionShape[2] !== 32
  ) {
    schemaManifest('manifest regionShape must be ["infinite",32,32]')
  }
  for (const forbidden of ['tiles', 'layerTiles', 'layers', 'tileSize', 'themeId']) {
    if (forbidden in value) schemaManifest(`legacy field ${forbidden} is forbidden in v3`)
  }
  if (!isRecord(value.blockRegistry)) schemaManifest('manifest blockRegistry must be an object')
  if (value.blockRegistry['0'] !== 'glyphweave:air') {
    schemaManifest('block registry ID 0 must be glyphweave:air')
  }
  const blockNames = new Set<string>()
  for (const [key, blockName] of Object.entries(value.blockRegistry)) {
    if (!UINT32_KEY_PATTERN.test(key)) schemaManifest(`invalid block registry key: ${key}`)
    const blockId = Number(key)
    if (!Number.isSafeInteger(blockId) || blockId < 0 || blockId > UINT32_MAX) {
      schemaManifest(`block registry key is outside uint32: ${key}`)
    }
    if (typeof blockName !== 'string' || !isValidBlockName(blockName)) {
      schemaManifest(`invalid namespaced block name for registry key ${key}`)
    }
    if (blockNames.has(blockName)) schemaManifest(`duplicate block name: ${blockName}`)
    blockNames.add(blockName)
  }
  if (!isRecord(value.regions)) schemaManifest('manifest regions must be an object')
  for (const [key, path] of Object.entries(value.regions)) {
    const coord = parseRegionKey(key)
    if (coord === undefined) schemaManifest(`invalid region key: ${key}`)
    if (typeof path === 'string' && !isSafeZipEntryName(path)) {
      gemapFail('container.unsafe_path', `unsafe region entry path: ${path}`, { location: path })
    }
    if (typeof path !== 'string' || path !== canonicalRegionPath(coord[0], coord[1])) {
      gemapFail('semantic.invalid_manifest', `region path does not match key ${key}`)
    }
  }
  if (value.metadata !== undefined && !isRecord(value.metadata)) {
    schemaManifest('manifest metadata must be an object when present')
  }
}

function validateChunkRecordShape(chunkId: string, value: unknown): asserts value is GemapChunkRecord {
  if (!CHUNK_ID_PATTERN.test(chunkId)) schemaRegion(`invalid chunk ID: ${chunkId}`)
  if (!isRecord(value)) schemaRegion(`chunk ${chunkId} must be an object`)
  if (!Number.isInteger(value.bits) || (value.bits as number) < 1 || (value.bits as number) > 12) {
    schemaRegion(`chunk ${chunkId} bits must be an integer from 1 to 12`)
  }
  if (!Array.isArray(value.palette) || value.palette.length < 1 || value.palette.length > 4096) {
    schemaRegion(`chunk ${chunkId} palette must contain 1 to 4096 IDs`)
  }
  for (const blockId of value.palette) {
    if (!Number.isInteger(blockId) || blockId < 0 || blockId > UINT32_MAX) {
      schemaRegion(`chunk ${chunkId} palette contains a non-uint32 block ID`)
    }
  }
  if (typeof value.data !== 'string') schemaRegion(`chunk ${chunkId} data must be a path`)
  if ('refCount' in value || 'subpalette' in value) {
    schemaRegion(`chunk ${chunkId} contains a forbidden legacy field`)
  }
}

export function validateGemapRegion(value: unknown): asserts value is GemapRegion {
  if (!isRecord(value)) schemaRegion('region must be a JSON object')
  if (value.format !== 'glyphweave-region') schemaRegion('region format must be glyphweave-region')
  if (value.version !== 1) schemaRegion('region version must be 1')
  if (
    !Array.isArray(value.region)
    || value.region.length !== 2
    || !value.region.every((coord) => (
      Number.isInteger(coord) && coord >= REGION_MIN && coord <= REGION_MAX
    ))
  ) {
    schemaRegion('region coordinate must contain two valid region integers')
  }
  if (!isRecord(value.sections)) schemaRegion('region sections must be an object')
  for (const [key, chunkId] of Object.entries(value.sections)) {
    if (parseSectionKey(key) === undefined) schemaRegion(`invalid section key: ${key}`)
    if (typeof chunkId !== 'string' || !CHUNK_ID_PATTERN.test(chunkId)) {
      schemaRegion(`invalid chunk ID referenced by section ${key}`)
    }
  }
  if (!isRecord(value.chunks)) schemaRegion('region chunks must be an object')
  for (const [chunkId, record] of Object.entries(value.chunks)) {
    validateChunkRecordShape(chunkId, record)
  }
}

function validateCanonicalChunk(
  manifest: GemapManifest,
  chunkId: string,
  record: GemapChunkRecord,
  packed: Uint8Array,
): void {
  if (record.data !== `chunks/${chunkId}.bin`) {
    gemapFail('semantic.invalid_chunk', `chunk ${chunkId} data path is not canonical`)
  }
  if (record.palette.length === 1 && record.palette[0] === 0) {
    gemapFail('semantic.invalid_chunk', `air-only chunk ${chunkId} must not be persisted`)
  }
  for (let index = 0; index < record.palette.length; index += 1) {
    const blockId = record.palette[index]
    if (index > 0 && record.palette[index - 1] >= blockId) {
      gemapFail('semantic.invalid_chunk', `chunk ${chunkId} palette must be strictly increasing`)
    }
    if (!(String(blockId) in manifest.blockRegistry)) {
      gemapFail('semantic.invalid_chunk', `chunk ${chunkId} uses unregistered block ID ${blockId}`)
    }
  }
  if (record.bits !== minimumPaletteBits(record.palette.length)) {
    gemapFail('semantic.invalid_chunk', `chunk ${chunkId} does not use minimum palette bits`)
  }

  const blockIds = decodeChunkBlockIds(record, packed)
  const used = new Set(blockIds)
  if (used.size !== record.palette.length || record.palette.some((blockId) => !used.has(blockId))) {
    gemapFail('semantic.invalid_chunk', `chunk ${chunkId} palette contains unused entries`)
  }
  const canonical = canonicalizeChunk(blockIds)
  if (canonical.id !== chunkId) {
    gemapFail(
      'integrity.chunk_hash_mismatch',
      `chunk ${chunkId} canonical BLAKE3 ID is ${canonical.id}`,
    )
  }
}

export function validateGemapRegionDocument(
  manifest: GemapManifest,
  regionKey: string,
  regionPath: string,
  document: GemapRegionDocument,
): void {
  validateGemapRegion(document.record)
  const coordinate = parseRegionKey(regionKey)
  if (coordinate === undefined) {
    gemapFail('semantic.invalid_manifest', `invalid region key ${regionKey}`)
  }
  if (regionPath !== canonicalRegionPath(coordinate[0], coordinate[1])) {
    gemapFail('semantic.invalid_manifest', `region path does not match ${regionKey}`)
  }
  if (
    document.record.region[0] !== coordinate[0]
    || document.record.region[1] !== coordinate[1]
  ) {
    gemapFail('semantic.invalid_region', `region record coordinate does not match ${regionKey}`)
  }

  const referenceCounts = new Map<string, number>()
  for (const [sectionKey, chunkId] of Object.entries(document.record.sections)) {
    if (!(chunkId in document.record.chunks)) {
      gemapFail('semantic.invalid_region', `section ${sectionKey} references missing chunk ${chunkId}`)
    }
    referenceCounts.set(chunkId, (referenceCounts.get(chunkId) ?? 0) + 1)
  }
  for (const [chunkId, record] of Object.entries(document.record.chunks)) {
    if (!referenceCounts.has(chunkId)) {
      gemapFail('semantic.invalid_region', `orphan chunk record ${chunkId} is not canonical`)
    }
    const packed = document.chunks[chunkId]
    if (!(packed instanceof Uint8Array)) {
      gemapFail('container.missing_entry', `binary entry is missing for chunk ${chunkId}`)
    }
    validateCanonicalChunk(manifest, chunkId, record, packed)
  }
}

export function validateGemapDocument(document: GemapDocument): void {
  validateGemapManifest(document.manifest)
  const expectedKeys = Object.keys(document.manifest.regions).sort()
  const actualKeys = Object.keys(document.regions).sort()
  if (
    expectedKeys.length !== actualKeys.length
    || expectedKeys.some((key, index) => key !== actualKeys[index])
  ) {
    gemapFail('semantic.invalid_manifest', 'document regions do not match manifest regions')
  }
  for (const key of expectedKeys) {
    const regionDocument = document.regions[key]
    if (
      typeof regionDocument !== 'object'
      || regionDocument === null
      || typeof regionDocument.record !== 'object'
      || regionDocument.record === null
      || typeof regionDocument.chunks !== 'object'
      || regionDocument.chunks === null
    ) {
      gemapFail('semantic.invalid_manifest', `document region ${key} is missing or invalid`)
    }
    validateGemapRegionDocument(
      document.manifest,
      key,
      document.manifest.regions[key],
      regionDocument,
    )
  }
}

export function localVoxelIndex(lz: number, lx: number, ly: number): number {
  if ([lz, lx, ly].some((coord) => !Number.isInteger(coord) || coord < 0 || coord >= 16)) {
    throw new RangeError('local voxel coordinates must be integers from 0 to 15')
  }
  return ((lz * 16) + ly) * 16 + lx
}

export function localVoxelFromIndex(index: number): [number, number, number] {
  if (!Number.isInteger(index) || index < 0 || index >= GEMAP_CHUNK_VOLUME) {
    throw new RangeError(`voxel index must be from 0 to ${GEMAP_CHUNK_VOLUME - 1}`)
  }
  const lx = index % 16
  const quotient = Math.floor(index / 16)
  const ly = quotient % 16
  const lz = Math.floor(quotient / 16)
  return [lz, lx, ly]
}
