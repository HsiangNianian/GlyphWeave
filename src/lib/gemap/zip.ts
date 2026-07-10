import { Inflate, zipSync, type Zippable } from 'fflate'

import { GemapError, gemapFail } from './errors'
import type { ZipResourceLimits } from './types'

const CENTRAL_DIRECTORY_SIGNATURE = 0x0201_4b50
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x0605_4b50
const LOCAL_FILE_SIGNATURE = 0x0403_4b50
const UINT16_MAX = 0xffff
const UINT32_MAX = 0xffff_ffff
const fixedZipTime = new Date(1980, 0, 1, 0, 0, 0)
const utf8Decoder = new TextDecoder('utf-8', { fatal: true })
const utf8Encoder = new TextEncoder()

export const DEFAULT_ZIP_RESOURCE_LIMITS: ZipResourceLimits = {
  maxCompressionRatio: 1_000,
  maxEntries: 4_096,
  maxEntryUncompressedBytes: 64 * 1024 * 1024,
  maxTotalUncompressedBytes: 512 * 1024 * 1024,
}

export type ZipEntryCompression = 'deflate' | 'store'

export type ZipWriteEntry = {
  data: Uint8Array
  compression?: ZipEntryCompression
}

type CentralEntry = {
  centralOffset: number
  compressedSize: number
  compression: number
  crc32: number
  externalAttributes: number
  flags: number
  localOffset: number
  madeByOs: number
  name: string
  nameBytes: Uint8Array
  uncompressedSize: number
}

function readUint16(data: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > data.length) {
    gemapFail('container.invalid_zip', 'ZIP structure is truncated')
  }
  return data[offset] | (data[offset + 1] << 8)
}

function readUint32(data: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > data.length) {
    gemapFail('container.invalid_zip', 'ZIP structure is truncated')
  }
  return (
    data[offset]
    | (data[offset + 1] << 8)
    | (data[offset + 2] << 16)
    | (data[offset + 3] << 24)
  ) >>> 0
}

function byteArraysEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

function compareEntryNames(left: string, right: string): number {
  const leftBytes = utf8Encoder.encode(left)
  const rightBytes = utf8Encoder.encode(right)
  const length = Math.min(leftBytes.length, rightBytes.length)
  for (let index = 0; index < length; index += 1) {
    if (leftBytes[index] !== rightBytes[index]) return leftBytes[index] - rightBytes[index]
  }
  return leftBytes.length - rightBytes.length
}

export function isSafeZipEntryName(name: string): boolean {
  if (
    name.length === 0
    || name.startsWith('/')
    || name.includes('\\')
    || name.includes('\0')
    || /^[a-zA-Z]:/u.test(name)
  ) {
    return false
  }
  const parts = name.split('/')
  return !parts.some((part) => part === '' || part === '.' || part === '..')
}

function validateEntryName(name: string): void {
  if (!isSafeZipEntryName(name)) {
    gemapFail('container.unsafe_path', `unsafe ZIP entry path: ${JSON.stringify(name)}`, {
      location: name,
    })
  }
}

function limitsWithDefaults(overrides?: Partial<ZipResourceLimits>): ZipResourceLimits {
  const limits = { ...DEFAULT_ZIP_RESOURCE_LIMITS, ...overrides }
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(`${name} must be a positive finite number`)
    }
  }
  return limits
}

function findEndOfCentralDirectory(data: Uint8Array): number {
  const minimum = Math.max(0, data.length - 22 - UINT16_MAX)
  for (let offset = data.length - 22; offset >= minimum; offset -= 1) {
    if (readUint32(data, offset) !== END_OF_CENTRAL_DIRECTORY_SIGNATURE) continue
    const commentLength = readUint16(data, offset + 20)
    if (offset + 22 + commentLength === data.length) return offset
  }
  return gemapFail('container.invalid_zip', 'ZIP end-of-central-directory record is missing')
}

