/**
 * Generative UI endpoint.
 *
 * Turns a natural-language goal into a typed, user-reviewable action plan
 * using TypeSafe's Jev (System One) model. Jev never writes UI: it only
 * selects options and probabilities from the catalogs below. This module
 * normalizes those typed answers into a flat `fields` list that the client
 * renders from a fixed control registry, so the UI is generated but always
 * safe.
 *
 * Environment variables:
 *   TYPESAFE_API_KEY  – TypeSafe API key (required)
 *   TYPESAFE_MODEL    – override the model alias (default: jev-latest)
 *
 * HTTP contract:
 *   POST /api/gen-ui
 *   body: { goal: string, editor: EditorContext }
 *   resp: GenUiPlan
 */

import { PRESETS_CATALOG } from './presets-catalog.mjs'
import { TILE_TYPES } from '../src/lib/render-surface-protocol.mjs'

export const TYPESAFE_URL = 'https://api.typesafe.ai/v1/systemone'
export const TYPESAFE_MODEL = 'jev-latest'
export const MAX_GOAL_LENGTH = 2000

/** A goal must be explicit enough to act on. Code rejects the rest. */
export const MIN_GOAL_LENGTH = 3

/** Intent ids — the branch code dispatches on. */
export const GEN_UI_INTENTS = ['place_preset', 'paint_tiles', 'adjust_view', 'unsupported']

/** Placement anchors, resolved to tile coordinates in code. */
export const GEN_UI_ANCHORS = [
  'current_view',
  'map_origin',
  'center_of_map',
  'north_of_map',
  'south_of_map',
  'east_of_map',
  'west_of_map',
]

/** Paint shapes, mapped to editor tools in code. */
export const GEN_UI_PAINT_SHAPES = ['single_tile', 'line', 'rectangle', 'flood_fill']

/** Draw directions for a line, expanded to coordinates in code. */
export const GEN_UI_DIRECTIONS = ['north', 'south', 'east', 'west']

/** Named lengths, expanded to tile counts in code. */
export const GEN_UI_LENGTHS = ['short', 'medium', 'long']

/** Line thicknesses, in tiles. */
export const GEN_UI_WIDTHS = ['1', '2', '3']

/** View actions, mapped to ui-store actions in code. */
export const GEN_UI_VIEW_ACTIONS = [
  'zoom_in',
  'zoom_out',
  'reset_zoom',
  'toggle_grid',
  'toggle_minimap',
]

const PLACEABLE_TILES = Object.values(TILE_TYPES).filter((tile) => tile.id !== 'void')

const INTENT_LABELS = {
  place_preset: 'Stamp a preset structure',
  paint_tiles: 'Paint tiles',
  adjust_view: 'Adjust the view',
  unsupported: 'Not supported',
}

const ANCHOR_LABELS = {
  current_view: 'Where the user is looking now',
  map_origin: 'Map origin (0, 0)',
  center_of_map: 'Center of the map',
  north_of_map: 'Above the map',
  south_of_map: 'Below the map',
  east_of_map: 'Right of the map',
  west_of_map: 'Left of the map',
}

const PAINT_SHAPE_LABELS = {
  single_tile: 'Single tile',
  line: 'Line or corridor',
  rectangle: 'Filled rectangle',
  flood_fill: 'Flood fill region',
}

const DIRECTION_LABELS = {
  north: 'North (up)',
  south: 'South (down)',
  east: 'East (right)',
  west: 'West (left)',
}

const LENGTH_LABELS = {
  short: 'Short (5 tiles)',
  medium: 'Medium (10 tiles)',
  long: 'Long (20 tiles)',
}

const WIDTH_LABELS = {
  '1': '1 tile thick',
  '2': '2 tiles thick',
  '3': '3 tiles thick',
}

const VIEW_ACTION_LABELS = {
  zoom_in: 'Zoom in',
  zoom_out: 'Zoom out',
  reset_zoom: 'Reset zoom',
  toggle_grid: 'Toggle grid',
  toggle_minimap: 'Toggle minimap',
}

function option(value, label, description) {
  return { value, label, description }
}

/**
 * Human labels for every Choice option, grouped by field id.
 * Shared by the question builder and the plan normalizer so the options the
 * model may pick are exactly the options the client can render.
 */
