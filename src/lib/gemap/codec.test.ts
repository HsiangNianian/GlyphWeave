/// <reference types="node" />

import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import expectationsJson from '../../../fixtures/gemap/expectations.json'
import { GemapError, type GemapErrorCategory } from './errors'
import { gemapVoxels, readGemap, stableJsonBytes, writeGemap } from './codec'
import type { ZipResourceLimits } from './types'
import { validateGemapDocument } from './validation'

type LogicalVoxel = {
  block: string
  coord: [number, number, number]
}

type ValidExpectation = {
  archive: string
  logicalVoxels: LogicalVoxel[]
  regions: Record<string, {
    chunks: Record<string, {
      bits: number
      packedPrefixHex: string
      palette: number[]
    }>
    sections: Record<string, string>
  }>
}

type InvalidExpectation = {
  archive: string
  conformanceLimits?: ZipResourceLimits
  expectedError: GemapErrorCategory
}

const expectations = expectationsJson as unknown as {
  v3Invalid: Record<string, InvalidExpectation>
  v3Valid: Record<string, ValidExpectation>
}
const fixtureRoot = new URL('../../../fixtures/gemap/', import.meta.url)

function readFixture(relativePath: string): Uint8Array {
  return readFileSync(new URL(relativePath, fixtureRoot))
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

describe('.gemap v3 browser codec', () => {
  it.each(Object.entries(expectations.v3Valid))(
    'accepts and decodes the %s conformance fixture',
    (_, fixture) => {
      const document = readGemap(readFixture(fixture.archive))

      expect(gemapVoxels(document)).toEqual(fixture.logicalVoxels)
      for (const [regionKey, expectedRegion] of Object.entries(fixture.regions)) {
        const actualRegion = document.regions[regionKey]
        expect(actualRegion.record.sections).toEqual(expectedRegion.sections)
        for (const [chunkId, expectedChunk] of Object.entries(expectedRegion.chunks)) {
          const actualChunk = actualRegion.record.chunks[chunkId]
          expect(actualChunk.bits).toBe(expectedChunk.bits)
          expect(actualChunk.palette).toEqual(expectedChunk.palette)
          expect(bytesToHex(actualRegion.chunks[chunkId].slice(0, 16))).toBe(
            expectedChunk.packedPrefixHex,
          )
        }
      }
    },
  )

  it.each(Object.entries(expectations.v3Invalid))(
    'rejects the %s fixture with its shared error category',
    (_, fixture) => {
      expect(() => readGemap(readFixture(fixture.archive), {
        limits: fixture.conformanceLimits,
      })).toThrowError(expect.objectContaining<Partial<GemapError>>({
        category: fixture.expectedError,
      }))
    },
  )

  it('writes deterministic archives that round-trip semantically', () => {
    const source = readGemap(readFixture('v3-valid/multi-palette-cross-byte.gemap'))

    const first = writeGemap(source)
    const second = writeGemap(source)

    expect(first).toEqual(second)
    expect(gemapVoxels(readGemap(first))).toEqual(gemapVoxels(source))
  })

  it('rejects non-canonical palettes during semantic validation', () => {
    const document = readGemap(readFixture('v3-valid/one-block-origin.gemap'))
    const region = document.regions['0,0']
    const [chunkId] = Object.keys(region.record.chunks)
    region.record.chunks[chunkId].palette = [1, 0]

    expect(() => validateGemapDocument(document)).toThrowError(
      expect.objectContaining<Partial<GemapError>>({ category: 'semantic.invalid_chunk' }),
    )
  })

  it('rejects palette IDs absent from the world registry', () => {
    const document = readGemap(readFixture('v3-valid/one-block-origin.gemap'))
    const region = document.regions['0,0']
    const [chunkId] = Object.keys(region.record.chunks)
    region.record.chunks[chunkId].palette = [0, 2]

    expect(() => validateGemapDocument(document)).toThrowError(
      expect.objectContaining<Partial<GemapError>>({ category: 'semantic.invalid_chunk' }),
    )
  })

  it('uses sorted compact JSON with a trailing LF', () => {
    expect(new TextDecoder().decode(stableJsonBytes({ z: 1, a: { d: 2, c: 3 } }))).toBe(
      '{"a":{"c":3,"d":2},"z":1}\n',
    )
  })
})