function parseCentralDirectory(
  data: Uint8Array,
  limits: ZipResourceLimits,
): CentralEntry[] {
  const endOffset = findEndOfCentralDirectory(data)
  const diskNumber = readUint16(data, endOffset + 4)
  const centralDisk = readUint16(data, endOffset + 6)
  const entriesOnDisk = readUint16(data, endOffset + 8)
  const entryCount = readUint16(data, endOffset + 10)
  const centralSize = readUint32(data, endOffset + 12)
  const centralOffset = readUint32(data, endOffset + 16)

  if (diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount) {
    gemapFail('container.unsupported_feature', 'multi-volume ZIP archives are unsupported')
  }
  if (
    entryCount === UINT16_MAX
    || centralSize === UINT32_MAX
    || centralOffset === UINT32_MAX
  ) {
    gemapFail('container.unsupported_feature', 'ZIP64 archives are unsupported')
  }
  if (entryCount > limits.maxEntries) {
    gemapFail('container.resource_limit', `ZIP contains ${entryCount} entries`)
  }
  if (centralOffset + centralSize > endOffset) {
    gemapFail('container.invalid_zip', 'ZIP central directory exceeds archive bounds')
  }

  const entries: CentralEntry[] = []
  const names = new Set<string>()
  let totalUncompressed = 0
  let offset = centralOffset
  for (let index = 0; index < entryCount; index += 1) {
    if (readUint32(data, offset) !== CENTRAL_DIRECTORY_SIGNATURE || offset + 46 > data.length) {
      gemapFail('container.invalid_zip', 'ZIP central directory entry is truncated')
    }
    const madeByOs = readUint16(data, offset + 4) >>> 8
    const flags = readUint16(data, offset + 8)
    const compression = readUint16(data, offset + 10)
    const crc32 = readUint32(data, offset + 16)
    const compressedSize = readUint32(data, offset + 20)
    const uncompressedSize = readUint32(data, offset + 24)
    const nameLength = readUint16(data, offset + 28)
    const extraLength = readUint16(data, offset + 30)
    const commentLength = readUint16(data, offset + 32)
    const diskStart = readUint16(data, offset + 34)
    const externalAttributes = readUint32(data, offset + 38)
    const localOffset = readUint32(data, offset + 42)
    const nextOffset = offset + 46 + nameLength + extraLength + commentLength
    if (nextOffset > centralOffset + centralSize) {
      gemapFail('container.invalid_zip', 'ZIP central directory entry exceeds its bounds')
    }
    if (diskStart !== 0) {
      gemapFail('container.unsupported_feature', 'multi-volume ZIP entry is unsupported')
    }
    if ((flags & 0x0001) !== 0 || (flags & 0x0040) !== 0 || (flags & 0x2000) !== 0) {
      gemapFail('container.unsupported_feature', 'encrypted ZIP entries are unsupported')
    }
    if (compression !== 0 && compression !== 8) {
      gemapFail(
        'container.unsupported_feature',
        `ZIP compression method ${compression} is unsupported`,
      )
    }
    if (
      compressedSize === UINT32_MAX
      || uncompressedSize === UINT32_MAX
      || localOffset === UINT32_MAX
    ) {
      gemapFail('container.unsupported_feature', 'ZIP64 entries are unsupported')
    }
    if (uncompressedSize > limits.maxEntryUncompressedBytes) {
      gemapFail('container.resource_limit', 'ZIP entry exceeds the uncompressed size limit')
    }
    totalUncompressed += uncompressedSize
    if (totalUncompressed > limits.maxTotalUncompressedBytes) {
      gemapFail('container.resource_limit', 'ZIP exceeds the total uncompressed size limit')
    }
    const ratio = compressedSize === 0
      ? (uncompressedSize === 0 ? 1 : Number.POSITIVE_INFINITY)
      : uncompressedSize / compressedSize
    if (ratio > limits.maxCompressionRatio) {
      gemapFail('container.resource_limit', 'ZIP entry exceeds the compression ratio limit')
    }

    const nameBytes = data.slice(offset + 46, offset + 46 + nameLength)
    let name: string
    try {
      name = utf8Decoder.decode(nameBytes)
    } catch (error) {
      gemapFail('encoding.invalid_utf8', 'ZIP entry name is not valid UTF-8', { cause: error })
    }
    validateEntryName(name)
    if (name.endsWith('.json') && compression !== 8) {
      gemapFail('container.unsupported_feature', `JSON entry must use DEFLATE: ${name}`)
    }
    if (names.has(name)) {
      gemapFail('container.duplicate_entry', `duplicate ZIP entry: ${name}`, { location: name })
    }
    names.add(name)

    const unixFileType = madeByOs === 3 ? ((externalAttributes >>> 16) & 0o170000) : 0
    if (unixFileType === 0o120000) {
      gemapFail('container.unsafe_path', `symbolic-link ZIP entry is forbidden: ${name}`, {
        location: name,
      })
    }

    entries.push({
      centralOffset,
      compressedSize,
      compression,
      crc32,
      externalAttributes,
      flags,
      localOffset,
      madeByOs,
      name,
      nameBytes,
      uncompressedSize,
    })
    offset = nextOffset
  }
  if (offset !== centralOffset + centralSize) {
    gemapFail('container.invalid_zip', 'ZIP central directory size is inconsistent')
  }
  return entries
}

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < table.length; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 0 ? value >>> 1 : (value >>> 1) ^ 0xedb8_8320
    }
    table[index] = value >>> 0
  }
  return table
})()