export const GEN_UI_OPTIONS = {
  intent: GEN_UI_INTENTS.map((id) => option(id, INTENT_LABELS[id], '')),
  preset_id: PRESETS_CATALOG.map((preset) =>
    option(
      preset.id,
      preset.name,
      `${preset.description} (${preset.width}×${preset.height}, ${preset.category})`,
    ),
  ),
  tile_id: PLACEABLE_TILES.map((tile) => option(tile.id, tile.name, tile.category)),
  placement_anchor: GEN_UI_ANCHORS.map((id) => option(id, ANCHOR_LABELS[id], '')),
  paint_shape: GEN_UI_PAINT_SHAPES.map((id) => option(id, PAINT_SHAPE_LABELS[id], '')),
  draw_direction: GEN_UI_DIRECTIONS.map((id) => option(id, DIRECTION_LABELS[id], '')),
  draw_length: GEN_UI_LENGTHS.map((id) => option(id, LENGTH_LABELS[id], '')),
  draw_width: GEN_UI_WIDTHS.map((id) => option(id, WIDTH_LABELS[id], '')),
  draw_height: GEN_UI_LENGTHS.map((id) => option(id, LENGTH_LABELS[id], '')),
  view_action: GEN_UI_VIEW_ACTIONS.map((id) => option(id, VIEW_ACTION_LABELS[id], '')),
}

/**
 * Field descriptors — order and applicability of the generated controls.
 * `visibleFor: null` means the field is always shown.
 */
export const GEN_UI_FIELD_SPECS = [
  { id: 'intent', labelKey: 'genUi.field.intent', visibleFor: null },
  { id: 'preset_id', labelKey: 'genUi.field.presetId', visibleFor: ['place_preset'] },
  {
    id: 'placement_anchor',
    labelKey: 'genUi.field.placementAnchor',
    visibleFor: ['place_preset', 'paint_tiles'],
  },
  { id: 'tile_id', labelKey: 'genUi.field.tileId', visibleFor: ['paint_tiles'] },
  { id: 'paint_shape', labelKey: 'genUi.field.paintShape', visibleFor: ['paint_tiles'] },
  {
    id: 'draw_direction',
    labelKey: 'genUi.field.drawDirection',
    visibleFor: ['paint_tiles'],
    visibleWhen: { field: 'paint_shape', values: ['line'] },
  },
  {
    id: 'draw_length',
    labelKey: 'genUi.field.drawLength',
    visibleFor: ['paint_tiles'],
    visibleWhen: { field: 'paint_shape', values: ['line', 'rectangle'] },
  },
  {
    id: 'draw_width',
    labelKey: 'genUi.field.drawWidth',
    visibleFor: ['paint_tiles'],
    visibleWhen: { field: 'paint_shape', values: ['line'] },
  },
  {
    id: 'draw_height',
    labelKey: 'genUi.field.drawHeight',
    visibleFor: ['paint_tiles'],
    visibleWhen: { field: 'paint_shape', values: ['rectangle'] },
  },
  {
    id: 'overwrites_existing',
    labelKey: 'genUi.field.overwritesExisting',
    visibleFor: ['paint_tiles'],
  },
  { id: 'view_action', labelKey: 'genUi.field.viewAction', visibleFor: ['adjust_view'] },
]

/** Convert an options list into a Choice criteria map. */
function criteriaFromOptions(options) {
  return Object.fromEntries(options.map(({ value, description }) => [value, description || value]))
}

/**
 * Build the TypeSafe questions. Questions run in parallel against one state,
 * so every branch is asked speculatively and code consumes only the chosen
 * intent's answers (speculative fan-out).
 */
