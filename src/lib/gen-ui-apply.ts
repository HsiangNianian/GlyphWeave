/**
 * Generative UI apply layer.
 *
 * Pure helpers that turn a TypeSafe (Jev) action plan into concrete editor
 * actions. Code owns the mapping from typed model decisions to tool calls and
 * store actions, so the model can never emit arbitrary behavior.
 */

import type { GenUiField, GenUiIntent, GenUiPlan } from '@/types'
import { PRESETS } from '@/constants/presets'
import { TILE_TYPES } from '@/constants/tiles'
import { formatTileKey } from '@/lib/map-core'

/** Empty-space padding, in tiles, used when placing relative to the map. */
export const ANCHOR_GAP = 2

/** How far to search, in tiles, for a flood-fill seed near an empty anchor. */
export const MAX_SEED_SEARCH = 96

/** Safety cap on the number of tiles a generated draw may stamp in one go. */
export const MAX_DRAW_TILES = 4096

/** Named draw lengths, in tiles. Mirrors the server's option labels. */
export const DRAW_LENGTHS: Record<string, number> = { short: 5, medium: 10, long: 20 }

export type GenUiDirection = 'north' | 'south' | 'east' | 'west'

export interface TileEntry {
  x: number
  y: number
  tileId: string
}

export interface PlanBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface Footprint {
  w: number
  h: number
}

/** Everything code may use to translate a plan into real actions. */
export interface PlanContext {
  bounds: PlanBounds
  /** Active-slice tiles, keyed by `formatTileKey`. Enables seed resolution. */
  tiles?: Readonly<Record<string, unknown>> | null
  /** Tile under the center of the current viewport, if it can be computed. */
  viewportCenter?: { x: number; y: number } | null
}

export type GenUiViewAction =
  | 'zoom_in'
  | 'zoom_out'
  | 'reset_zoom'
  | 'toggle_grid'
  | 'toggle_minimap'

export type GenUiAction =
  | { kind: 'tool'; tool: 'placePreset'; args: { presetId: string; x: number; y: number }; label: string }
  | { kind: 'tool'; tool: 'placeTile'; args: { x: number; y: number; tileId: string }; label: string }
  | { kind: 'tool'; tool: 'fillArea'; args: { x: number; y: number; tileId: string }; label: string }
  | { kind: 'tool'; tool: 'placeMultipleTiles'; args: { tiles: TileEntry[] }; label: string }
  | { kind: 'ui'; action: GenUiViewAction; label: string }

const VALID_VIEW_ACTIONS: readonly GenUiViewAction[] = [
  'zoom_in',
  'zoom_out',
  'reset_zoom',
  'toggle_grid',
  'toggle_minimap',
]

/** Fields that apply to the plan's chosen intent, in display order. */
export function visibleFields(plan: GenUiPlan): GenUiField[] {
  const intent = plan.intent
  return plan.fields.filter((field) => {
    const intentMatches =
      field.visibleFor === null || (intent !== null && field.visibleFor.includes(intent))
    if (!intentMatches) return false
    if (!field.visibleWhen) return true
    const dependency = plan.fields.find((f) => f.id === field.visibleWhen?.field)
    return (
      typeof dependency?.value === 'string' &&
      field.visibleWhen.values.includes(dependency.value)
    )
  })
}

/** Read a field's string value (choice), or null when absent. */
export function fieldString(plan: GenUiPlan, id: string): string | null {
  const field = plan.fields.find((f) => f.id === id)
  if (!field || typeof field.value !== 'string') return null
  return field.value
}

/** Read a field's numeric value (noul/score), or null when absent. */
export function fieldNumber(plan: GenUiPlan, id: string): number | null {
  const field = plan.fields.find((f) => f.id === id)
  if (!field || typeof field.value !== 'number') return null
  return field.value
}

/** Immutably update one field's value — used by the generated controls. */
export function withFieldValue(plan: GenUiPlan, id: string, value: string | number): GenUiPlan {
  const next: GenUiPlan = {
    ...plan,
    fields: plan.fields.map((field) => (field.id === id ? { ...field, value } : field)),
  }
  // The intent field drives the plan branch, so keep the top-level value in sync.
  if (id === 'intent' && typeof value === 'string') {
    next.intent = value as GenUiIntent
  }
  return next
}

