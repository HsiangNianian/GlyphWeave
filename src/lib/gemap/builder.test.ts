/// <reference types="node" />

import { describe, expect, it } from 'vitest'

import expectationsJson from '../../../fixtures/gemap/expectations.json'
import { buildGemapDocument, splitVoxelCoordinate } from './builder'
import { gemapVoxels, readGemap, writeGemap } from './codec'
import { GemapError } from './errors'

type ChunkExpectation = {
  bits: number
  packedPrefixHex: string
  palette: number[]
}

type BuilderExpectation = {
  logicalVoxels: Array<{ block: string; coord: [number, number, number] }>
  regions: Record<string, {
    chunks: Record<string, ChunkExpectation>
    sections: Record<string, string>
  }>
}

const crossLanguageCases = expectationsJson.v3Valid as unknown as Record<string, BuilderExpectation>

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

describe('canonical GemapDocument builder', () => {
  it('omits explicit air and creates the canonical empty world', () => {
    const document = buildGemapDocument('Empty', [
      { block: 'glyphweave:air', coord: [0, 0, 0] },
    ])

    expect(document.manifest.blockRegistry).toEqual({ 0: 'glyphweave:air' })
    expect(document.manifest.regions).toEqual({})
    expect(gemapVoxels(document)).toEqual([])
  })

  it('uses floor division at every negative chunk and region boundary', () => {
    expect(splitVoxelCoordinate([-1, -1, -513])).toEqual({
      local: [15, 15, 15],
      localIndex: 4095,
      region: [-1, -2],
      regionKey: '-1,-2',
      section: [-1, 31, 31],
      sectionKey: '-1,31,31',
    })
    expect(splitVoxelCoordinate([-16, -512, 0])).toEqual({
      local: [0, 0, 0],
      localIndex: 0,
      region: [-1, 0],
      regionKey: '-1,0',
      section: [-1, 0, 0],
      sectionKey: '-1,0,0',
    })
    expect(splitVoxelCoordinate([-17, -513, 0])).toEqual({
      local: [15, 15, 0],
      localIndex: 3855,
      region: [-2, 0],
      regionKey: '-2,0',
      section: [-2, 31, 0],
      sectionKey: '-2,31,0',
    })
  })

  it('assigns archive-local IDs by block name and preserves unknown blocks', () => {
    const voxels = [
      { block: 'mystery.mod:forgotten/relic', coord: [0, 1, 0] as [number, number, number] },
      { block: 'glyphweave:wall', coord: [0, 0, 0] as [number, number, number] },
    ]
    const document = buildGemapDocument('Registry', voxels)

    expect(document.manifest.blockRegistry).toEqual({
      0: 'glyphweave:air',
      1: 'glyphweave:wall',
      2: 'mystery.mod:forgotten/relic',
    })
    expect(gemapVoxels(document)).toEqual(voxels.slice().reverse())
  })

  it('matches the shared one-block hash and deduplicates within a region', () => {
    const document = buildGemapDocument('Dedup', [
      { block: 'glyphweave:wall', coord: [0, 0, 0] },
      { block: 'glyphweave:wall', coord: [0, 16, 0] },
    ])
    const region = document.regions['0,0']
    const chunkId = '6fb8aa806afb1aa7595e3c076df1971ed4e26468ef9daf10e4fc3857901bee91'

    expect(region.record.sections).toEqual({
      '0,0,0': chunkId,
      '0,1,0': chunkId,
    })
    expect(Object.keys(region.record.chunks)).toEqual([chunkId])
    expect(region.record.chunks[chunkId]).toEqual({
      bits: 1,
      data: `chunks/${chunkId}.bin`,
      palette: [0, 1],
    })
  })

  it.each([
    'one-block-origin',
    'negative-boundaries',
    'shared-sections',
    'independent-regions',
  ])('matches Rust canonical records for %s', (caseId) => {
    const expected = crossLanguageCases[caseId]
    const document = buildGemapDocument(caseId, expected.logicalVoxels)

    for (const [regionKey, expectedRegion] of Object.entries(expected.regions)) {
      const actualRegion = document.regions[regionKey]
      expect(actualRegion.record.sections).toEqual(expectedRegion.sections)
      for (const [chunkId, expectedChunk] of Object.entries(expectedRegion.chunks)) {
        expect(actualRegion.record.chunks[chunkId].bits).toBe(expectedChunk.bits)
        expect(actualRegion.record.chunks[chunkId].palette).toEqual(expectedChunk.palette)
        expect(bytesToHex(actualRegion.chunks[chunkId].slice(0, 16))).toBe(
          expectedChunk.packedPrefixHex,
        )
      }
    }
  })

  it('round-trips through the ZIP codec without semantic changes', () => {
    const voxels = [
      { block: 'future-mod:blue/crystal', coord: [-17, -513, 512] as [number, number, number] },
      { block: 'glyphweave:wall', coord: [31, 900, -900] as [number, number, number] },
    ]
    const document = buildGemapDocument('Round trip', voxels)

    expect(gemapVoxels(readGemap(writeGemap(document)))).toEqual(
      voxels.slice().sort((left, right) => left.coord[0] - right.coord[0]),
    )
  })

  it('produces identical archives regardless of voxel iteration order', () => {
    const voxels = [
      { block: 'glyphweave:wall', coord: [0, 0, 0] as [number, number, number] },
      { block: 'future-mod:blue/crystal', coord: [-17, -513, 512] as [number, number, number] },
      { block: 'glyphweave:floor', coord: [31, 900, -900] as [number, number, number] },
    ]

    expect(writeGemap(buildGemapDocument('Stable', voxels))).toEqual(
      writeGemap(buildGemapDocument('Stable', voxels.slice().reverse())),
    )
  })

  it('rejects duplicate coordinates instead of depending on input order', () => {
    expect(() => buildGemapDocument('Duplicate', [
      { block: 'glyphweave:wall', coord: [0, 0, 0] },
      { block: 'glyphweave:floor', coord: [0, 0, 0] },
    ])).toThrowError(expect.objectContaining<Partial<GemapError>>({
      category: 'semantic.invalid_chunk',
    }))
  })
})
