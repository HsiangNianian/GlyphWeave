import { describe, expect, it } from 'vitest'

import type { GenUiField, GenUiPlan } from '@/types'
import {
  ANCHOR_GAP,
  fieldNumber,
  fieldString,
  findFillableSeed,
  planToActions,
  resolveAnchor,
  visibleFields,
  withFieldValue,
  withIntent,
} from './gen-ui-apply'

function field(partial: Partial<GenUiField> & Pick<GenUiField, 'id' | 'type' | 'value'>): GenUiField {
  return {
    labelKey: `genUi.field.${partial.id}`,
    visibleFor: null,
    confidence: 0.9,
    options: null,
    ...partial,
  }
}

function plan(partial: Partial<GenUiPlan> & Pick<GenUiPlan, 'intent'>): GenUiPlan {
  return {
    model: 'jev-latest',
    confidence: 0.9,
    destructive: false,
    warningCodes: [],
    fields: [field({ id: 'intent', type: 'choice', value: partial.intent as string })],
    usage: null,
    ...partial,
  }
}

const BOUNDS = { minX: 0, minY: 0, maxX: 9, maxY: 9 }
const CONTEXT = { bounds: BOUNDS }

describe('resolveAnchor', () => {
  it('places relative anchors outside the current bounds with a gap', () => {
    expect(resolveAnchor('north_of_map', BOUNDS, { w: 5, h: 5 })).toEqual({ x: 0, y: -7 })
    expect(resolveAnchor('south_of_map', BOUNDS, { w: 5, h: 5 })).toEqual({ x: 0, y: 9 + 1 + ANCHOR_GAP })
    expect(resolveAnchor('east_of_map', BOUNDS, { w: 5, h: 5 })).toEqual({ x: 9 + 1 + ANCHOR_GAP, y: 0 })
    expect(resolveAnchor('west_of_map', BOUNDS, { w: 5, h: 5 })).toEqual({ x: -5 - ANCHOR_GAP, y: 0 })
  })

  it('centers the footprint on the map and falls back to the origin', () => {
    expect(resolveAnchor('center_of_map', BOUNDS, { w: 5, h: 5 })).toEqual({ x: 3, y: 3 })
    expect(resolveAnchor('map_origin', BOUNDS, { w: 5, h: 5 })).toEqual({ x: 0, y: 0 })
    expect(resolveAnchor('unknown', BOUNDS, { w: 5, h: 5 })).toEqual({ x: 0, y: 0 })
  })

  it('uses the viewport center for current_view and falls back to map center', () => {
    expect(resolveAnchor('current_view', BOUNDS, { w: 1, h: 1 }, { x: 42, y: -7 })).toEqual({ x: 42, y: -7 })
    expect(resolveAnchor('current_view', BOUNDS, { w: 5, h: 5 }, null)).toEqual({ x: 3, y: 3 })
  })
})

describe('findFillableSeed', () => {
  it('returns the center when it is painted', () => {
    expect(findFillableSeed({ x: 3, y: 3 }, { '3,3': 'floor' })).toEqual({ x: 3, y: 3 })
  })

  it('searches outward in rings for the nearest painted tile', () => {
    expect(findFillableSeed({ x: 0, y: 0 }, { '2,0': 'floor' })).toEqual({ x: 2, y: 0 })
    expect(findFillableSeed({ x: 0, y: 0 }, { '0,-3': 'floor' })).toEqual({ x: 0, y: -3 })
    expect(findFillableSeed({ x: 0, y: 0 }, { '1,1': 'wall' })).toEqual({ x: 1, y: 1 })
  })

  it('returns null on an empty map and passes through when tiles are unknown', () => {
    expect(findFillableSeed({ x: 0, y: 0 }, {})).toBeNull()
    expect(findFillableSeed({ x: 5, y: 5 }, null)).toEqual({ x: 5, y: 5 })
    expect(findFillableSeed({ x: 5, y: 5 }, undefined)).toEqual({ x: 5, y: 5 })
  })
})

describe('visibleFields', () => {
  it('keeps always-on fields and the chosen intent branch only', () => {
    const p = plan({
      intent: 'place_preset',
      fields: [
        field({ id: 'intent', type: 'choice', value: 'place_preset' }),
        field({ id: 'preset_id', type: 'choice', value: 'vault', visibleFor: ['place_preset'] }),
        field({ id: 'tile_id', type: 'choice', value: 'water', visibleFor: ['paint_tiles'] }),
      ],
    })
    expect(visibleFields(p).map((f) => f.id)).toEqual(['intent', 'preset_id'])
  })
})

