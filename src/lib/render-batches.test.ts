import { describe, expect, it } from 'vitest'

import { buildTileRenderBatches } from './render-batches'
import { DEFAULT_RENDER_THEMES } from './render-surface'

describe('tile render batches', () => {
  it('groups tiles by resolved surface glyph and colors', () => {
    const batches = buildTileRenderBatches([
      { gridX: 0, gridY: 0, key: 'z:0:0,0', layerId: 'z:0', tileKey: '0,0', tileTypeId: 'wall' },
      { gridX: 1, gridY: 0, key: 'z:0:1,0', layerId: 'z:0', tileKey: '1,0', tileTypeId: 'wall' },
      { gridX: 2, gridY: 0, key: 'z:0:2,0', layerId: 'z:0', tileKey: '2,0', tileTypeId: 'future-mod:blue/crystal' },
    ], DEFAULT_RENDER_THEMES['ansi-16'].colors)

    expect(batches).toEqual([
      {
        bgColor: '#000000',
        cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
        fgColor: '#a0a0a0',
        glyph: '#',
      },
      {
        bgColor: '#180b12',
        cells: [{ x: 2, y: 0 }],
        fgColor: '#f472b6',
        glyph: '?',
      },
    ])
  })
})