export function buildGenUiQuestions() {
  return {
    intent: {
      type: 'choice',
      instructions: {
        question: 'What does `goal` ask the editor to do?',
        focus: 'Choose the single best-fitting editor action.',
      },
      criteria: {
        place_preset:
          'Stamp a ready-made structure (room, corridor, feature, dungeon room, or trap) from the preset catalog.',
        paint_tiles:
          'Paint terrain with one tile type: a single tile, a line or corridor, a filled rectangle, or a flood fill of an enclosed area.',
        adjust_view: 'Change only the view or editor display, without editing the map.',
        unsupported:
          'The goal asks for something the editor cannot do: changing the color theme, editing files, exporting, or anything outside painting tiles, stamping presets, and view controls. Prefer this over guessing a near-miss action.',
      },
    },
    preset_id: {
      type: 'choice',
      instructions: {
        goal: '`goal`',
        question: 'Which preset structure does `goal` describe?',
        focus:
          'Match the described structure, mood, or purpose to one preset. Prefer an exact name match when the goal names one.',
      },
      criteria: criteriaFromOptions(GEN_UI_OPTIONS.preset_id),
    },
    tile_id: {
      type: 'choice',
      instructions: {
        question: 'Which single tile type should be painted for `goal`?',
      },
      criteria: criteriaFromOptions(GEN_UI_OPTIONS.tile_id),
    },
    paint_shape: {
      type: 'choice',
      instructions: {
        question: 'Which paint shape does `goal` describe?',
        focus:
          'Use `line` for corridors, walls, rivers, or paths. Use `rectangle` for a solid block or pool. Use `flood_fill` when the goal fills an existing enclosed room.',
      },
      criteria: {
        single_tile: 'Place one tile at the target location.',
        line: 'Draw a straight line of tiles in one direction, with an optional thickness.',
        rectangle: 'Fill a solid rectangular block of tiles.',
        flood_fill:
          'Fill the whole enclosed region around the target with the tile, overwriting its contents.',
      },
    },
    draw_direction: {
      type: 'choice',
      instructions: {
        question: 'Which direction should the line extend from the placement point?',
      },
      criteria: criteriaFromOptions(GEN_UI_OPTIONS.draw_direction),
    },
    draw_length: {
      type: 'choice',
      instructions: {
        question: 'How long should the line or rectangle side be?',
      },
      criteria: criteriaFromOptions(GEN_UI_OPTIONS.draw_length),
    },
    draw_width: {
      type: 'choice',
      instructions: {
        question: 'How thick should the line be, in tiles?',
      },
      criteria: criteriaFromOptions(GEN_UI_OPTIONS.draw_width),
    },
    draw_height: {
      type: 'choice',
      instructions: {
        question: 'How tall should the rectangle be, from top to bottom?',
      },
      criteria: criteriaFromOptions(GEN_UI_OPTIONS.draw_height),
    },
    placement_anchor: {
      type: 'choice',
      instructions: {
        question: 'Where should the new content be placed relative to the current map?',
        focus:
          'Prefer `current_view` when the goal says "this", "here", "the current room", or otherwise refers to what the user is looking at.',
      },
      criteria: criteriaFromOptions(GEN_UI_OPTIONS.placement_anchor),
    },
    overwrites_existing: {
      type: 'noul',
      instructions: {
        question:
          'Would filling the area around the target overwrite a large amount of existing painted content?',
        focus:
          'Treat rooms already filled with floor, furniture, or water as existing content; treat void or empty space as not painted.',
      },
      criteria: {
        true: 'The target area is already substantially painted.',
        false: 'The target area is mostly empty or void.',
      },
    },
    view_action: {
      type: 'choice',
      instructions: {
        question: 'Which view or display change does `goal` request?',
      },
      criteria: criteriaFromOptions(GEN_UI_OPTIONS.view_action),
    },
  }
}

function clampInt(value, fallback, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.trunc(value)))
}

/** Normalize the client-supplied editor context; never trust it blindly. */
export function buildGenUiState(input = {}) {
  const editor = input.editor && typeof input.editor === 'object' ? input.editor : {}
  const rawBounds = editor.bounds && typeof editor.bounds === 'object' ? editor.bounds : {}
  const goal = typeof input.goal === 'string' ? input.goal.trim() : ''

  return {
    goal: goal.slice(0, MAX_GOAL_LENGTH),
    editor: {
      worldName:
        typeof editor.worldName === 'string' && editor.worldName ? editor.worldName : 'Untitled',
      themeId: typeof editor.themeId === 'string' ? editor.themeId : 'ansi-16',
      activeTileType: typeof editor.activeTileType === 'string' ? editor.activeTileType : null,
      activeElevation: clampInt(editor.activeZ, 0, -64, 64),
      paintedTileCount: clampInt(editor.paintedTileCount, 0, 0, Number.MAX_SAFE_INTEGER),
      mapBounds: {
        minX: clampInt(rawBounds.minX, 0, -100000, 100000),
        minY: clampInt(rawBounds.minY, 0, -100000, 100000),
        maxX: clampInt(rawBounds.maxX, 0, -100000, 100000),
        maxY: clampInt(rawBounds.maxY, 0, -100000, 100000),
      },
      viewing: editor.viewportCenter && typeof editor.viewportCenter === 'object'
        ? {
            x: clampInt(editor.viewportCenter.x, 0, -100000, 100000),
            y: clampInt(editor.viewportCenter.y, 0, -100000, 100000),
          }
        : null,
    },
  }
}