function calculateCrc32(data: Uint8Array): number {
  let crc = UINT32_MAX
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ UINT32_MAX) >>> 0
}

function concatChunks(chunks: readonly Uint8Array[], byteLength: number): Uint8Array {
  const output = new Uint8Array(byteLength)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.length
  }
  return output
}

function inflateBounded(
  compressed: Uint8Array,
  expectedSize: number,
  limits: ZipResourceLimits,
): Uint8Array {
  const chunks: Uint8Array[] = []
  let actualSize = 0
  const inflater = new Inflate((chunk) => {
    actualSize += chunk.length
    if (
      actualSize > limits.maxEntryUncompressedBytes
      || actualSize > limits.maxTotalUncompressedBytes
    ) {
      gemapFail('container.resource_limit', 'inflated ZIP entry exceeds resource limits')
    }
    if (actualSize > expectedSize) {
      gemapFail('container.invalid_zip', 'inflated ZIP entry exceeds its declared size')
    }
    chunks.push(chunk.slice())
  })

  try {
    const stride = 1_024
    if (compressed.length === 0) inflater.push(compressed, true)
    for (let offset = 0; offset < compressed.length; offset += stride) {
      const end = Math.min(offset + stride, compressed.length)
      inflater.push(compressed.subarray(offset, end), end === compressed.length)
    }
  } catch (error) {
    if (error instanceof GemapError) throw error
    gemapFail('container.invalid_zip', 'invalid DEFLATE stream in ZIP entry', { cause: error })
  }
  if (actualSize !== expectedSize) {
    gemapFail('container.invalid_zip', 'inflated ZIP entry size differs from its declaration')
  }
  return concatChunks(chunks, actualSize)
}

