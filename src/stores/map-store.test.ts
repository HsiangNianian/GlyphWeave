import { beforeEach, describe, expect, it } from 'vitest'

import type { Preset, Theme, WorldConfig } from '@/types'
import { useMapStore } from './map-store'

const testWorld: WorldConfig = {
  worldName: 'Test World',
  tileSize: 24,
  themeId: 'ansi-16',
}

const singleWallPreset: Preset = {
  id: 'single-wall',
  name: 'Single Wall',
  description: 'One wall',
  category: 'features',
  grid: [['wall', 'void']],
}

function resetStore(config: WorldConfig = testWorld): void {
  useMapStore.getState().initWorld(config)
}

describe('map-store voxel slices', () => {
  beforeEach(() => resetStore())

  it('edits the active z slice and keeps history patches scoped to that slice', () => {
    const store = useMapStore.getState()
    store.setActiveZ(-2)
    store.setTile(1, 2, 'wall')

    expect(useMapStore.getState().tiles).toEqual({
      'z:0': {},
      'z:-2': { '1,2': 'wall' },
    })
    expect(useMapStore.getState().history).toEqual([
      {
        patches: [
          { sliceId: 'z:-2', key: '1,2', before: null, after: 'wall' },
        ],
      },
    ])

    useMapStore.getState().setActiveZ(7)
    useMapStore.getState().undo()
    expect(useMapStore.getState().tiles['z:-2']).toEqual({})
    expect(useMapStore.getState().activeZ).toBe(7)

    useMapStore.getState().redo()
    expect(useMapStore.getState().tiles['z:-2']).toEqual({ '1,2': 'wall' })
  })

  it('records setTiles as one compacted transaction', () => {
    useMapStore.getState().setTiles([
      [0, 0, 'floor'],
      [1, 0, 'wall'],
      [0, 0, 'water'],
    ])

    expect(useMapStore.getState().tiles['z:0']).toEqual({
      '0,0': 'water',
      '1,0': 'wall',
    })
    expect(useMapStore.getState().history[0]?.patches).toEqual([
      { sliceId: 'z:0', key: '0,0', before: null, after: 'water' },
      { sliceId: 'z:0', key: '1,0', before: null, after: 'wall' },
    ])
  })

  it('previews a stroke and commits it as one undo entry', () => {
    useMapStore.getState().setTilePreview('z:3', 0, 0, 'wall')
    useMapStore.getState().setTilePreview('z:3', 1, 0, 'water')
    useMapStore.getState().commitTilePreview({
      patches: [
        { sliceId: 'z:3', key: '0,0', before: null, after: 'wall' },
        { sliceId: 'z:3', key: '1,0', before: null, after: 'water' },
      ],
    })

    expect(useMapStore.getState().tiles['z:3']).toEqual({
      '0,0': 'wall',
      '1,0': 'water',
    })
    expect(useMapStore.getState().history).toHaveLength(1)
    useMapStore.getState().undo()
    expect(useMapStore.getState().tiles['z:3']).toEqual({})
  })

  it('updates tool, tile, and preset state and places presets on active z', () => {
    const store = useMapStore.getState()
    store.setActiveTileType('water')
    store.setCurrentTool('pan')
    store.setActivePreset(singleWallPreset)
    store.setActiveZ(4)
    store.placePreset(singleWallPreset, 5, 6)

    const state = useMapStore.getState()
    expect(state.activeTileType).toBe('water')
    expect(state.currentTool).toBe('brush')
    expect(state.activePreset).toEqual(singleWallPreset)
    expect(state.tiles['z:4']).toEqual({ '5,6': 'wall' })

    state.setCurrentTool('erase')
    expect(useMapStore.getState().activePreset).toBeNull()
  })

  it('flood-fills only the active slice and exposes getTile for that slice', () => {
    resetStore({
      ...testWorld,
      initialSlices: {
        'z:0': { '0,0': 'water' },
        'z:2': {
          '0,0': 'water',
          '1,0': 'water',
          '2,0': 'wall',
        },
      },
      activeZ: 2,
    })

    expect(useMapStore.getState().getTile(0, 0)).toBe('water')
    useMapStore.getState().floodFill(0, 0, 'lava')

    expect(useMapStore.getState().tiles['z:2']).toEqual({
      '0,0': 'lava',
      '1,0': 'lava',
      '2,0': 'wall',
    })
    expect(useMapStore.getState().tiles['z:0']).toEqual({ '0,0': 'water' })
  })

  it('initializes voxel worlds and maps known and unknown block identities', () => {
    resetStore({
      ...testWorld,
      activeZ: -1,
      initialVoxels: [
        { block: 'glyphweave:floor-alt', coord: [-1, 0, 0] },
        { block: 'future-mod:blue/crystal', coord: [3, 2, 1] },
      ],
    })

    expect(useMapStore.getState().activeZ).toBe(-1)
    expect(useMapStore.getState().tiles).toEqual({
      'z:-1': { '0,0': 'floorAlt' },
      'z:3': { '2,1': 'future-mod:blue/crystal' },
    })
    expect(useMapStore.getState().history).toEqual([])
  })

  it('imports slice maps and resets undo history', () => {
    useMapStore.getState().setTile(0, 0, 'wall')
    useMapStore.getState().importMap({
      activeZ: 5,
      slices: { 'z:5': { '2,3': 'door' } },
      worldName: 'Imported World',
      tileSize: 16,
      themeId: 'cogmind',
    })

    const state = useMapStore.getState()
    expect(state.tiles).toEqual({ 'z:5': { '2,3': 'door' } })
    expect(state.activeZ).toBe(5)
    expect(state.worldName).toBe('Imported World')
    expect(state.tileSize).toBe(16)
    expect(state.themeId).toBe('cogmind')
    expect(state.history).toEqual([])
    expect(state.historyIndex).toBe(-1)
  })

  it('imports and exports voxels without losing unknown namespaced blocks', () => {
    useMapStore.getState().importVoxels({
      worldName: 'Voxel Import',
      activeZ: -3,
      voxels: [
        { block: 'glyphweave:wall', coord: [0, 0, 0] },
        { block: 'mystery.mod:forgotten/relic', coord: [-3, 4, 5] },
      ],
    })

    expect(useMapStore.getState().tiles['z:-3']).toEqual({
      '4,5': 'mystery.mod:forgotten/relic',
    })
    expect(useMapStore.getState().exportVoxels()).toEqual([
      { block: 'mystery.mod:forgotten/relic', coord: [-3, 4, 5] },
      { block: 'glyphweave:wall', coord: [0, 0, 0] },
    ])
  })

  it('exports only the active slice for the legacy render endpoint', () => {
    const customTheme: Theme = {
      id: ' midnight ',
      name: ' Midnight ',
      description: ' Custom palette ',
      colors: { wall: { fgColor: '#112233', bgColor: '#445566' } },
    }
    resetStore({
      worldName: 'Render Slice',
      tileSize: 32,
      themeId: 'ansi-16',
      activeZ: 2,
      initialTheme: customTheme,
      initialSlices: {
        'z:0': { '9,9': 'floor' },
        'z:2': { '0,0': 'wall' },
      },
    })

    expect(useMapStore.getState().exportMap()).toMatchObject({
      activeZ: 2,
      worldName: 'Render Slice',
      tileSize: 32,
      themeId: 'midnight',
      tiles: { '0,0': 'wall' },
      theme: {
        id: 'midnight',
        colors: { wall: { fgColor: '#112233', bgColor: '#445566' } },
      },
      version: 2,
    })
  })

  it('ignores active z values outside signed 32-bit space', () => {
    useMapStore.getState().setActiveZ(2_147_483_648)
    expect(useMapStore.getState().activeZ).toBe(0)
  })
})
