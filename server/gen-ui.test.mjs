import { describe, expect, it, vi, afterEach } from 'vitest'

import {
  GEN_UI_INTENTS,
  GEN_UI_OPTIONS,
  MAX_GOAL_LENGTH,
  buildDungeonPlanQuestions,
  buildDungeonStepQuestions,
  buildDungeonStepState,
  buildGenUiQuestions,
  buildGenUiState,
  callTypeSafe,
  handleGenUi,
  handleGenUiBuild,
  normalizeDungeonPlan,
  normalizeDungeonStep,
  normalizeGenUiPlan,
  validateGenUiRequest,
} from './gen-ui.mjs'

/** Minimal req/res doubles for exercising the handler without a server. */
function mockReq({ method = 'POST', body } = {}) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
  return {
    method,
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  }
}

function mockRes() {
  const res = {
    status: 0,
    headers: {},
    payload: undefined,
    setHeader(key, value) {
      this.headers[key] = value
    },
    writeHead(status) {
      this.status = status
      return this
    },
    end(data) {
      this.payload = data
    },
  }
  return res
}

const CHOICE = (choice, confidence) => ({ type: 'choice', choice, confidence })
const NOUL = (noul) => ({ type: 'noul', noul })

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('buildGenUiQuestions', () => {
  it('asks for every intent branch in one request', () => {
    const questions = buildGenUiQuestions()
    for (const intent of GEN_UI_INTENTS) {
      expect(questions.intent.criteria[intent]).toBeTruthy()
    }
    expect(questions.preset_id.type).toBe('choice')
    expect(questions.tile_id.type).toBe('choice')
    expect(questions.overwrites_existing.type).toBe('noul')
    expect(questions.view_action.type).toBe('choice')
  })

  it('restricts preset and tile choices to the catalog', () => {
    const questions = buildGenUiQuestions()
    expect(Object.keys(questions.preset_id.criteria)).toEqual(
      GEN_UI_OPTIONS.preset_id.map((o) => o.value),
    )
    expect(Object.keys(questions.tile_id.criteria)).toEqual(
      GEN_UI_OPTIONS.tile_id.map((o) => o.value),
    )
    expect(questions.tile_id.criteria.void).toBeUndefined()
  })
})

describe('buildGenUiState', () => {
  it('trims the goal, clamps bounds, and defaults missing fields', () => {
    const state = buildGenUiState({ goal: '  carve a crypt  ', editor: {} })
    expect(state.goal).toBe('carve a crypt')
    expect(state.editor.worldName).toBe('Untitled')
    expect(state.editor.themeId).toBe('ansi-16')
    expect(state.editor.mapBounds).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 })
  })

  it('caps oversized goals and rejects non-numeric bounds', () => {
    const state = buildGenUiState({
      goal: 'x'.repeat(MAX_GOAL_LENGTH + 500),
      editor: { bounds: { minX: 'nope', maxX: NaN } },
    })
    expect(state.goal).toHaveLength(MAX_GOAL_LENGTH)
    expect(state.editor.mapBounds.minX).toBe(0)
    expect(state.editor.mapBounds.maxX).toBe(0)
  })
})

