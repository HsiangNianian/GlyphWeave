/**
 * Multi-step dungeon builder.
 *
 * The loop lives in code. Each iteration asks Jev for one bounded decision
 * (next preset, next direction, whether to continue), places it, and asks
 * again with the updated state. All geometry — room placement, collision
 * avoidance, corridors, doors — is deterministic and pure so it can be tested
 * without the network or the editor.
 */

import type {
  DungeonDirection,
  DungeonPlan,
  DungeonProgress,
  DungeonRoom,
  DungeonStep,
} from '@/types'
import { PRESETS } from '@/constants/presets'
import type { PlanBounds, TileEntry } from '@/lib/gen-ui-apply'

/** Empty-space padding between generated rooms, in tiles. */
export const ROOM_GAP = 3

/** Hard cap so a runaway model can never flood the editor. */
export const MAX_DUNGEON_ROOMS = 12
export const MAX_DUNGEON_STEPS = 16

/** Safety cap on corridor tiles emitted in one batch. */
export const MAX_CORRIDOR_TILES = 4096

export interface RoomFootprint {
  w: number
  h: number
}

export interface DungeonEditorContext {
  worldName: string
  themeId: string
  activeZ: number
  paintedTileCount: number
  bounds: PlanBounds
}

export interface DungeonToolAction {
  tool: 'placePreset' | 'placeMultipleTiles'
  args: Record<string, unknown>
}

export interface DungeonResult {
  rooms: DungeonRoom[]
  connect: boolean
  targetRooms: number
  warnings: string[]
}

export interface DungeonGeneratorOptions {
  goal: string
  editor: DungeonEditorContext
  maxRooms?: number
  /** Where the first room goes. Defaults to the origin; the UI offsets past existing content. */
  startOrigin?: { x: number; y: number }
  signal?: AbortSignal
  onProgress?: (progress: DungeonProgress) => void
  fetchImpl?: typeof fetch
  place: (action: DungeonToolAction) => void
}

// ── Pure geometry ───────────────────────────────────────────────────────

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

/**
 * Origin for the next room, extending from the previously placed room in the
 * chosen direction. Starts at the origin when nothing is placed yet.
 */
export function resolveNextRoomOrigin(
  placed: readonly DungeonRoom[],
  direction: DungeonDirection,
  footprint: RoomFootprint,
  gap = ROOM_GAP,
  start: { x: number; y: number } = { x: 0, y: 0 },
): { x: number; y: number } {
  if (placed.length === 0) return { ...start }
  const last = placed[placed.length - 1]
  switch (direction) {
    case 'north':
      return { x: last.x, y: last.y - footprint.h - gap }
    case 'south':
      return { x: last.x, y: last.y + last.h + gap }
    case 'west':
      return { x: last.x - footprint.w - gap, y: last.y }
    case 'east':
    default:
      return { x: last.x + last.w + gap, y: last.y }
  }
}

/**
 * Shift a candidate room outward along its direction until it no longer
 * overlaps anything already placed. Bounded, so a dense map degrades politely.
 */
export function shiftToAvoidOverlap(
  origin: { x: number; y: number },
  footprint: RoomFootprint,
  placed: readonly DungeonRoom[],
  direction: DungeonDirection,
): { x: number; y: number } {
  let candidate = { ...origin }
  for (let attempt = 0; attempt <= placed.length; attempt++) {
    const rect = { ...candidate, ...footprint }
    const colliding = placed.filter((room) => rectsIntersect(rect, room))
    if (colliding.length === 0) return candidate

    if (direction === 'east') {
      candidate.x = Math.max(...colliding.map((r) => r.x + r.w)) + ROOM_GAP
    } else if (direction === 'west') {
      candidate.x = Math.min(...colliding.map((r) => r.x)) - footprint.w - ROOM_GAP
    } else if (direction === 'south') {
      candidate.y = Math.max(...colliding.map((r) => r.y + r.h)) + ROOM_GAP
    } else {
      candidate.y = Math.min(...colliding.map((r) => r.y)) - footprint.h - ROOM_GAP
    }
  }
  return candidate
}

/** Place the next room without overlapping existing rooms. */
export function placeNextRoom(
  placed: readonly DungeonRoom[],
  direction: DungeonDirection,
  footprint: RoomFootprint,
  gap = ROOM_GAP,
  start: { x: number; y: number } = { x: 0, y: 0 },
): { x: number; y: number } {
  const origin = resolveNextRoomOrigin(placed, direction, footprint, gap, start)
  return shiftToAvoidOverlap(origin, footprint, placed, direction)
}

/** Axis-aligned outline of a set of rooms. */
export function roomsBounds(rooms: readonly DungeonRoom[]): PlanBounds | null {
  if (rooms.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const room of rooms) {
    minX = Math.min(minX, room.x)
    minY = Math.min(minY, room.y)
    maxX = Math.max(maxX, room.x + room.w - 1)
    maxY = Math.max(maxY, room.y + room.h - 1)
  }
  return { minX, minY, maxX, maxY }
}

function roomCenter(room: DungeonRoom): { x: number; y: number } {
  return {
    x: room.x + Math.floor((room.w - 1) / 2),
    y: room.y + Math.floor((room.h - 1) / 2),
  }
}

function onBoundary(room: DungeonRoom, x: number, y: number): boolean {
  const onX = x === room.x || x === room.x + room.w - 1
  const onY = y === room.y || y === room.y + room.h - 1
  return onX || onY
}

/**
 * L-shaped corridor between two room centers. Cells that land on a room's
 * wall ring become doors; interior and open cells become floor.
 */
