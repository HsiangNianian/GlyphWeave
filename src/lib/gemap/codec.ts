import { decodeChunkBlockIds } from './canonical'
import { GemapError, gemapFail } from './errors'
import type {
  GemapDocument,
  GemapManifest,
  GemapRegion,
  GemapRegionDocument,
  GemapVoxel,
  ReadGemapOptions,
} from './types'
import {
  localVoxelFromIndex,
  parseRegionKey,
  parseSectionKey,
  validateGemapDocument,
  validateGemapManifest,
  validateGemapRegion,
} from './validation'
import { readZipEntries, writeZipEntries } from './zip'

const utf8Decoder = new TextDecoder('utf-8', { fatal: true })
const utf8Encoder = new TextEncoder()

function decodeJson(entry: Uint8Array, location: string): unknown {
  if (entry[0] === 0xef && entry[1] === 0xbb && entry[2] === 0xbf) {
    gemapFail('encoding.invalid_utf8', `${location} must not contain a UTF-8 BOM`, { location })
  }
  let source: string
  try {
    source = utf8Decoder.decode(entry)
  } catch (error) {
    gemapFail('encoding.invalid_utf8', `${location} is not valid UTF-8`, {
      cause: error,
      location,
    })
  }
  try {
    return JSON.parse(source) as unknown
  } catch (error) {
    gemapFail('encoding.invalid_json', `${location} is not valid JSON`, {
      cause: error,
      location,
    })
  }
}

function compareUtf8(left: string, right: string): number {
  const leftBytes = utf8Encoder.encode(left)
  const rightBytes = utf8Encoder.encode(right)
  const length = Math.min(leftBytes.length, rightBytes.length)
  for (let index = 0; index < length; index += 1) {
    if (leftBytes[index] !== rightBytes[index]) return leftBytes[index] - rightBytes[index]
  }
  return leftBytes.length - rightBytes.length
}

function stableJsonValue(value: unknown, ancestors: Set<object>): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('non-finite numbers are not valid JSON')
    return JSON.stringify(value)
  }
  if (typeof value !== 'object') {
    throw new TypeError(`unsupported JSON value: ${typeof value}`)
  }
  if (ancestors.has(value)) throw new TypeError('cyclic values are not valid JSON')
  ancestors.add(value)
  let output: string
  if (Array.isArray(value)) {
    output = `[${value.map((item) => stableJsonValue(item, ancestors)).join(',')}]`
  } else {
    const record = value as Record<string, unknown>
    const entries = Object.keys(record)
      .sort(compareUtf8)
      .map((key) => `${JSON.stringify(key)}:${stableJsonValue(record[key], ancestors)}`)
    output = `{${entries.join(',')}}`
  }
  ancestors.delete(value)
  return output
}

export function stableJsonBytes(value: unknown): Uint8Array {
  return utf8Encoder.encode(`${stableJsonValue(value, new Set<object>())}\n`)
}

function requiredEntry(
  entries: ReadonlyMap<string, Uint8Array>,
  path: string,
): Uint8Array {
  const entry = entries.get(path)
  if (entry === undefined) {
    gemapFail('container.missing_entry', `required ZIP entry is missing: ${path}`, {
      location: path,
    })
  }
  return entry
}

export function readGemap(
  archive: Uint8Array,
  options?: ReadGemapOptions,
): GemapDocument {
  const entries = readZipEntries(archive, options?.limits)
  const manifestValue = decodeJson(requiredEntry(entries, 'manifest.json'), 'manifest.json')
  validateGemapManifest(manifestValue)
  const manifest: GemapManifest = manifestValue
  const regions: Record<string, GemapRegionDocument> = Object.create(null) as Record<
    string,
    GemapRegionDocument
  >

  for (const [regionKey, regionPath] of Object.entries(manifest.regions)) {
    const regionValue = decodeJson(requiredEntry(entries, regionPath), regionPath)
    validateGemapRegion(regionValue)
    const record: GemapRegion = regionValue
    const basePath = regionPath.slice(0, regionPath.lastIndexOf('/') + 1)
    const chunks: Record<string, Uint8Array> = Object.create(null) as Record<string, Uint8Array>
    for (const [chunkId, chunkRecord] of Object.entries(record.chunks)) {
      chunks[chunkId] = requiredEntry(entries, `${basePath}${chunkRecord.data}`)
    }
    const document = { chunks, record }
    regions[regionKey] = document
  }

  const document = { manifest, regions }
  validateGemapDocument(document)
  return document
}

export function writeGemap(document: GemapDocument): Uint8Array {
  validateGemapDocument(document)
  const entries: Array<readonly [string, {
    compression: 'deflate' | 'store'
    data: Uint8Array
  }]> = [[
    'manifest.json',
    { compression: 'deflate', data: stableJsonBytes(document.manifest) },
  ]]

  for (const [regionKey, regionPath] of Object.entries(document.manifest.regions)) {
    const regionDocument = document.regions[regionKey]
    entries.push([
      regionPath,
      { compression: 'deflate', data: stableJsonBytes(regionDocument.record) },
    ])
    const basePath = regionPath.slice(0, regionPath.lastIndexOf('/') + 1)
    for (const [chunkId, record] of Object.entries(regionDocument.record.chunks)) {
      entries.push([
        `${basePath}${record.data}`,
        { compression: 'store', data: regionDocument.chunks[chunkId] },
      ])
    }
  }
  return writeZipEntries(entries)
}

export function gemapVoxels(document: GemapDocument): GemapVoxel[] {
  validateGemapDocument(document)
  const output: GemapVoxel[] = []
  for (const [regionKey, regionDocument] of Object.entries(document.regions)) {
    const regionCoord = parseRegionKey(regionKey)
    if (regionCoord === undefined) throw new Error('validated region key became invalid')
    const [rx, ry] = regionCoord
    for (const [sectionKey, chunkId] of Object.entries(regionDocument.record.sections)) {
      const sectionCoord = parseSectionKey(sectionKey)
      if (sectionCoord === undefined) throw new Error('validated section key became invalid')
      const [cz, rcx, rcy] = sectionCoord
      const record = regionDocument.record.chunks[chunkId]
      const blockIds = decodeChunkBlockIds(record, regionDocument.chunks[chunkId])
      for (let index = 0; index < blockIds.length; index += 1) {
        const blockId = blockIds[index]
        if (blockId === 0) continue
        const [lz, lx, ly] = localVoxelFromIndex(index)
        const z = cz * 16 + lz
        const x = (rx * 32 + rcx) * 16 + lx
        const y = (ry * 32 + rcy) * 16 + ly
        const block = document.manifest.blockRegistry[String(blockId)]
        if (block === undefined) {
          gemapFail('semantic.invalid_chunk', `block ID ${blockId} is missing from the registry`)
        }
        output.push({ block, coord: [z, x, y] })
      }
    }
  }
  return output.sort((left, right) => (
    left.coord[0] - right.coord[0]
    || left.coord[1] - right.coord[1]
    || left.coord[2] - right.coord[2]
    || left.block.localeCompare(right.block, 'en')
  ))
}

export function gemapErrorCategory(error: unknown): string | undefined {
  return error instanceof GemapError ? error.category : undefined
}
