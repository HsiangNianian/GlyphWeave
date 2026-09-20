import { describe, expect, it, vi } from 'vitest'

import type { DungeonRoom } from '@/types'
import {
  buildCorridor,
  connectRooms,
  placeNextRoom,
  rectsIntersect,
  resolveNextRoomOrigin,
  roomsBounds,
  runDungeonGenerator,
  shiftToAvoidOverlap,
  type DungeonToolAction,
} from './dungeon-generator'

function room(partial: Partial<DungeonRoom> & Pick<DungeonRoom, 'x' | 'y' | 'w' | 'h'>): DungeonRoom {
  return { presetId: 'small-room', ...partial }
}

describe('room placement', () => {
  it('starts at the origin and extends in each direction', () => {
    const fp = { w: 5, h: 5 }
    expect(resolveNextRoomOrigin([], 'east', fp)).toEqual({ x: 0, y: 0 })
    const last = [room({ x: 0, y: 0, w: 5, h: 5 })]
    expect(resolveNextRoomOrigin(last, 'east', fp)).toEqual({ x: 8, y: 0 })
    expect(resolveNextRoomOrigin(last, 'south', fp)).toEqual({ x: 0, y: 8 })
    expect(resolveNextRoomOrigin(last, 'west', fp)).toEqual({ x: -8, y: 0 })
    expect(resolveNextRoomOrigin(last, 'north', fp)).toEqual({ x: 0, y: -8 })
  })

  it('detects overlap and shifts a room out of the way', () => {
    expect(rectsIntersect(room({ x: 0, y: 0, w: 5, h: 5 }), room({ x: 4, y: 4, w: 5, h: 5 }))).toBe(true)
    expect(rectsIntersect(room({ x: 0, y: 0, w: 5, h: 5 }), room({ x: 5, y: 0, w: 5, h: 5 }))).toBe(false)

    const placed = [room({ x: 0, y: 0, w: 5, h: 5 })]
    // Candidate collides with the placed room, so it slides east past it.
    const origin = shiftToAvoidOverlap({ x: 4, y: 0 }, { w: 5, h: 5 }, placed, 'east')
    expect(origin).toEqual({ x: 8, y: 0 })
  })

  it('places next rooms without overlap', () => {
    const placed = [room({ x: 0, y: 0, w: 5, h: 5 })]
    const origin = placeNextRoom(placed, 'east', { w: 5, h: 5 })
    expect(rectsIntersect({ ...origin, w: 5, h: 5 }, placed[0])).toBe(false)
  })

  it('computes the outline of a room set', () => {
    expect(roomsBounds([])).toBeNull()
    expect(
      roomsBounds([room({ x: 0, y: 0, w: 5, h: 5 }), room({ x: 10, y: 3, w: 7, h: 7 })]),
    ).toEqual({ minX: 0, minY: 0, maxX: 16, maxY: 9 })
  })
})

describe('corridors', () => {
  it('draws an L-shaped path and puts doors on the wall ring', () => {
    const a = room({ x: 0, y: 0, w: 5, h: 5 })
    const b = room({ x: 10, y: 0, w: 5, h: 5 })
    const tiles = buildCorridor(a, b)

    // Exits room A on its right wall and enters room B on its left wall.
    expect(tiles.find((t) => t.x === 4 && t.y === 2)).toMatchObject({ tileId: 'door' })
    expect(tiles.find((t) => t.x === 10 && t.y === 2)).toMatchObject({ tileId: 'door' })
    // Between the rooms it is floor.
    expect(tiles.find((t) => t.x === 7 && t.y === 2)).toMatchObject({ tileId: 'floor' })
  })

  it('connects every room to the nearest earlier room', () => {
    const rooms = [
      room({ x: 0, y: 0, w: 5, h: 5 }),
      room({ x: 12, y: 0, w: 5, h: 5 }),
      room({ x: 12, y: 12, w: 5, h: 5 }),
    ]
    const tiles = connectRooms(rooms)
    expect(tiles.length).toBeGreaterThan(0)
    // No corridor repeats a cell.
    expect(new Set(tiles.map((t) => `${t.x},${t.y}`)).size).toBe(tiles.length)
  })
})

describe('runDungeonGenerator', () => {
  function fakeFetch(plan: Record<string, unknown>, steps: Record<string, unknown>[]) {
    let stepIndex = 0
    return vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { phase: string }
      const payload = body.phase === 'plan' ? plan : steps[Math.min(stepIndex++, steps.length - 1)]
      return {
        ok: true,
        status: 200,
        json: async () => payload,
      }
    }) as unknown as typeof fetch
  }

  it('runs a bounded loop and connects the result', async () => {
    const fetchImpl = fakeFetch(
      { phase: 'plan', targetRooms: 3, connect: true },
      [{ phase: 'step', shouldContinue: true, presetId: 'small-room', direction: 'east', warningCodes: [] }],
    )
    const actions: DungeonToolAction[] = []
    const progress: number[] = []

    const result = await runDungeonGenerator({
      goal: 'a small crypt',
      editor: { worldName: 'w', themeId: 'ansi-16', activeZ: 0, paintedTileCount: 0, bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } },
      fetchImpl,
      place: (action) => actions.push(action),
      onProgress: (p) => progress.push(p.roomCount),
    })

    expect(result.rooms).toHaveLength(3)
    expect(result.warnings).toEqual([])
    expect(actions.filter((a) => a.tool === 'placePreset')).toHaveLength(3)
    expect(actions.filter((a) => a.tool === 'placeMultipleTiles')).toHaveLength(1)
    // Every placed room is distinct and non-overlapping.
    expect(new Set(result.rooms.map((r) => `${r.x},${r.y}`)).size).toBe(3)
    expect(progress.at(-1)).toBe(3)
  })

  it('stops early when the model says not to continue', async () => {
    const fetchImpl = fakeFetch(
      { phase: 'plan', targetRooms: 5, connect: false },
      [
        { phase: 'step', shouldContinue: true, presetId: 'small-room', direction: 'east', warningCodes: [] },
        { phase: 'step', shouldContinue: false, presetId: 'medium-room', direction: 'south', warningCodes: [] },
      ],
    )
    const actions: DungeonToolAction[] = []
    const result = await runDungeonGenerator({
      goal: 'just one room',
      editor: { worldName: 'w', themeId: 'ansi-16', activeZ: 0, paintedTileCount: 0, bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } },
      fetchImpl,
      place: (a) => actions.push(a),
    })

    expect(result.rooms).toHaveLength(1)
    expect(actions.some((a) => a.tool === 'placeMultipleTiles')).toBe(false)
  })

  it('aborts without placing anything', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const actions: DungeonToolAction[] = []

    const result = await runDungeonGenerator({
      goal: 'a crypt',
      editor: { worldName: 'w', themeId: 'ansi-16', activeZ: 0, paintedTileCount: 0, bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } },
      fetchImpl,
      signal: controller.signal,
      place: (a) => actions.push(a),
    })

    expect(result.rooms).toHaveLength(0)
    expect(result.warnings).toContain('aborted')
    expect(actions).toHaveLength(0)
  })
})
