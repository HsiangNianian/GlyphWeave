import { beforeEach, describe, expect, it } from 'vitest'

import type { Theme, WorldConfig } from '@/types'
import { useMapStore } from './map-store'

const testWorld: WorldConfig = {
  worldName: 'Test World',
  tileSize: 24,
  themeId: 'ansi-16',
}

function resetStore(config: WorldConfig = testWorld): void {
  useMapStore.getState().initWorld(config)
}

describe('map-store', () => {
  beforeEach(() => {
    resetStore()
  })

  it('records setTile edits as delta history and supports undo/redo', () => {
    const store = useMapStore.getState()

    store.setTile(1, 2, 'wall')

    expect(useMapStore.getState().tiles).toEqual({
      'layer-1': { '1,2': 'wall' },
    })
    expect(useMapStore.getState().history).toEqual([
      {
        patches: [
          { layerId: 'layer-1', key: '1,2', before: null, after: 'wall' },
        ],
      },
    ])
    expect(useMapStore.getState().historyIndex).toBe(0)

    useMapStore.getState().undo()

    expect(useMapStore.getState().tiles).toEqual({ 'layer-1': {} })
    expect(useMapStore.getState().historyIndex).toBe(-1)

    useMapStore.getState().redo()

    expect(useMapStore.getState().tiles).toEqual({
      'layer-1': { '1,2': 'wall' },
    })
    expect(useMapStore.getState().historyIndex).toBe(0)
  })

  it('records setTiles edits as one delta transaction and supports undo/redo', () => {
    useMapStore.getState().setTiles([
      [0, 0, 'floor'],
      [1, 0, 'wall'],
      [0, 0, 'water'],
    ])

    expect(useMapStore.getState().tiles).toEqual({
      'layer-1': {
        '0,0': 'water',
        '1,0': 'wall',
      },
    })
    expect(useMapStore.getState().history).toEqual([
      {
        patches: [
          { layerId: 'layer-1', key: '0,0', before: null, after: 'water' },
          { layerId: 'layer-1', key: '1,0', before: null, after: 'wall' },
        ],
      },
    ])

    useMapStore.getState().undo()

    expect(useMapStore.getState().tiles).toEqual({ 'layer-1': {} })
    expect(useMapStore.getState().historyIndex).toBe(-1)

    useMapStore.getState().redo()

    expect(useMapStore.getState().tiles).toEqual({
      'layer-1': {
        '0,0': 'water',
        '1,0': 'wall',
      },
    })
    expect(useMapStore.getState().historyIndex).toBe(0)
  })

  it('stores floodFill as one history entry', () => {
    resetStore({
      ...testWorld,
      initialTiles: {
        '0,0': 'water',
        '1,0': 'water',
        '2,0': 'water',
        '0,1': 'wall',
        '1,1': 'floor',
      },
    })

    useMapStore.getState().floodFill(0, 0, 'lava')

    expect(useMapStore.getState().tiles).toEqual({
      'layer-1': {
        '0,0': 'lava',
        '1,0': 'lava',
        '2,0': 'lava',
        '0,1': 'wall',
        '1,1': 'floor',
      },
    })
    expect(useMapStore.getState().history).toHaveLength(1)
    expect(useMapStore.getState().history[0]?.patches).toEqual([
      { layerId: 'layer-1', key: '0,0', before: 'water', after: 'lava' },
      { layerId: 'layer-1', key: '1,0', before: 'water', after: 'lava' },
      { layerId: 'layer-1', key: '2,0', before: 'water', after: 'lava' },
    ])

    useMapStore.getState().undo()

    expect(useMapStore.getState().tiles).toEqual({
      'layer-1': {
        '0,0': 'water',
        '1,0': 'water',
        '2,0': 'water',
        '0,1': 'wall',
        '1,1': 'floor',
      },
    })

    useMapStore.getState().redo()

    expect(useMapStore.getState().tiles['layer-1']?.['0,0']).toBe('lava')
    expect(useMapStore.getState().historyIndex).toBe(0)
  })

  it('resets undo history when importing a map', () => {
    useMapStore.getState().setTile(0, 0, 'wall')
    expect(useMapStore.getState().historyIndex).toBe(0)

    useMapStore.getState().importMap({
      tiles: { '2,3': 'door' },
      worldName: 'Imported World',
      tileSize: 16,
      themeId: 'cogmind',
    })

    expect(useMapStore.getState().tiles).toEqual({
      'layer-1': { '2,3': 'door' },
    })
    expect(useMapStore.getState().worldName).toBe('Imported World')
    expect(useMapStore.getState().tileSize).toBe(16)
    expect(useMapStore.getState().themeId).toBe('cogmind')
    expect(useMapStore.getState().history).toEqual([])
    expect(useMapStore.getState().historyIndex).toBe(-1)

    useMapStore.getState().redo()

    expect(useMapStore.getState().tiles).toEqual({
      'layer-1': { '2,3': 'door' },
    })
  })

  it('stores custom initialTheme and includes it on export', () => {
    const customTheme: Theme = {
      id: ' midnight ',
      name: ' Midnight ',
      description: ' Custom palette ',
      colors: {
        wall: { fgColor: '#112233', bgColor: '#445566' },
      },
    }

    resetStore({
      worldName: 'Custom Theme World',
      tileSize: 32,
      themeId: 'ansi-16',
      initialTheme: customTheme,
      initialTiles: { '0,0': 'wall' },
    })

    const state = useMapStore.getState()
    const exported = state.exportMap()

    expect(state.themeId).toBe('midnight')
    expect(state.customThemes.midnight).toMatchObject({
      id: 'midnight',
      name: 'Midnight',
      description: 'Custom palette',
      colors: {
        wall: { fgColor: '#112233', bgColor: '#445566' },
      },
    })
    expect(exported).toMatchObject({
      worldName: 'Custom Theme World',
      tileSize: 32,
      themeId: 'midnight',
      tiles: { '0,0': 'wall' },
      theme: {
        id: 'midnight',
        name: 'Midnight',
        description: 'Custom palette',
        colors: {
          wall: { fgColor: '#112233', bgColor: '#445566' },
        },
      },
      version: 2,
    })
  })
})
