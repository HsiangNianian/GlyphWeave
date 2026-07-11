/**
 * Client-side tool execution functions for the AI chat assistant.
 *
 * These functions are called when the AI model requests a tool invocation via
 * the `onToolCall` callback in `useChat`. They directly operate on the Zustand
 * map store, bridging the AI ↔ editor gap.
 */

import { useMapStore } from '@/stores/map-store'
import { TILE_TYPES, TILE_CATEGORIES } from '@/constants/tiles'
import { PRESETS } from '@/constants/presets'
import { validateMap } from '@/lib/map-validate'
import { formatVoxelSliceId, type VoxelSliceTiles } from '@/lib/voxel-map'

export interface ToolResult {
  success: boolean
  message: string
  data?: unknown
}

function ok(message: string, data?: unknown): ToolResult {
  return { success: true, message, data }
}

function fail(message: string): ToolResult {
  return { success: false, message }
}

const ALL_TILE_IDS = Object.keys(TILE_TYPES).filter((k) => k !== 'void').join(', ')

function countTiles(tiles: VoxelSliceTiles | undefined): number {
  if (!tiles) return 0
  return Object.values(tiles).filter((tileId) => tileId != null).length
}

/** Validate a tileId from AI tool call input — defends against undefined/null/missing. */
function validateTileId(tileId: unknown): { valid: false; error: string } | { valid: true; id: string } {
  if (tileId == null || tileId === '') {
    return { valid: false, error: `Missing tileId — you must provide a tile type. Available: ${ALL_TILE_IDS}` }
  }
  if (typeof tileId !== 'string') {
    return { valid: false, error: `tileId must be a string, got ${typeof tileId}. Available: ${ALL_TILE_IDS}` }
  }
  if (!TILE_TYPES[tileId]) {
    return { valid: false, error: `Unknown tile type "${tileId}". Available types: ${ALL_TILE_IDS}` }
  }
  if (tileId === 'void') {
    return { valid: false, error: 'Cannot place void tiles directly. Use the eraser tool to remove tiles.' }
  }
  return { valid: true, id: tileId }
}

/** Get a high-level summary of the current map state for the AI. */
export function getMapState(): ToolResult {
  const state = useMapStore.getState()
  const activeSliceId = formatVoxelSliceId(state.activeZ)

  return ok('Current map state retrieved.', {
    worldName: state.worldName,
    tileSize: state.tileSize,
    themeId: state.themeId,
    activeZ: state.activeZ,
    activeSlice: activeSliceId,
    slices: Object.entries(state.tiles).map(([sliceId, tiles]) => ({
      sliceId,
      active: sliceId === activeSliceId,
      tileCount: countTiles(tiles),
    })),
    activeSliceTileCount: countTiles(state.tiles[activeSliceId]),
    activeTool: state.currentTool,
    activeTileType: state.activeTileType,
  })
}

/** List all available tile types grouped by category. */
export function getTileTypes(): ToolResult {
  const categoryMap: Record<string, { id: string; name: string }[]> = {}

  for (const cat of TILE_CATEGORIES) {
    categoryMap[cat.key] = []
  }

  for (const tile of Object.values(TILE_TYPES)) {
    if (tile.id === 'void') continue // skip void — not placeable
    if (categoryMap[tile.category]) {
      categoryMap[tile.category].push({ id: tile.id, name: tile.name })
    }
  }

  // Remove empty categories
  for (const key of Object.keys(categoryMap)) {
    if (categoryMap[key].length === 0) delete categoryMap[key]
  }

  return ok('Available tile types retrieved.', categoryMap)
}

/** List all available presets grouped by category. */
export function getPresets(): ToolResult {
  const grouped: Record<string, { id: string; name: string; description: string; width: number; height: number }[]> = {}

  for (const preset of PRESETS) {
    if (!grouped[preset.category]) grouped[preset.category] = []
    grouped[preset.category].push({
      id: preset.id,
      name: preset.name,
      description: preset.description,
      width: preset.grid[0]?.length ?? 0,
      height: preset.grid.length,
    })
  }

  return ok('Available presets retrieved.', grouped)
}

/** Place a single tile at the given coordinates. */
export function placeTile(args: { x: number; y: number; tileId: string }): ToolResult {
  const { x, y } = args

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return fail(`Invalid coordinates: x=${args.x}, y=${args.y}. Both must be finite numbers.`)
  }

  const check = validateTileId(args.tileId)
  if (!check.valid) return fail(check.error)
  const tileId = check.id

  const store = useMapStore.getState()
  store.setTile(x, y, tileId)
  return ok(`Placed "${TILE_TYPES[tileId].name}" at (${x}, ${y}).`)
}

