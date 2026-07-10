import { describe, expect, it } from 'vitest'

import {
  DEFAULT_RENDER_THEMES,
  RENDER_SURFACE_PROTOCOL_VERSION,
  TILE_SURFACES,
  blockNameToTileToken,
  renderSurfaceForTileToken,
  resolveTileRenderStyle,
  tileTokenToBlockName,
} from './render-surface'

describe('render surface protocol', () => {
  it('round-trips every known non-air tile through its block name', () => {
    expect(RENDER_SURFACE_PROTOCOL_VERSION).toBe(1)
    for (const surface of Object.values(TILE_SURFACES)) {
      if (surface.tileId === 'void') continue
      expect(tileTokenToBlockName(surface.tileId)).toBe(surface.blockName)
      expect(blockNameToTileToken(surface.blockName)).toBe(surface.tileId)
    }
  })

  it('keeps unknown namespaced blocks renderable with a fallback surface', () => {
    expect(blockNameToTileToken('future-mod:blue/crystal')).toBe('future-mod:blue/crystal')

    const surface = renderSurfaceForTileToken('future-mod:blue/crystal')
    expect(surface).toMatchObject({
      blockName: 'future-mod:blue/crystal',
      glyph: '?',
      traits: ['unknown'],
    })
    expect(resolveTileRenderStyle(DEFAULT_RENDER_THEMES['ansi-16'], surface?.tileId)).toEqual({
      colors: { fgColor: '#f472b6', bgColor: '#180b12' },
      surface,
    })
  })

  it('default themes cover every protocol tile surface', () => {
    for (const [themeId, theme] of Object.entries(DEFAULT_RENDER_THEMES)) {
      for (const surface of Object.values(TILE_SURFACES)) {
        expect(theme.colors[surface.tileId], `${themeId} missing ${surface.tileId}`).toBeDefined()
      }
    }
  })
})