describe('normalizeGenUiPlan', () => {
  it('normalizes a place_preset plan and hides irrelevant branches', () => {
    const plan = normalizeGenUiPlan({
      intent: CHOICE('place_preset', 0.91),
      preset_id: CHOICE('vault', 0.82),
      placement_anchor: CHOICE('east_of_map', 0.88),
      tile_id: CHOICE('water', 0.4),
    })

    expect(plan.intent).toBe('place_preset')
    expect(plan.confidence).toBe(0.91)
    expect(plan.destructive).toBe(false)
    expect(plan.warningCodes).toEqual([])

    const preset = plan.fields.find((f) => f.id === 'preset_id')
    expect(preset.value).toBe('vault')
    expect(preset.options.some((o) => o.value === 'vault')).toBe(true)
    expect(preset.visibleFor).toEqual(['place_preset'])

    // Every field carries the intent branch it belongs to.
    expect(plan.fields.find((f) => f.id === 'tile_id').visibleFor).toEqual(['paint_tiles'])
  })

  it('flags a destructive flood fill with a warning', () => {
    const plan = normalizeGenUiPlan({
      intent: CHOICE('paint_tiles', 0.86),
      tile_id: CHOICE('lava', 0.9),
      paint_shape: CHOICE('flood_fill', 0.77),
      overwrites_existing: NOUL(0.93),
    })

    expect(plan.destructive).toBe(true)
    expect(plan.warningCodes).toContain('destructive')
    const noul = plan.fields.find((f) => f.id === 'overwrites_existing')
    expect(noul.type).toBe('noul')
    expect(noul.value).toBe(0.93)
    expect(noul.options).toBeNull()
  })

  it('flags a low-confidence intent', () => {
    const plan = normalizeGenUiPlan({ intent: CHOICE('adjust_view', 0.3) })
    expect(plan.warningCodes).toContain('low_intent_confidence')
  })

  it('reports a missing intent instead of guessing', () => {
    const plan = normalizeGenUiPlan({})
    expect(plan.intent).toBeNull()
    expect(plan.warningCodes).toContain('missing_intent')
  })

  it('flags an unsupported goal instead of forcing a near-miss action', () => {
    const plan = normalizeGenUiPlan({ intent: CHOICE('unsupported', 0.95) })
    expect(plan.intent).toBe('unsupported')
    expect(plan.warningCodes).toContain('unsupported_intent')
    expect(plan.destructive).toBe(false)
  })
})

describe('validateGenUiRequest', () => {
  it('rejects empty and non-string goals', () => {
    expect(validateGenUiRequest({ goal: '' })).toBeTruthy()
    expect(validateGenUiRequest({ goal: '  ' })).toBeTruthy()
    expect(validateGenUiRequest({ goal: 42 })).toBeTruthy()
    expect(validateGenUiRequest({ goal: 'make a vault' })).toBeNull()
  })
})

describe('callTypeSafe', () => {
  it('posts the state and questions and returns answers', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({ model: 'jev-1.13.0', answers: { intent: CHOICE('place_preset', 0.9) } }),
    }))

    const result = await callTypeSafe({
      state: { goal: 'vault' },
      questions: { intent: {} },
      apiKey: 'test-key',
      fetchImpl,
    })

    expect(result.model).toBe('jev-1.13.0')
    expect(fetchImpl).toHaveBeenCalledOnce()
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toContain('/v1/systemone')
    expect(init.headers.Authorization).toBe('Bearer test-key')
    expect(JSON.parse(init.body).state.goal).toBe('vault')
  })

  it('throws with the upstream status on error responses', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 422,
      text: async () => JSON.stringify({ error: 'bad question' }),
    }))

    await expect(
      callTypeSafe({ state: {}, questions: {}, apiKey: 'k', fetchImpl }),
    ).rejects.toMatchObject({ status: 422 })
  })
})

describe('dungeon builder', () => {
  it('asks for a bounded plan then one decision per step', () => {
    const planQ = buildDungeonPlanQuestions()
    expect(planQ.room_count.type).toBe('choice')
    expect(planQ.connect_rooms.type).toBe('noul')

    const stepQ = buildDungeonStepQuestions()
    expect(stepQ.next_preset.type).toBe('choice')
    expect(stepQ.next_direction.type).toBe('choice')
    expect(stepQ.should_continue.type).toBe('noul')
    expect(Object.keys(stepQ.next_preset.criteria)).toEqual(
      GEN_UI_OPTIONS.preset_id.map((o) => o.value),
    )
  })

  it('maps the room-count bucket to a concrete target', () => {
    expect(normalizeDungeonPlan({ room_count: CHOICE('small', 0.9) }).targetRooms).toBe(3)
    expect(normalizeDungeonPlan({ room_count: CHOICE('large', 0.9) }).targetRooms).toBe(8)
    expect(normalizeDungeonPlan({}).targetRooms).toBe(5)
    expect(normalizeDungeonPlan({ connect_rooms: NOUL(0.2) }).connect).toBe(false)
  })

  it('normalizes a step decision with a safe direction fallback', () => {
    const step = normalizeDungeonStep({
      should_continue: NOUL(0.81),
      next_preset: CHOICE('prison', 0.9),
      next_direction: CHOICE('south', 0.8),
    })
    expect(step).toMatchObject({ shouldContinue: true, presetId: 'prison', direction: 'south' })

    const bad = normalizeDungeonStep({
      should_continue: NOUL(0.4),
      next_preset: CHOICE('vault', 0.5),
      next_direction: CHOICE('sideways', 0.5),
    })
    expect(bad.shouldContinue).toBe(false)
    expect(bad.direction).toBe('east')
  })

  it('flags a continue decision that forgot to pick a preset', () => {
    const step = normalizeDungeonStep({ should_continue: NOUL(0.9) })
    expect(step.warningCodes).toContain('missing_preset')
  })

  it('computes roomsRemaining and clamps the step state', () => {
    const state = buildDungeonStepState({
      goal: 'a crypt',
      targetRooms: 5,
      step: 99,
      rooms: [{ presetId: 'vault', x: 0, y: 0, w: 5, h: 5 }],
    })
    expect(state.roomsRemaining).toBe(4)
    expect(state.rooms).toHaveLength(1)
    expect(state.step).toBeLessThanOrEqual(16)
  })
})

