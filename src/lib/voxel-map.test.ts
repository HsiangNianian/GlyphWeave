import { describe, expect, it } from 'vitest'

import {
  blockNameToTileToken,
  formatVoxelSliceId,
  gemapVoxelsToSlices,
  parseVoxelSliceId,
  slicesToGemapVoxels,
  tileTokenToBlockName,
} from './voxel-map'

describe('editor voxel slice adapter', () => {
  it('formats and parses canonical signed z slice IDs', () => {
    expect(formatVoxelSliceId(-17)).toBe('z:-17')
    expect(parseVoxelSliceId('z:-17')).toBe(-17)
    expect(parseVoxelSliceId('z:0')).toBe(0)
    expect(parseVoxelSliceId('z:-0')).toBeNull()
    expect(parseVoxelSliceId('layer-1')).toBeNull()
  })

  it('maps every editor tile identity through stable block names', () => {
    expect(tileTokenToBlockName('floorAlt')).toBe('glyphweave:floor-alt')
    expect(tileTokenToBlockName('doorOpen')).toBe('glyphweave:door-open')
    expect(blockNameToTileToken('glyphweave:stairs-down')).toBe('stairsDown')
    expect(tileTokenToBlockName('void')).toBeNull()
  })

  it('preserves unknown namespaced blocks across slice conversion', () => {
    const voxels = [
      { block: 'glyphweave:wall', coord: [0, 1, 2] as [number, number, number] },
      { block: 'future-mod:blue/crystal', coord: [-3, -4, 5] as [number, number, number] },
    ]
    const slices = gemapVoxelsToSlices(voxels)

    expect(slices).toEqual({
      'z:0': { '1,2': 'wall' },
      'z:-3': { '-4,5': 'future-mod:blue/crystal' },
    })
    expect(slicesToGemapVoxels(slices)).toEqual(voxels.slice().reverse())
  })
})