function extractEntry(
  archive: Uint8Array,
  entry: CentralEntry,
  limits: ZipResourceLimits,
): Uint8Array {
  const offset = entry.localOffset
  if (readUint32(archive, offset) !== LOCAL_FILE_SIGNATURE || offset + 30 > archive.length) {
    gemapFail('container.invalid_zip', `local ZIP header is missing for ${entry.name}`)
  }
  const localFlags = readUint16(archive, offset + 6)
  const localCompression = readUint16(archive, offset + 8)
  const localCrc32 = readUint32(archive, offset + 14)
  const localCompressedSize = readUint32(archive, offset + 18)
  const localUncompressedSize = readUint32(archive, offset + 22)
  const localNameLength = readUint16(archive, offset + 26)
  const localExtraLength = readUint16(archive, offset + 28)
  if (offset + 30 + localNameLength + localExtraLength > entry.centralOffset) {
    gemapFail('container.invalid_zip', `local ZIP header exceeds archive data: ${entry.name}`)
  }
  const localName = archive.slice(offset + 30, offset + 30 + localNameLength)
  if (
    localFlags !== entry.flags
    || localCompression !== entry.compression
    || !byteArraysEqual(localName, entry.nameBytes)
  ) {
    gemapFail('container.invalid_zip', `local ZIP header conflicts with ${entry.name}`)
  }
  if (
    (entry.flags & 0x0008) === 0
    && (
      localCrc32 !== entry.crc32
      || localCompressedSize !== entry.compressedSize
      || localUncompressedSize !== entry.uncompressedSize
    )
  ) {
    gemapFail('container.invalid_zip', `local ZIP sizes conflict with ${entry.name}`)
  }
  const dataOffset = offset + 30 + localNameLength + localExtraLength
  const dataEnd = dataOffset + entry.compressedSize
  if (dataEnd > entry.centralOffset) {
    gemapFail('container.invalid_zip', `compressed data is truncated for ${entry.name}`)
  }
  const compressed = archive.subarray(dataOffset, dataEnd)
  let output: Uint8Array
  if (entry.compression === 0) {
    if (entry.compressedSize !== entry.uncompressedSize) {
      gemapFail('container.invalid_zip', `stored ZIP entry has inconsistent sizes: ${entry.name}`)
    }
    output = compressed.slice()
  } else {
    output = inflateBounded(compressed, entry.uncompressedSize, limits)
  }
  if (calculateCrc32(output) !== entry.crc32) {
    gemapFail('container.invalid_zip', `CRC-32 mismatch for ZIP entry ${entry.name}`)
  }
  return output
}

export function readZipEntries(
  archive: Uint8Array,
  limitOverrides?: Partial<ZipResourceLimits>,
): ReadonlyMap<string, Uint8Array> {
  const limits = limitsWithDefaults(limitOverrides)
  const centralEntries = parseCentralDirectory(archive, limits)
  const output = new Map<string, Uint8Array>()
  let actualTotal = 0
  for (const entry of centralEntries) {
    const data = extractEntry(archive, entry, limits)
    actualTotal += data.length
    if (actualTotal > limits.maxTotalUncompressedBytes) {
      gemapFail('container.resource_limit', 'ZIP exceeds the actual uncompressed size limit')
    }
    output.set(entry.name, data)
  }
  return output
}

export function writeZipEntries(
  entries: Iterable<readonly [string, ZipWriteEntry]>,
  limitOverrides?: Partial<ZipResourceLimits>,
): Uint8Array {
  const limits = limitsWithDefaults(limitOverrides)
  const sorted = [...entries].sort(([left], [right]) => compareEntryNames(left, right))
  if (sorted.length > limits.maxEntries) {
    gemapFail('container.resource_limit', `ZIP contains ${sorted.length} entries`)
  }

  const seen = new Set<string>()
  let total = 0
  const zippable: Zippable = Object.create(null) as Zippable
  for (const [name, entry] of sorted) {
    validateEntryName(name)
    if (name.endsWith('.json') && entry.compression === 'store') {
      gemapFail('container.unsupported_feature', `JSON entry must use DEFLATE: ${name}`)
    }
    if (seen.has(name)) {
      gemapFail('container.duplicate_entry', `duplicate ZIP entry: ${name}`)
    }
    seen.add(name)
    if (entry.data.length > limits.maxEntryUncompressedBytes) {
      gemapFail('container.resource_limit', `ZIP entry ${name} exceeds its size limit`)
    }
    total += entry.data.length
    if (total > limits.maxTotalUncompressedBytes) {
      gemapFail('container.resource_limit', 'ZIP exceeds its total size limit')
    }
    zippable[name] = [entry.data, {
      attrs: 0o644 << 16,
      level: entry.compression === 'store' ? 0 : 6,
      mtime: fixedZipTime,
      os: 3,
    }]
  }
  return zipSync(zippable)
}
