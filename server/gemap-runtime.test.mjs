import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import { gemapVoxels, readGemap } from '../src/lib/gemap/codec.ts'
import { decodeGemapSlice, encodeConvertedMap } from './gemap-runtime.ts'

async function fixture(relativePath) {
  return new Uint8Array(await readFile(new URL(`../fixtures/gemap/${relativePath}`, import.meta.url)))
}

describe('server .gemap runtime adapter', () => {
  it('decodes exactly the requested v3 z slice through the shared codec', async () => {
    const archive = await fixture('v3-valid/one-block-origin.gemap')

    expect(decodeGemapSlice(archive, 0)).toEqual({
      themeId: undefined,
      tiles: { '0,0': 'wall' },
      worldName: 'One Block at Origin',
    })
    expect(decodeGemapSlice(archive, 1).tiles).toEqual({})
  })

  it('encodes converter output as a valid v3 ZIP with metadata', () => {
    const archive = encodeConvertedMap({
      conversion: { strategy: 'test' },
      themeId: 'ansi-16',
      tiles: {
        '-1,2': 'floorAlt',
        '0,0': 'wall',
        '1,0': null,
        '2,0': 'void',
      },
      worldName: 'Converted',
    })

    expect(Array.from(archive.slice(0, 2))).toEqual([0x50, 0x4b])
    const document = readGemap(archive)
    expect(document.manifest.format).toBe('glyphweave-map')
    expect(document.manifest.version).toBe(3)
    expect(document.manifest.metadata).toEqual({
      appearance: { themeId: 'ansi-16' },
      conversion: { strategy: 'test' },
      migration: {
        mode: 'flatten',
        sourceFormat: 'gemap-v2',
        sourceThemeId: 'ansi-16',
      },
    })
    expect(gemapVoxels(document)).toEqual([
      { block: 'glyphweave:floor-alt', coord: [0, -1, 2] },
      { block: 'glyphweave:wall', coord: [0, 0, 0] },
    ])
  })

  it('keeps unknown converter tile identities in the legacy namespace', () => {
    const archive = encodeConvertedMap({
      tiles: { '4,5': 'mysteryTile' },
      worldName: 'Unknown',
    })
    const document = readGemap(archive)

    expect(gemapVoxels(document)).toEqual([
      { block: 'legacy:mystery-tile', coord: [0, 4, 5] },
    ])
    expect(decodeGemapSlice(archive, 0).tiles).toEqual({
      '4,5': 'legacy:mystery-tile',
    })
  })

  it('applies bounded ZIP limits to every API archive', async () => {
    const archive = await fixture('v3-invalid/zip-bomb-limit.gemap')

    expect(() => decodeGemapSlice(archive, 0)).toThrowError(/compression ratio|resource/u)
  })
})
