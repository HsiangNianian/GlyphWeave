import { blake3 } from '@noble/hashes/blake3.js'

import {
  GEMAP_CHUNK_VOLUME,
  packPaletteIndices,
  packedByteLength,
  unpackPaletteIndices,
} from './bitpack'
import type { GemapChunkRecord } from './types'

const hashDomain = new TextEncoder().encode('GEMAP-CHUNK-V1\0')
const UINT32_MAX = 0xffff_ffff

export type CanonicalChunk = {
  bits: number
  blockIds: Uint32Array
  id: string
  packed: Uint8Array
  palette: number[]
}

function assertGlobalBlockId(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > UINT32_MAX) {
    throw new RangeError(`global block ID ${String(value)} is not a uint32`)
  }
}

export function minimumPaletteBits(paletteLength: number): number {
  if (!Number.isInteger(paletteLength) || paletteLength < 1 || paletteLength > 4096) {
    throw new RangeError('palette length must be an integer from 1 to 4096')
  }
  return Math.max(1, Math.ceil(Math.log2(paletteLength)))
}

function bytesToHex(bytes: Uint8Array): string {
  let output = ''
  for (const byte of bytes) output += byte.toString(16).padStart(2, '0')
  return output
}

export function chunkHashInput(
  palette: readonly number[],
  bits: number,
  packed: Uint8Array,
): Uint8Array {
  if (palette.length < 1 || palette.length > 4096) {
    throw new RangeError('canonical palette must contain 1 to 4096 block IDs')
  }
  if (bits !== minimumPaletteBits(palette.length)) {
    throw new RangeError('canonical chunk must use the minimum palette bit width')
  }
  if (packed.length !== packedByteLength(GEMAP_CHUNK_VOLUME, bits)) {
    throw new RangeError('canonical packed data has the wrong byte length')
  }
  const output = new Uint8Array(hashDomain.length + 4 + palette.length * 4 + 1 + packed.length)
  output.set(hashDomain)
  const view = new DataView(output.buffer)
  let offset = hashDomain.length
  view.setUint32(offset, palette.length, true)
  offset += 4
  for (let index = 0; index < palette.length; index += 1) {
    const blockId = palette[index]
    assertGlobalBlockId(blockId)
    if (index > 0 && palette[index - 1] >= blockId) {
      throw new RangeError('canonical palette must be strictly increasing')
    }
    view.setUint32(offset, blockId, true)
    offset += 4
  }
  output[offset] = bits
  output.set(packed, offset + 1)
  return output
}

export function calculateChunkId(
  palette: readonly number[],
  bits: number,
  packed: Uint8Array,
): string {
  return bytesToHex(blake3(chunkHashInput(palette, bits, packed)))
}

export function canonicalizeChunk(blockIds: ArrayLike<number>): CanonicalChunk {
  if (blockIds.length !== GEMAP_CHUNK_VOLUME) {
    throw new RangeError(`a chunk must contain exactly ${GEMAP_CHUNK_VOLUME} block IDs`)
  }

  const unique = new Set<number>()
  const copied = new Uint32Array(GEMAP_CHUNK_VOLUME)
  for (let index = 0; index < blockIds.length; index += 1) {
    const blockId = blockIds[index]
    assertGlobalBlockId(blockId)
    copied[index] = blockId
    unique.add(blockId)
  }
  if (unique.size === 1 && unique.has(0)) {
    throw new RangeError('air-only chunks must not be persisted')
  }

  const palette = [...unique].sort((left, right) => left - right)
  const bits = minimumPaletteBits(palette.length)
  const paletteIndex = new Map(palette.map((blockId, index) => [blockId, index]))
  const indices = new Uint16Array(GEMAP_CHUNK_VOLUME)
  for (let index = 0; index < copied.length; index += 1) {
    const mapped = paletteIndex.get(copied[index])
    if (mapped === undefined) throw new Error('canonical palette is internally inconsistent')
    indices[index] = mapped
  }
  const packed = packPaletteIndices(indices, bits)

  return {
    bits,
    blockIds: copied,
    id: calculateChunkId(palette, bits, packed),
    packed,
    palette,
  }
}

export function decodeChunkBlockIds(
  record: Pick<GemapChunkRecord, 'bits' | 'palette'>,
  packed: Uint8Array,
): Uint32Array {
  const indices = unpackPaletteIndices(
    packed,
    record.bits,
    GEMAP_CHUNK_VOLUME,
    record.palette.length,
  )
  const blockIds = new Uint32Array(GEMAP_CHUNK_VOLUME)
  for (let index = 0; index < indices.length; index += 1) {
    blockIds[index] = record.palette[indices[index]]
  }
  return blockIds
}