export function buildCorridor(
  a: DungeonRoom,
  b: DungeonRoom,
  floorTile = 'floor',
  doorTile = 'door',
): TileEntry[] {
  const ca = roomCenter(a)
  const cb = roomCenter(b)
  const cells: { x: number; y: number }[] = []

  const stepX = Math.sign(cb.x - ca.x)
  for (let x = ca.x; stepX !== 0 && x !== cb.x; x += stepX) cells.push({ x, y: ca.y })
  const stepY = Math.sign(cb.y - ca.y)
  for (let y = ca.y; stepY !== 0 && y !== cb.y; y += stepY) cells.push({ x: cb.x, y })
  cells.push({ x: cb.x, y: cb.y })

  const seen = new Set<string>()
  const entries: TileEntry[] = []
  for (const { x, y } of cells) {
    if (entries.length >= MAX_CORRIDOR_TILES) break
    const key = `${x},${y}`
    if (seen.has(key)) continue
    seen.add(key)
    const door = onBoundary(a, x, y) || onBoundary(b, x, y)
    entries.push({ x, y, tileId: door ? doorTile : floorTile })
  }
  return entries
}

/** Connect each room to the nearest previously placed room (a spanning tree). */
export function connectRooms(rooms: readonly DungeonRoom[], floorTile = 'floor', doorTile = 'door'): TileEntry[] {
  const entries: TileEntry[] = []
  const seen = new Set<string>()
  const push = (tiles: TileEntry[]) => {
    for (const tile of tiles) {
      if (entries.length >= MAX_CORRIDOR_TILES) return
      const key = `${tile.x},${tile.y}`
      if (seen.has(key)) continue
      seen.add(key)
      entries.push(tile)
    }
  }

  for (let i = 1; i < rooms.length; i++) {
    let nearest = 0
    let nearestDistance = Infinity
    for (let j = 0; j < i; j++) {
      const dx = rooms[i].x - rooms[j].x
      const dy = rooms[i].y - rooms[j].y
      const distance = dx * dx + dy * dy
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearest = j
      }
    }
    push(buildCorridor(rooms[nearest], rooms[i], floorTile, doorTile))
  }
  return entries
}

// ── Network + loop ──────────────────────────────────────────────────────

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, Math.trunc(value)))
}

async function postBuild(
  payload: Record<string, unknown>,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const response = await fetchImpl('/api/gen-ui/build', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error((data as { error?: string })?.error || `Request failed (${response.status})`)
  }
  return data as Record<string, unknown>
}

function footprintFor(presetId: string): RoomFootprint | null {
  const preset = PRESETS.find((p) => p.id === presetId)
  if (!preset) return null
  return { w: preset.grid[0]?.length ?? 1, h: preset.grid.length }
}

/**
 * Run the bounded build loop. Returns once the model stops, the target room
 * count is reached, the step cap is hit, or the caller aborts.
 */
export async function runDungeonGenerator(
  options: DungeonGeneratorOptions,
): Promise<DungeonResult> {
  const { goal, editor, signal, onProgress, place } = options
  const fetchImpl = options.fetchImpl ?? fetch
  const maxRooms = clampInt(options.maxRooms ?? MAX_DUNGEON_ROOMS, 1, MAX_DUNGEON_ROOMS)
  const warnings: string[] = []
  const rooms: DungeonRoom[] = []

  const emit = (
    step: number,
    targetRooms: number,
    done: boolean,
    aborted: boolean,
    extra: Partial<DungeonProgress> = {},
  ) => onProgress?.({ step, targetRooms, roomCount: rooms.length, done, aborted, ...extra })

  if (signal?.aborted) {
    warnings.push('aborted')
    emit(0, 0, true, true, { warning: 'aborted' })
    return { rooms, connect: false, targetRooms: 0, warnings }
  }

  const plan = (await postBuild({ phase: 'plan', goal, editor }, fetchImpl, signal)) as unknown as DungeonPlan
  const targetRooms = clampInt(plan.targetRooms ?? 5, 1, maxRooms)
  const maxSteps = Math.min(targetRooms, MAX_DUNGEON_STEPS)

  emit(0, targetRooms, false, false)

  for (let step = 0; step < maxSteps; step++) {
    if (signal?.aborted) {
      warnings.push('aborted')
      emit(step, targetRooms, true, true, { warning: 'aborted' })
      return { rooms, connect: plan.connect, targetRooms, warnings }
    }
    if (rooms.length >= targetRooms) break

    const decision = (await postBuild(
      { phase: 'step', goal, editor, step, rooms, targetRooms },
      fetchImpl,
      signal,
    )) as unknown as DungeonStep

    if (decision.warningCodes?.includes('missing_preset')) {
      warnings.push('missing_preset')
      break
    }
    if (!decision.shouldContinue && rooms.length > 0) break

    const footprint = decision.presetId ? footprintFor(decision.presetId) : null
    if (!decision.presetId || !footprint) {
      warnings.push('unknown_preset')
      break
    }

    const origin = placeNextRoom(rooms, decision.direction, footprint, ROOM_GAP, options.startOrigin)
    place({ tool: 'placePreset', args: { presetId: decision.presetId, x: origin.x, y: origin.y } })
    rooms.push({ presetId: decision.presetId, x: origin.x, y: origin.y, ...footprint })
    emit(step + 1, targetRooms, rooms.length >= targetRooms, false, { lastRoom: decision.presetId })
  }

  if (plan.connect && rooms.length > 1) {
    const tiles = connectRooms(rooms)
    if (tiles.length > 0) {
      place({ tool: 'placeMultipleTiles', args: { tiles } })
    }
  }

  emit(maxSteps, targetRooms, true, false, { roomCount: rooms.length })
  return { rooms, connect: plan.connect, targetRooms, warnings }
}