function buildField(spec, answer) {
  if (!answer || typeof answer !== 'object') return null
  const type = answer.type
  const base = {
    id: spec.id,
    type,
    labelKey: spec.labelKey,
    visibleFor: spec.visibleFor,
    visibleWhen: spec.visibleWhen ?? null,
  }

  if (type === 'choice') {
    return {
      ...base,
      value: answer.choice,
      confidence: typeof answer.confidence === 'number' ? answer.confidence : null,
      options: GEN_UI_OPTIONS[spec.id] ?? [],
    }
  }

  if (type === 'noul') {
    return {
      ...base,
      value: answer.noul,
      confidence: null,
      options: null,
    }
  }

  return null
}

/**
 * Turn raw TypeSafe answers into the plan the client renders.
 * Reusable and side-effect free: no network, no store.
 */
export function normalizeGenUiPlan(answers, { model = TYPESAFE_MODEL, usage } = {}) {
  const safeAnswers = answers && typeof answers === 'object' ? answers : {}
  const fields = []
  for (const spec of GEN_UI_FIELD_SPECS) {
    const field = buildField(spec, safeAnswers[spec.id])
    if (field) fields.push(field)
  }

  const intentAnswer = safeAnswers.intent
  const intent = intentAnswer?.choice ?? null
  const confidence = typeof intentAnswer?.confidence === 'number' ? intentAnswer.confidence : null

  const warnings = []
  if (!intent) {
    warnings.push('missing_intent')
  } else if (intent === 'unsupported') {
    warnings.push('unsupported_intent')
  } else if (confidence !== null && confidence < 0.45) {
    warnings.push('low_intent_confidence')
  }

  const destructive =
    intent === 'paint_tiles' && (safeAnswers.overwrites_existing?.noul ?? 0) >= 0.5
  if (destructive) warnings.push('destructive')

  return {
    model,
    intent,
    confidence,
    destructive,
    warningCodes: warnings,
    fields,
    usage: usage ?? null,
  }
}

/** Validate a request body. Returns an error string or null. */
export function validateGenUiRequest(body) {
  if (!body || typeof body !== 'object') return 'Request body must be a JSON object.'
  const goal = typeof body.goal === 'string' ? body.goal.trim() : ''
  if (goal.length < MIN_GOAL_LENGTH) {
    return `"goal" must be at least ${MIN_GOAL_LENGTH} characters.`
  }
  return null
}

/**
 * Call the TypeSafe HTTP API. Kept separate so it can be injected/stubbed.
 * @returns {Promise<{ model: string, answers: Record<string, unknown>, usage: unknown }>}
 */
export async function callTypeSafe({ state, questions, apiKey, model = TYPESAFE_MODEL, fetchImpl = fetch }) {
  const response = await fetchImpl(TYPESAFE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ state, model, questions }),
  })

  const text = await response.text()
  let payload
  try {
    payload = text ? JSON.parse(text) : {}
  } catch {
    throw new Error(`TypeSafe returned non-JSON response (${response.status}).`)
  }

  if (!response.ok) {
    const detail = payload?.error?.message || payload?.error || payload?.detail || text
    const message = typeof detail === 'string' ? detail : JSON.stringify(detail)
    throw Object.assign(new Error(`TypeSafe request failed (${response.status}): ${message}`), {
      status: response.status,
    })
  }

  return {
    model: payload.model ?? model,
    answers: payload.answers ?? {},
    usage: payload.usage ?? null,
  }
}

/** Read and parse the JSON request body from a Node.js readable stream. */
async function readBody(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf-8'))
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

/** Shared CORS + method + API key guard for both gen-ui handlers. */
function prepareGenUiRequest(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return null
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' })
    return null
  }

  const apiKey = process.env.TYPESAFE_API_KEY
  if (!apiKey) {
    sendJson(res, 503, {
      error:
        'TYPESAFE_API_KEY is not set. Add it to your .env file or environment to use AI-generated actions.',
    })
    return null
  }
  return { apiKey }
}

