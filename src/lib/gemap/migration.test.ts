/// <reference types="node" />

import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import expectationsJson from '../../../fixtures/gemap/expectations.json'
import { gemapVoxels, readGemap, writeGemap } from './codec'
import { GemapError } from './errors'
import {
  legacyTileMapping,
  migrateLegacyGemap,
  parseLegacyGemap,
  type MigrationMode,
  type MigrationReport,
} from './migration'
import type { GemapVoxel } from './types'

type MigrationExpectation = {
  layerZ?: Record<string, number>
  logicalVoxels: GemapVoxel[]
  report: MigrationReport
}

type LegacyExpectation = {
  input: string
  migrations: Record<MigrationMode, MigrationExpectation>
}

const expectations = expectationsJson as unknown as {
  legacy: Record<string, LegacyExpectation>
}
const fixtureRoot = new URL('../../../fixtures/gemap/', import.meta.url)

function readFixture(relativePath: string): Uint8Array {
  return readFileSync(new URL(relativePath, fixtureRoot))
}

describe('legacy .gemap migration', () => {
  for (const [caseId, fixture] of Object.entries(expectations.legacy)) {
    for (const mode of ['flatten', 'preserve-layers'] as const) {
      it(`matches ${caseId}/${mode} shared expectations exactly`, () => {
        const expected = fixture.migrations[mode]
        const result = migrateLegacyGemap(readFixture(fixture.input), mode)

        expect(result.voxels).toEqual(expected.logicalVoxels)
        expect(result.report).toEqual(expected.report)
        expect(result.layerZ).toEqual(expected.layerZ ?? {})
        expect(gemapVoxels(result.document)).toEqual(expected.logicalVoxels)
        expect(gemapVoxels(readGemap(writeGemap(result.document)))).toEqual(
          expected.logicalVoxels,
        )
      })
    }
  }

  it('keeps layerTiles authoritative and null or void cells non-erasing', () => {
    const result = migrateLegacyGemap({
      version: 2,
      worldName: 'Priority',
      tiles: { '0,0': 'lava' },
      layers: [
        { id: 'bottom', name: 'Bottom' },
        { id: 'top', name: 'Top' },
      ],
      layerTiles: {
        bottom: { '0,0': 'floor', '1,0': 'wall' },
        top: { '0,0': null, '1,0': 'void' },
      },
    }, 'flatten')

    expect(result.voxels).toEqual([
      { block: 'glyphweave:floor', coord: [0, 0, 0] },
      { block: 'glyphweave:wall', coord: [0, 1, 0] },
    ])
    expect(result.report.overwrittenTileCount).toBe(0)
  })

  it('normalizes unknown identities and disambiguates collisions deterministically', () => {
    expect(legacyTileMapping('HTTPServer2D')).toEqual({
      block: 'legacy:http-server2-d',
      kind: 'unknown',
    })
    expect(legacyTileMapping('✨')).toEqual({
      block: 'legacy:unknown-c0cc703f',
      kind: 'unknown',
    })

    const result = migrateLegacyGemap({
      tiles: { '0,0': 'a b', '1,0': 'a-b' },
      worldName: 'Collisions',
    }, 'flatten')
    expect(result.voxels).toEqual([
      { block: 'legacy:a-b-c8687a08', coord: [0, 0, 0] },
      { block: 'legacy:a-b-d44362d6', coord: [0, 1, 0] },
    ])
    expect(result.report.unknownTileIds).toEqual(['a b', 'a-b'])
  })

  it('rejects unsupported versions, duplicate layers, and invalid coordinates', () => {
    expect(() => parseLegacyGemap('{"version":3,"tiles":{}}')).toThrowError(
      expect.objectContaining<Partial<GemapError>>({ category: 'migration.unsupported_version' }),
    )
    expect(() => migrateLegacyGemap({
      tiles: {},
      layers: [
        { id: 'same', name: 'First' },
        { id: 'same', name: 'Second' },
      ],
    })).toThrowError(expect.objectContaining<Partial<GemapError>>({
      category: 'migration.duplicate_layer',
    }))
    expect(() => migrateLegacyGemap({ tiles: { nope: 'wall' } })).toThrowError(
      expect.objectContaining<Partial<GemapError>>({ category: 'migration.invalid_coordinate' }),
    )
  })
})