/** Immutably switch the dispatched intent. */
export function withIntent(plan: GenUiPlan, intent: GenUiIntent): GenUiPlan {
  return withFieldValue(plan, 'intent', intent)
}

/**
 * Resolve a named anchor to a top-left tile coordinate for the given
 * footprint. All math is in tile space; code decides placement, not the model.
 * `current_view` needs a viewport center; it falls back to the map center.
 */
export function resolveAnchor(
  anchor: string | null,
  bounds: PlanBounds,
  footprint: Footprint,
  viewportCenter: { x: number; y: number } | null = null,
): { x: number; y: number } {
  const { minX, minY, maxX, maxY } = bounds
  switch (anchor) {
    case 'current_view':
      return viewportCenter ?? resolveAnchor('center_of_map', bounds, footprint)
    case 'center_of_map':
      return {
        x: Math.round((minX + maxX) / 2 - (footprint.w - 1) / 2),
        y: Math.round((minY + maxY) / 2 - (footprint.h - 1) / 2),
      }
    case 'north_of_map':
      return { x: minX, y: minY - footprint.h - ANCHOR_GAP }
    case 'south_of_map':
      return { x: minX, y: maxY + 1 + ANCHOR_GAP }
    case 'east_of_map':
      return { x: maxX + 1 + ANCHOR_GAP, y: minY }
    case 'west_of_map':
      return { x: minX - footprint.w - ANCHOR_GAP, y: minY }
    case 'map_origin':
    default:
      return { x: 0, y: 0 }
  }
}

/**
 * Find the nearest painted tile to `center`, searching outward in square
 * rings. `floodFill` only acts on a tile that already exists, so code must
 * pick a real seed instead of trusting a semantic anchor. Returns null when
 * nothing is painted within `maxRadius` — the caller then emits no action.
 */
export function findFillableSeed(
  center: { x: number; y: number },
  tiles: Readonly<Record<string, unknown>> | null | undefined,
  maxRadius: number = MAX_SEED_SEARCH,
): { x: number; y: number } | null {
  if (!tiles) return center
  if (Object.keys(tiles).length === 0) return null

  const painted = (x: number, y: number): boolean => tiles[formatTileKey(x, y)] != null
  if (painted(center.x, center.y)) return center

  for (let r = 1; r <= maxRadius; r++) {
    for (let dx = -r; dx <= r; dx++) {
      if (painted(center.x + dx, center.y - r)) return { x: center.x + dx, y: center.y - r }
      if (painted(center.x + dx, center.y + r)) return { x: center.x + dx, y: center.y + r }
    }
    for (let dy = -r + 1; dy <= r - 1; dy++) {
      if (painted(center.x - r, center.y + dy)) return { x: center.x - r, y: center.y + dy }
      if (painted(center.x + r, center.y + dy)) return { x: center.x + r, y: center.y + dy }
    }
  }
  return null
}

function presetFootprint(presetId: string): Footprint | null {
  const preset = PRESETS.find((p) => p.id === presetId)
  if (!preset) return null
  return { w: preset.grid[0]?.length ?? 1, h: preset.grid.length }
}

/** Expand a straight line from `anchor`, extending in `direction`. */
export function expandLine(
  anchor: { x: number; y: number },
  direction: GenUiDirection,
  lengthTiles: number,
  widthTiles: number,
  tileId: string,
): TileEntry[] {
  const entries: TileEntry[] = []
  const half = Math.floor((Math.max(1, widthTiles) - 1) / 2)
  const alongX = direction === 'east' || direction === 'west'
  const sign = direction === 'east' || direction === 'south' ? 1 : -1

  for (let i = 0; i < lengthTiles && entries.length < MAX_DRAW_TILES; i++) {
    for (let w = -half; w <= half && entries.length < MAX_DRAW_TILES; w++) {
      entries.push(
        alongX
          ? { x: anchor.x + sign * i, y: anchor.y + w, tileId }
          : { x: anchor.x + w, y: anchor.y + sign * i, tileId },
      )
    }
  }
  return entries
}

