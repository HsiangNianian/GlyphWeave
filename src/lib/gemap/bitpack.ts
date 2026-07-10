import { gemapFail } from './errors'

export const GEMAP_CHUNK_VOLUME = 16 * 16 * 16

export function packedByteLength(valueCount: number, bits: number): number {
  if (!Number.isSafeInteger(valueCount) || valueCount < 0) {
    throw new RangeError('valueCount must be a non-negative safe integer')
  }
  if (!Number.isInteger(bits) || bits < 1 || bits > 12) {
    throw new RangeError('bits must be an integer from 1 to 12')
  }
  return Math.ceil((valueCount * bits) / 8)
}

export function packPaletteIndices(
  indices: ArrayLike<number>,
  bits: number,
): Uint8Array {
  const output = new Uint8Array(packedByteLength(indices.length, bits))
  const maximum = (1 << bits) - 1

  for (let index = 0; index < indices.length; index += 1) {
    const value = indices[index]
    if (!Number.isInteger(value) || value < 0 || value > maximum) {
      throw new RangeError(`palette index ${String(value)} does not fit in ${bits} bits`)
    }

    let remaining = bits
    let sourceShift = 0
    let bitOffset = index * bits
    while (remaining > 0) {
      const byteOffset = Math.floor(bitOffset / 8)
      const bitInByte = bitOffset % 8
      const writable = Math.min(remaining, 8 - bitInByte)
      const mask = (1 << writable) - 1
      output[byteOffset] |= ((value >> sourceShift) & mask) << bitInByte
      remaining -= writable
      sourceShift += writable
      bitOffset += writable
    }
  }

  return output
}

export function unpackPaletteIndices(
  data: Uint8Array,
  bits: number,
  valueCount = GEMAP_CHUNK_VOLUME,
  paletteLength?: number,
): Uint16Array {
  const expectedLength = packedByteLength(valueCount, bits)
  if (data.length !== expectedLength) {
    gemapFail(
      'integrity.chunk_binary_length',
      `packed data has ${data.length} bytes; expected ${expectedLength}`,
    )
  }
  if (
    paletteLength !== undefined
    && (!Number.isInteger(paletteLength) || paletteLength < 1 || paletteLength > 4096)
  ) {
    throw new RangeError('paletteLength must be an integer from 1 to 4096')
  }

  const output = new Uint16Array(valueCount)
  for (let index = 0; index < valueCount; index += 1) {
    let remaining = bits
    let targetShift = 0
    let bitOffset = index * bits
    let value = 0
    while (remaining > 0) {
      const byteOffset = Math.floor(bitOffset / 8)
      const bitInByte = bitOffset % 8
      const readable = Math.min(remaining, 8 - bitInByte)
      const mask = (1 << readable) - 1
      value |= ((data[byteOffset] >> bitInByte) & mask) << targetShift
      remaining -= readable
      targetShift += readable
      bitOffset += readable
    }

    if (paletteLength !== undefined && value >= paletteLength) {
      gemapFail(
        'integrity.palette_index',
        `voxel ${index} uses palette index ${value}, but palette has ${paletteLength} entries`,
      )
    }
    output[index] = value
  }

  const usedBits = valueCount * bits
  const trailingBits = usedBits % 8
  if (trailingBits !== 0) {
    const trailingMask = 0xff << trailingBits
    if ((data[data.length - 1] & trailingMask) !== 0) {
      gemapFail('integrity.palette_index', 'unused trailing bits must be zero')
    }
  }

  return output
}