/** Main handler — called from the Vite plugin middleware and server/index.mjs. */
export async function handleGenUi(req, res, { fetchImpl } = {}) {
  const guard = prepareGenUiRequest(req, res)
  if (!guard) return

  try {
    const body = await readBody(req)
    const invalid = validateGenUiRequest(body)
    if (invalid) {
      sendJson(res, 400, { error: invalid })
      return
    }

    const state = buildGenUiState(body)
    const questions = buildGenUiQuestions()
    const result = await callTypeSafe({
      state,
      questions,
      apiKey: guard.apiKey,
      model: process.env.TYPESAFE_MODEL || TYPESAFE_MODEL,
      fetchImpl,
    })

    const plan = normalizeGenUiPlan(result.answers, {
      model: result.model,
      usage: result.usage,
    })
    sendJson(res, 200, plan)
  } catch (err) {
    const status = typeof err?.status === 'number' && err.status >= 400 ? err.status : 502
    const message = err instanceof Error ? err.message : String(err)
    console.error('[gen-ui] handler error:', err)
    sendJson(res, status, { error: message })
  }
}

// ── Multi-step dungeon builder ─────────────────────────────────────────
//
// The loop lives in code. Each iteration asks Jev for exactly one bounded
// decision (next preset, next direction, and whether to continue), then the
// client places it and asks again with the updated state. Termination is
// code-owned: the model's `should_continue`, the target room count from the
// initial plan, and a hard step cap all stop the loop.

/** Room-count buckets: the model picks the bucket, code owns the numbers. */
export const DUNGEON_ROOM_COUNTS = { small: 3, medium: 5, large: 8 }

/** Hard caps so a runaway loop can never flood the editor. */
export const MAX_DUNGEON_ROOMS = 12
export const MAX_DUNGEON_STEPS = 16

/** Directions are relative to the previously placed room. */
export const DUNGEON_DIRECTIONS = ['north', 'south', 'east', 'west']

const ROOM_COUNT_OPTIONS = [
  option('small', 'Small (3 rooms)', ''),
  option('medium', 'Medium (5 rooms)', ''),
  option('large', 'Large (8 rooms)', ''),
]

const DUNGEON_DIRECTION_OPTIONS = [
  option('north', 'North (up)', ''),
  option('south', 'South (down)', ''),
  option('east', 'East (right)', ''),
  option('west', 'West (left)', ''),
]

/** Initial plan: interpret the goal into a bounded spec. One call. */
export function buildDungeonPlanQuestions() {
  return {
    room_count: {
      type: 'choice',
      instructions: {
        question: 'How many rooms should `goal` produce?',
        focus: 'Scale to the described size. Default to medium when unspecified.',
      },
      criteria: criteriaFromOptions(ROOM_COUNT_OPTIONS),
    },
    connect_rooms: {
      type: 'noul',
      instructions: {
        question: 'Should the generated rooms be connected by corridors?',
        focus: 'Default to yes unless the goal asks for isolated rooms.',
      },
      criteria: {
        true: 'Rooms should be reachable from one another.',
        false: 'Rooms may remain separate.',
      },
    },
  }
}

/** Per-step questions: one bounded decision for the next room. */
export function buildDungeonStepQuestions() {
  return {
    next_preset: {
      type: 'choice',
      instructions: {
        goal: '`goal`',
        rooms: '`rooms`',
        question: 'Which preset should the next room be, given the rooms already placed?',
        focus:
          'Vary sensibly and honor any structure the goal names. Avoid repeating a unique room such as a throne room or vault.',
      },
      criteria: criteriaFromOptions(GEN_UI_OPTIONS.preset_id),
    },
    next_direction: {
      type: 'choice',
      instructions: {
        question: 'In which direction from the previous room should the next room be placed?',
      },
      criteria: criteriaFromOptions(DUNGEON_DIRECTION_OPTIONS),
    },
    should_continue: {
      type: 'noul',
      instructions: {
        goal: '`goal`',
        rooms: '`rooms`',
        remaining: '`roomsRemaining`',
        question: 'Should another room still be added to satisfy `goal`?',
        focus: 'Answer no once the goal is satisfied or no useful room remains.',
      },
      criteria: {
        true: 'Another room would still improve the result.',
        false: 'The goal is satisfied or no useful room remains.',
      },
    },
  }
}

