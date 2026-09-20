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
export const GEN_UI_PAINT_SHAPES = ['single_tile', 'flood_fill']

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
  flood_fill: 'Flood fill region',
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
          'Paint terrain with one tile type, either a single tile or a flood fill of an enclosed area.',
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
        question: 'Should painting use a single tile or a flood fill of an enclosed area?',
      },
      criteria: {
        single_tile: 'Place one tile at the target location.',
        flood_fill:
          'Fill the whole enclosed region around the target with the tile, overwriting its contents.',
      },
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

/** Main handler — called from the Vite plugin middleware and server/index.mjs. */
export async function handleGenUi(req, res, { fetchImpl } = {}) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }

  const apiKey = process.env.TYPESAFE_API_KEY
  if (!apiKey) {
    sendJson(res, 503, {
      error:
        'TYPESAFE_API_KEY is not set. Add it to your .env file or environment to use AI-generated actions.',
    })
    return
  }

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
      apiKey,
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