describe('withFieldValue / withIntent', () => {
  it('does not mutate the source plan', () => {
    const p = plan({ intent: 'place_preset' })
    const next = withIntent(p, 'paint_tiles')
    expect(p.intent).toBe('place_preset')
    expect(next.intent).toBe('paint_tiles')

    const withPreset = plan({
      intent: 'place_preset',
      fields: [
        field({ id: 'intent', type: 'choice', value: 'place_preset' }),
        field({ id: 'preset_id', type: 'choice', value: 'vault' }),
      ],
    })
    const edited = withFieldValue(withPreset, 'preset_id', 'prison')
    expect(fieldString(withPreset, 'preset_id')).toBe('vault')
    expect(fieldString(edited, 'preset_id')).toBe('prison')
  })

  it('reads typed values', () => {
    const p = plan({
      intent: 'paint_tiles',
      fields: [
        field({ id: 'intent', type: 'choice', value: 'paint_tiles' }),
        field({ id: 'tile_id', type: 'choice', value: 'lava' }),
        field({ id: 'overwrites_existing', type: 'noul', value: 0.8 }),
      ],
    })
    expect(fieldString(p, 'tile_id')).toBe('lava')
    expect(fieldNumber(p, 'overwrites_existing')).toBe(0.8)
    expect(fieldString(p, 'overwrites_existing')).toBeNull()
    expect(fieldString(p, 'missing')).toBeNull()
  })
})

describe('planToActions', () => {
  it('maps a place_preset plan to placePreset using the resolved anchor', () => {
    const p = plan({
      intent: 'place_preset',
      fields: [
        field({ id: 'intent', type: 'choice', value: 'place_preset' }),
        field({ id: 'preset_id', type: 'choice', value: 'small-room', visibleFor: ['place_preset'] }),
        field({ id: 'placement_anchor', type: 'choice', value: 'map_origin', visibleFor: ['place_preset'] }),
      ],
    })
    expect(planToActions(p, CONTEXT)).toEqual([
      {
        kind: 'tool',
        tool: 'placePreset',
        args: { presetId: 'small-room', x: 0, y: 0 },
        label: 'placePreset small-room @ (0, 0)',
      },
    ])
  })

  it('maps paint_tiles to placeTile or fillArea by shape', () => {
    const base = [
      field({ id: 'intent', type: 'choice', value: 'paint_tiles' }),
      field({ id: 'tile_id', type: 'choice', value: 'water', visibleFor: ['paint_tiles'] }),
      field({ id: 'placement_anchor', type: 'choice', value: 'map_origin', visibleFor: ['paint_tiles'] }),
    ]
    const single = plan({
      intent: 'paint_tiles',
      fields: [...base, field({ id: 'paint_shape', type: 'choice', value: 'single_tile' })],
    })
    expect(planToActions(single, CONTEXT)[0]).toMatchObject({ tool: 'placeTile' })

    const flood = plan({
      intent: 'paint_tiles',
      fields: [...base, field({ id: 'paint_shape', type: 'choice', value: 'flood_fill' })],
    })
    expect(planToActions(flood, CONTEXT)[0]).toMatchObject({
      tool: 'fillArea',
      args: { x: 0, y: 0, tileId: 'water' },
    })
  })

  it('resolves the flood-fill seed to the nearest painted tile', () => {
    const flood = plan({
      intent: 'paint_tiles',
      fields: [
        field({ id: 'intent', type: 'choice', value: 'paint_tiles' }),
        field({ id: 'tile_id', type: 'choice', value: 'water', visibleFor: ['paint_tiles'] }),
        field({ id: 'placement_anchor', type: 'choice', value: 'map_origin', visibleFor: ['paint_tiles'] }),
        field({ id: 'paint_shape', type: 'choice', value: 'flood_fill' }),
      ],
    })

    const context = { bounds: BOUNDS, tiles: { '4,4': 'floor' } }
    expect(planToActions(flood, context)[0]).toMatchObject({
      tool: 'fillArea',
      args: { x: 4, y: 4, tileId: 'water' },
    })

    // Nothing painted yet: no seed, so no action.
    expect(planToActions(flood, { bounds: BOUNDS, tiles: {} })).toEqual([])
  })

  it('maps adjust_view to a ui action', () => {
    const p = plan({
      intent: 'adjust_view',
      fields: [
        field({ id: 'intent', type: 'choice', value: 'adjust_view' }),
        field({ id: 'view_action', type: 'choice', value: 'toggle_grid', visibleFor: ['adjust_view'] }),
      ],
    })
    expect(planToActions(p, CONTEXT)).toEqual([{ kind: 'ui', action: 'toggle_grid', label: 'toggle_grid' }])
  })

  it('returns no actions for incomplete or invalid plans', () => {
    expect(planToActions(plan({ intent: null }), CONTEXT)).toEqual([])
    expect(planToActions(plan({ intent: 'unsupported' }), CONTEXT)).toEqual([])

    const badPreset = plan({
      intent: 'place_preset',
      fields: [
        field({ id: 'preset_id', type: 'choice', value: 'does-not-exist' }),
        field({ id: 'placement_anchor', type: 'choice', value: 'map_origin' }),
      ],
    })
    expect(planToActions(badPreset, CONTEXT)).toEqual([])

    const voidTile = plan({
      intent: 'paint_tiles',
      fields: [
        field({ id: 'tile_id', type: 'choice', value: 'void' }),
        field({ id: 'paint_shape', type: 'choice', value: 'single_tile' }),
      ],
    })
    expect(planToActions(voidTile, CONTEXT)).toEqual([])
  })
})