/** Place a preset structure at the given origin. */
export function placePreset(args: { presetId: string; x: number; y: number }): ToolResult {
  const { presetId, x, y } = args

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return fail('Invalid coordinates: x and y must be numbers')
  }

  const preset = PRESETS.find((p) => p.id === presetId)
  if (!preset) {
    const available = PRESETS.map((p) => `${p.id} (${p.name})`).join(', ')
    return fail(`Unknown preset "${presetId}". Available: ${available}`)
  }

  const store = useMapStore.getState()
  store.placePreset(preset, x, y)
  const w = preset.grid[0]?.length ?? 0
  const h = preset.grid.length
  return ok(`Placed preset "${preset.name}" (${w}×${h}) at (${x}, ${y}).`)
}

/** Flood-fill an area starting from (x, y). Only fills the connected region — does NOT cross walls. */
export function fillArea(args: { x: number; y: number; tileId: string }): ToolResult {
  const { x, y } = args

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return fail(`Invalid coordinates: x=${args.x}, y=${args.y}. Both must be finite numbers.`)
  }

  const check = validateTileId(args.tileId)
  if (!check.valid) return fail(check.error)
  const tileId = check.id

  const store = useMapStore.getState()
  store.floodFill(x, y, tileId)
  return ok(`Flood-filled area starting at (${x}, ${y}) with "${TILE_TYPES[tileId].name}".`)
}

/** Place multiple tiles in a batch. Use this for drawing corridors between disconnected rooms. */
export function placeMultipleTiles(args: { tiles: { x: number; y: number; tileId: string }[] }): ToolResult {
  if (!args.tiles || !Array.isArray(args.tiles) || args.tiles.length === 0) {
    return fail('No tiles provided. You must pass an array of {x, y, tileId} objects.')
  }

  const store = useMapStore.getState()
  const validTiles: [number, number, string | null][] = []
  const invalid: string[] = []

  for (let i = 0; i < args.tiles.length; i++) {
    const t = args.tiles[i]
    if (!Number.isFinite(t.x) || !Number.isFinite(t.y)) {
      invalid.push(`[${i}]: invalid coordinates (x=${t.x}, y=${t.y})`)
      continue
    }
    const check = validateTileId(t.tileId)
    if (!check.valid) {
      invalid.push(`[${i}]: ${check.error}`)
      continue
    }
    validTiles.push([t.x, t.y, check.id])
  }

  if (validTiles.length === 0) {
    return fail(`No valid tiles to place. Errors: ${invalid.join('; ')}`)
  }

  store.setTiles(validTiles)

  let msg = `Placed ${validTiles.length} tile(s).`
  if (invalid.length > 0) {
    msg += ` Skipped ${invalid.length}: ${invalid.join('; ')}`
  }
  return ok(msg)
}

/** Undo the last change. */
export function undoLastChange(): ToolResult {
  const store = useMapStore.getState()
  if (store.historyIndex < 0) {
    return fail('Nothing to undo')
  }
  store.undo()
  return ok('Last change undone.')
}

/** Validate the current map for connectivity and logic issues. */
export function runValidateMap(): ToolResult {
  const state = useMapStore.getState()
  const activeSliceId = formatVoxelSliceId(state.activeZ)
  const flatTiles = { ...(state.tiles[activeSliceId] ?? {}) }
  const report = validateMap(flatTiles as Record<string, string | null>)
  return ok('Map validation complete.', report)
}

/** Dispatch table — maps tool names to their execution functions. */
export const TOOL_EXECUTORS: Record<string, (args: Record<string, unknown>) => ToolResult> = {
  getMapState: () => getMapState(),
  getTileTypes: () => getTileTypes(),
  getPresets: () => getPresets(),
  placeTile: (args) => placeTile(args as unknown as { x: number; y: number; tileId: string }),
  placePreset: (args) => placePreset(args as unknown as { presetId: string; x: number; y: number }),
  fillArea: (args) => fillArea(args as unknown as { x: number; y: number; tileId: string }),
  placeMultipleTiles: (args) => placeMultipleTiles(args as unknown as { tiles: { x: number; y: number; tileId: string }[] }),
  undoLastChange: () => undoLastChange(),
  validateMap: () => runValidateMap(),
}
