import { describe, expect, it } from 'vitest'

import { GemapError } from './errors'
import {
  GEMAP_CHUNK_VOLUME,
  packPaletteIndices,
  packedByteLength,
  unpackPaletteIndices,
} from './bitpack'

describe('gemap bit packing', () => {
  it('writes the least-significant palette bits first', () => {
    expect(packPaletteIndices([0, 1, 2, 3], 2)).toEqual(Uint8Array.of(0xe4))
    expect(unpackPaletteIndices(Uint8Array.of(0xe4), 2, 4)).toEqual(
      Uint16Array.of(0, 1, 2, 3),
    )
  })

  it('round-trips cross-byte values for every supported bit width', () => {
    for (let bits = 1; bits <= 12; bits += 1) {
      const paletteLength = Math.min(1 << bits, 4096)
      const indices = Uint16Array.from(
        { length: GEMAP_CHUNK_VOLUME },
        (_, index) => (index * 4051 + Math.floor(index / 7)) % paletteLength,
      )
      const packed = packPaletteIndices(indices, bits)
      expect(packed).toHaveLength(packedByteLength(GEMAP_CHUNK_VOLUME, bits))
      expect(unpackPaletteIndices(packed, bits, GEMAP_CHUNK_VOLUME, paletteLength)).toEqual(
        indices,
      )
    }
  })

  it('rejects truncated data and out-of-range palette indices', () => {
    expect(() => unpackPaletteIndices(new Uint8Array(511), 1)).toThrowError(
      expect.objectContaining<Partial<GemapError>>({
        category: 'integrity.chunk_binary_length',
      }),
    )
    expect(() => unpackPaletteIndices(Uint8Array.of(0b0000_0011), 2, 1, 3)).toThrowError(
      expect.objectContaining<Partial<GemapError>>({ category: 'integrity.palette_index' }),
    )
  })
})