/** Expand a solid rectangle with `anchor` as its top-left corner. */
export function expandRectangle(
  anchor: { x: number; y: number },
  widthTiles: number,
  heightTiles: number,
  tileId: string,
): TileEntry[] {
  const entries: TileEntry[] = []
  for (let dy = 0; dy < heightTiles && entries.length < MAX_DRAW_TILES; dy++) {
    for (let dx = 0; dx < widthTiles && entries.length < MAX_DRAW_TILES; dx++) {
      entries.push({ x: anchor.x + dx, y: anchor.y + dy, tileId })
    }
  }
  return entries
}

function drawLength(plan: GenUiPlan, id: string, fallback = 10): number {
  const key = fieldString(plan, id)
  return (key && DRAW_LENGTHS[key]) || fallback
}

/**
 * Map a plan to editor actions. Returns an empty list when the plan is
 * incomplete, references unknown catalog entries, or cannot be placed —
 * never throws.
 */
export function planToActions(plan: GenUiPlan, context: PlanContext): GenUiAction[] {
  if (!plan.intent) return []
  const { bounds } = context
  const viewportCenter = context.viewportCenter ?? null

  if (plan.intent === 'place_preset') {
    const presetId = fieldString(plan, 'preset_id')
    if (!presetId) return []
    const footprint = presetFootprint(presetId)
    if (!footprint) return []
    const { x, y } = resolveAnchor(
      fieldString(plan, 'placement_anchor'),
      bounds,
      footprint,
      viewportCenter,
    )
    return [
      {
        kind: 'tool',
        tool: 'placePreset',
        args: { presetId, x, y },
        label: `placePreset ${presetId} @ (${x}, ${y})`,
      },
    ]
  }

  if (plan.intent === 'paint_tiles') {
    const tileId = fieldString(plan, 'tile_id')
    if (!tileId || tileId === 'void' || !TILE_TYPES[tileId]) return []
    const anchor = resolveAnchor(
      fieldString(plan, 'placement_anchor'),
      bounds,
      { w: 1, h: 1 },
      viewportCenter,
    )
    const shape = fieldString(plan, 'paint_shape')

    if (shape === 'flood_fill') {
      const seed = findFillableSeed(anchor, context.tiles)
      if (!seed) return []
      return [
        {
          kind: 'tool',
          tool: 'fillArea',
          args: { x: seed.x, y: seed.y, tileId },
          label: `fillArea ${tileId} @ (${seed.x}, ${seed.y})`,
        },
      ]
    }

    if (shape === 'line') {
      const direction = (fieldString(plan, 'draw_direction') ?? 'east') as GenUiDirection
      const length = drawLength(plan, 'draw_length')
      const width = Number(fieldString(plan, 'draw_width') ?? '1') || 1
      const tiles = expandLine(anchor, direction, length, width, tileId)
      if (tiles.length === 0) return []
      return [
        {
          kind: 'tool',
          tool: 'placeMultipleTiles',
          args: { tiles },
          label: `draw ${tiles.length} × ${tileId} ${direction} from (${anchor.x}, ${anchor.y})`,
        },
      ]
    }

    if (shape === 'rectangle') {
      const width = drawLength(plan, 'draw_length')
      const height = drawLength(plan, 'draw_height', width)
      const tiles = expandRectangle(anchor, width, height, tileId)
      if (tiles.length === 0) return []
      return [
        {
          kind: 'tool',
          tool: 'placeMultipleTiles',
          args: { tiles },
          label: `rectangle ${width}×${height} × ${tileId} @ (${anchor.x}, ${anchor.y})`,
        },
      ]
    }

    return [
      {
        kind: 'tool',
        tool: 'placeTile',
        args: { x: anchor.x, y: anchor.y, tileId },
        label: `placeTile ${tileId} @ (${anchor.x}, ${anchor.y})`,
      },
    ]
  }

  if (plan.intent === 'adjust_view') {
    const action = fieldString(plan, 'view_action') as GenUiViewAction | null
    if (!action || !VALID_VIEW_ACTIONS.includes(action)) return []
    return [{ kind: 'ui', action, label: action }]
  }

  return []
}