describe('handleGenUiBuild', () => {
  it('returns a plan for the plan phase', async () => {
    vi.stubEnv('TYPESAFE_API_KEY', 'test-key')
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          model: 'jev-latest',
          answers: { room_count: CHOICE('medium', 0.9), connect_rooms: NOUL(0.9) },
        }),
    }))
    const res = mockRes()
    await handleGenUiBuild(mockReq({ body: { phase: 'plan', goal: 'a crypt' } }), res, { fetchImpl })
    expect(res.status).toBe(200)
    const plan = JSON.parse(res.payload)
    expect(plan.phase).toBe('plan')
    expect(plan.targetRooms).toBe(5)
    expect(plan.connect).toBe(true)
  })

  it('requires a rooms array for the step phase', async () => {
    vi.stubEnv('TYPESAFE_API_KEY', 'test-key')
    const res = mockRes()
    await handleGenUiBuild(mockReq({ body: { phase: 'step', goal: 'a crypt' } }), res)
    expect(res.status).toBe(400)
  })

  it('returns a step decision for the step phase', async () => {
    vi.stubEnv('TYPESAFE_API_KEY', 'test-key')
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          model: 'jev-latest',
          answers: {
            should_continue: NOUL(0.8),
            next_preset: CHOICE('medium-room', 0.9),
            next_direction: CHOICE('east', 0.8),
          },
        }),
    }))
    const res = mockRes()
    await handleGenUiBuild(
      mockReq({ body: { phase: 'step', goal: 'a crypt', rooms: [], step: 0, targetRooms: 5 } }),
      res,
      { fetchImpl },
    )
    expect(res.status).toBe(200)
    const step = JSON.parse(res.payload)
    expect(step).toMatchObject({ phase: 'step', shouldContinue: true, presetId: 'medium-room' })
  })
})

describe('handleGenUi', () => {
  it('returns 503 when the API key is missing', async () => {
    vi.stubEnv('TYPESAFE_API_KEY', '')
    const res = mockRes()
    await handleGenUi(mockReq({ body: { goal: 'add a room' } }), res)
    expect(res.status).toBe(503)
    expect(JSON.parse(res.payload).error).toContain('TYPESAFE_API_KEY')
  })

  it('returns 400 for an empty goal', async () => {
    vi.stubEnv('TYPESAFE_API_KEY', 'test-key')
    const res = mockRes()
    await handleGenUi(mockReq({ body: { goal: '' } }), res)
    expect(res.status).toBe(400)
  })

  it('returns a normalized plan on success', async () => {
    vi.stubEnv('TYPESAFE_API_KEY', 'test-key')
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          model: 'jev-latest',
          answers: {
            intent: CHOICE('place_preset', 0.88),
            preset_id: CHOICE('vault', 0.8),
          },
        }),
    }))
    const res = mockRes()
    await handleGenUi(mockReq({ body: { goal: 'add a vault' } }), res, { fetchImpl })
    expect(res.status).toBe(200)
    const plan = JSON.parse(res.payload)
    expect(plan.intent).toBe('place_preset')
    expect(plan.fields.some((f) => f.id === 'preset_id')).toBe(true)
  })
})