function normalizeRooms(rawRooms) {
  if (!Array.isArray(rawRooms)) return []
  return rawRooms.slice(0, MAX_DUNGEON_ROOMS).map((room) => {
    const r = room && typeof room === 'object' ? room : {}
    return {
      presetId: typeof r.presetId === 'string' ? r.presetId : null,
      x: clampInt(r.x, 0, -100000, 100000),
      y: clampInt(r.y, 0, -100000, 100000),
      w: clampInt(r.w, 1, 1, 1000),
      h: clampInt(r.h, 1, 1, 1000),
    }
  })
}

export function buildDungeonStepState(input = {}) {
  const base = buildGenUiState(input)
  const rooms = normalizeRooms(input.rooms)
  const step = clampInt(input.step, 0, 0, MAX_DUNGEON_STEPS)
  const targetRooms = clampInt(input.targetRooms, DUNGEON_ROOM_COUNTS.medium, 1, MAX_DUNGEON_ROOMS)
  return {
    goal: base.goal,
    editor: base.editor,
    step,
    roomsRemaining: Math.max(0, targetRooms - rooms.length),
    rooms: rooms.map((room) => ({
      presetId: room.presetId,
      x: room.x,
      y: room.y,
      w: room.w,
      h: room.h,
    })),
  }
}

export function normalizeDungeonPlan(answers, { model = TYPESAFE_MODEL, usage } = {}) {
  const safe = answers && typeof answers === 'object' ? answers : {}
  const roomCountKey = safe.room_count?.choice ?? null
  const targetRooms = DUNGEON_ROOM_COUNTS[roomCountKey] ?? DUNGEON_ROOM_COUNTS.medium
  const connect = (safe.connect_rooms?.noul ?? 0.8) >= 0.5
  const confidence =
    typeof safe.room_count?.confidence === 'number' ? safe.room_count.confidence : null

  return {
    model,
    phase: 'plan',
    roomCountKey,
    targetRooms,
    connect,
    confidence,
    usage: usage ?? null,
  }
}

export function normalizeDungeonStep(answers, { model = TYPESAFE_MODEL, usage } = {}) {
  const safe = answers && typeof answers === 'object' ? answers : {}
  const shouldContinue = (safe.should_continue?.noul ?? 0) >= 0.5
  const presetId = safe.next_preset?.choice ?? null
  const rawDirection = safe.next_direction?.choice
  const direction = DUNGEON_DIRECTIONS.includes(rawDirection) ? rawDirection : 'east'
  const confidence =
    typeof safe.next_preset?.confidence === 'number' ? safe.next_preset.confidence : null
  const warningCodes = shouldContinue && !presetId ? ['missing_preset'] : []

  return {
    model,
    phase: 'step',
    shouldContinue,
    presetId,
    direction,
    confidence,
    warningCodes,
    usage: usage ?? null,
  }
}

/** Handler for POST /api/gen-ui/build — dispatches on `phase`. */
export async function handleGenUiBuild(req, res, { fetchImpl } = {}) {
  const guard = prepareGenUiRequest(req, res)
  if (!guard) return

  try {
    const body = await readBody(req)
    const invalid = validateGenUiRequest(body)
    if (invalid) {
      sendJson(res, 400, { error: invalid })
      return
    }

    const model = process.env.TYPESAFE_MODEL || TYPESAFE_MODEL
    const phase = body.phase === 'step' ? 'step' : 'plan'

    if (phase === 'plan') {
      const state = buildGenUiState(body)
      const result = await callTypeSafe({
        state,
        questions: buildDungeonPlanQuestions(),
        apiKey: guard.apiKey,
        model,
        fetchImpl,
      })
      sendJson(res, 200, normalizeDungeonPlan(result.answers, result))
      return
    }

    if (!Array.isArray(body.rooms)) {
      sendJson(res, 400, { error: '"rooms" must be an array for the step phase.' })
      return
    }

    const state = buildDungeonStepState(body)
    const result = await callTypeSafe({
      state,
      questions: buildDungeonStepQuestions(),
      apiKey: guard.apiKey,
      model,
      fetchImpl,
    })
    sendJson(res, 200, normalizeDungeonStep(result.answers, result))
  } catch (err) {
    const status = typeof err?.status === 'number' && err.status >= 400 ? err.status : 502
    const message = err instanceof Error ? err.message : String(err)
    console.error('[gen-ui] build handler error:', err)
    sendJson(res, status, { error: message })
  }
}
