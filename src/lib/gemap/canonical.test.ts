import { describe, expect, it } from 'vitest'

import { GEMAP_CHUNK_VOLUME } from './bitpack'
import { canonicalizeChunk, decodeChunkBlockIds } from './canonical'

describe('canonical gemap chunks', () => {
  it('matches the one-block golden BLAKE3 identity', () => {
    const blocks = new Uint32Array(GEMAP_CHUNK_VOLUME)
    blocks[0] = 1

    const canonical = canonicalizeChunk(blocks)

    expect(canonical.palette).toEqual([0, 1])
    expect(canonical.bits).toBe(1)
    expect(canonical.packed).toHaveLength(512)
    expect(canonical.packed.slice(0, 8)).toEqual(Uint8Array.of(1, 0, 0, 0, 0, 0, 0, 0))
    expect(canonical.id).toBe(
      '6fb8aa806afb1aa7595e3c076df1971ed4e26468ef9daf10e4fc3857901bee91',
    )
  })

  it('sorts palettes and matches the cross-byte fixture', () => {
    const blocks = new Uint32Array(GEMAP_CHUNK_VOLUME)
    blocks.set([0, 5, 9, 17, 42, 9, 42, 5, 17, 0, 42, 17, 9, 5, 0, 42, 5, 17, 9, 42])

    const canonical = canonicalizeChunk(blocks)

    expect(canonical.palette).toEqual([0, 5, 9, 17, 42])
    expect(canonical.bits).toBe(3)
    expect(canonical.packed.slice(0, 8)).toEqual(
      Uint8Array.of(0x88, 0x46, 0x31, 0x03, 0xa7, 0x80, 0x99, 0x08),
    )
    expect(canonical.id).toBe(
      '61323af0c75c20bf183fb8e623d75cb1d02b3bdd078a67e5ee59b2fef6d447c2',
    )
    expect(decodeChunkBlockIds(canonical, canonical.packed)).toEqual(blocks)
  })

  it('removes unused input palette concepts by deriving identity from voxels', () => {
    const blocks = new Uint32Array(GEMAP_CHUNK_VOLUME).fill(77)
    const canonical = canonicalizeChunk(blocks)

    expect(canonical.palette).toEqual([77])
    expect(canonical.bits).toBe(1)
  })
})
