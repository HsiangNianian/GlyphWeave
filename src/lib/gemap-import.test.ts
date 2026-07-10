/// <reference types="node" />

import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  createEditorGemapArchive,
  hasZipMagic,
  importGemapBytes,
  migrationFeedback,
} from './gemap-import'

const fixtureRoot = new URL('../../fixtures/gemap/', import.meta.url)

function fixture(path: string): Uint8Array {
  return readFileSync(new URL(path, fixtureRoot))
}

describe('editor .gemap import detection', () => {
  it('detects and imports v3 ZIP worlds', () => {
    const bytes = fixture('v3-valid/unknown-namespaced-block.gemap')
    const imported = importGemapBytes(bytes)

    expect(hasZipMagic(bytes)).toBe(true)
    expect(imported.source).toBe('v3')
    expect(imported.worldName).toBe('Unknown Namespaced Block')
    expect(imported.voxels).toEqual([
      { block: 'mystery.mod:forgotten/relic', coord: [0, 0, 0] },
    ])
  })

  it('routes legacy JSON through flatten migration', () => {
    const bytes = fixture('v2/layered-v2.gemap')
    const imported = importGemapBytes(bytes)

    expect(hasZipMagic(bytes)).toBe(false)
    expect(imported.source).toBe('legacy')
    expect(imported.migrationReport).toMatchObject({
      mode: 'flatten',
      outputVoxelCount: 5,
      sourceVersion: 2,
    })
    expect(imported.voxels).toContainEqual({
      block: 'legacy:mystery-tile',
      coord: [0, 5, 0],
    })
    expect(imported.themeId).toBe('ansi-16')
    expect(migrationFeedback(imported.migrationReport!)).toEqual({
      hiddenTileCount: 2,
      outputVoxelCount: 5,
      overwrittenTileCount: 2,
      sourceVersion: 2,
      unknownTileCount: 1,
    })
  })

  it('round-trips appearance metadata as a non-world theme hint', () => {
    const archive = createEditorGemapArchive('Appearance', [
      { block: 'glyphweave:wall', coord: [4, 2, 3] },
    ], 'cogmind')
    const imported = importGemapBytes(archive)

    expect(imported.themeId).toBe('cogmind')
    expect(imported.voxels).toEqual([
      { block: 'glyphweave:wall', coord: [4, 2, 3] },
    ])
  })
})
