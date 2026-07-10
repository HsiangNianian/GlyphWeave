#!/usr/bin/env node

import http from 'http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderMap } from './map-render.mjs'
import { renderMapSVG } from './map-render-svg.mjs'
import { convertImageToMap, parseConvertRequest } from './map-convert.mjs'
import { apiDocPage } from './api-doc.mjs'
import {
  ApiHttpError,
  MAX_API_BODY_BYTES,
  decodeRenderGet,
  decodeRenderPost,
  ensureBodySize,
  gemapConvertResponse,
  isGemapContentType,
} from './gemap-api.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = parsePortArg(process.argv.slice(2))
const DIST_DIR = path.resolve(__dirname, '../dist')
const AGENTS_DIR = path.resolve(__dirname, '../.agents')

const MIME_MAP = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.ttf': 'font/ttf', '.gemap': 'application/vnd.glyphweave.gemap+zip',
}

const GEMAP_RUNTIME_URL = new URL('../dist/server/gemap-runtime.mjs', import.meta.url)
let gemapRuntimePromise

async function loadGemapRuntime() {
  if (!gemapRuntimePromise) {
    gemapRuntimePromise = import(GEMAP_RUNTIME_URL.href).catch(error => {
      gemapRuntimePromise = undefined
      throw new Error(
        'The built .gemap runtime is missing. Run "pnpm build" before "pnpm start".',
        { cause: error },
      )
    })
  }
  return gemapRuntimePromise
}

function parsePortArg(args) {
  const value = args.find(arg => /^\d+$/.test(arg))
  return value ? parseInt(value, 10) : 3001
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringValue(value) {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function numberValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const parsed = parseFloat(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function renderFormat(queryFormat, bodyFormat, fallback) {
  const value = stringValue(queryFormat) || stringValue(bodyFormat)
  if (!value) return fallback
  if (value === 'png' || value === 'svg') return value
  throw new Error(`Unsupported render format: ${value}`)
}

function renderOptions(query, data, fallbackFormat) {
  return {
    themeId: stringValue(query.theme) || stringValue(data.themeId) || 'ansi-16',
    padding: numberValue(query.padding) ?? numberValue(data.padding) ?? 1,
    scale: numberValue(query.scale) ?? numberValue(data.scale),
    format: renderFormat(query.format, data.format, fallbackFormat),
    theme: isRecord(data.theme) ? data.theme : undefined,
  }
}

function safeAgentPath(relPath = '') {
  const requestedPath = String(relPath)
  if (requestedPath.includes('\0') || path.isAbsolute(requestedPath)) return null

  const resolved = path.resolve(AGENTS_DIR, requestedPath)
  const relative = path.relative(AGENTS_DIR, resolved)
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null

  return resolved
}

function sendJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

function sendError(res, status, message) {
  res.writeHead(status, { 'Content-Type': 'text/plain' })
  res.end(message)
}

function sendHTML(res, html) {
  res.writeHead(200, { 'Content-Type': 'text/html' })
  res.end(html)
}

async function collectBody(req, limit = MAX_API_BODY_BYTES) {
  const declaredLength = req.headers['content-length']
  if (declaredLength !== undefined) {
    const length = Number(declaredLength)
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new ApiHttpError(400, 'Invalid Content-Length header')
    }
    ensureBodySize(length, limit)
  }

  const chunks = []
  let total = 0
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += bytes.length
    ensureBodySize(total, limit)
    chunks.push(bytes)
  }
  return Buffer.concat(chunks, total)
}

async function handleRender(query, body, contentType) {
  let data
  if (body && body.length > 0) {
    const runtime = isGemapContentType(contentType) ? await loadGemapRuntime() : undefined
    data = decodeRenderPost(body, contentType, query, runtime)
  } else {
    data = decodeRenderGet(query.data)
  }

  const { themeId, padding, scale, format, theme } = renderOptions(query, data, 'png')
  if (format === 'svg') {
    return {
      body: Buffer.from(renderMapSVG(data, { themeId, padding, scale, theme })),
      contentType: 'image/svg+xml',
    }
  }

  return {
    body: renderMap(data, { themeId, padding, scale, theme }),
    contentType: 'image/png',
  }
}

async function handleConvert(query, body, contentType) {
  const request = parseConvertRequest(contentType, body, query)
  const converted = await convertImageToMap(request.imageBuffer, request.options)
  const renderOptions = { themeId: converted.themeId, theme: converted.theme }

  if (converted.format === 'gemap' || converted.format === 'both') {
    const response = gemapConvertResponse(converted, await loadGemapRuntime(), renderMapSVG)
    return { ...response, body: Buffer.from(response.body) }
  }

  if (converted.format === 'png') {
    return {
      body: renderMap(converted.map, renderOptions),
      contentType: 'image/png',
    }
  }

  return {
    body: Buffer.from(renderMapSVG(converted.map, renderOptions)),
    contentType: 'image/svg+xml',
  }
}

async function serveStatic(res, filePath) {
  try {
    const stat = fs.statSync(filePath)
    if (!stat.isFile()) return false
    const ext = path.extname(filePath).toLowerCase()
    const mime = MIME_MAP[ext] || 'application/octet-stream'
    const content = fs.readFileSync(filePath)
    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': content.length,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    })
    res.end(content)
    return true
  } catch { return false }
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const query = Object.fromEntries(url.searchParams)

  // ── API: Health ──
  if (url.pathname === '/api/health') {
    sendJSON(res, 200, { ok: true, version: 1 })
    return
  }

  // ── API: Render ──
  if (url.pathname === '/api/render') {
    try {
      let body = null
      if (req.method === 'POST') {
        body = await collectBody(req)
      } else if (req.method !== 'GET') {
        sendError(res, 405, 'Method not allowed')
        return
      }
      const rendered = await handleRender(query, body, req.headers['content-type'] || '')
      res.writeHead(200, {
        'Content-Type': rendered.contentType,
        'Content-Length': rendered.body.length,
        'Cache-Control': 'public, max-age=3600',
      })
      res.end(rendered.body)
    } catch (err) {
      sendError(res, err instanceof ApiHttpError ? err.status : 400, `Error: ${err.message}`)
    }
    return
  }

  // ── API: Convert image to map ──
  if (url.pathname === '/api/convert') {
    try {
      if (req.method !== 'POST') {
        sendError(res, 405, 'Method not allowed')
        return
      }

      const body = await collectBody(req)
      const converted = await handleConvert(query, body, req.headers['content-type'] || '')
      res.writeHead(200, {
        'Content-Type': converted.contentType,
        'Content-Length': converted.body.length,
        'Cache-Control': 'no-store',
      })
      res.end(converted.body)
    } catch (err) {
      sendError(res, err instanceof ApiHttpError ? err.status : 400, `Error: ${err.message}`)
    }
    return
  }

  // ── API: Agents list ──
  if (url.pathname === '/api/agents/list') {
    try {
      const relPath = query.path || ''
      const resolved = safeAgentPath(relPath)
      if (!resolved) { sendError(res, 403, 'Forbidden'); return }
      if (!fs.existsSync(resolved)) { sendError(res, 404, 'Not found'); return }
      const entries = fs.readdirSync(resolved, { withFileTypes: true })
        .filter(e => !e.name.startsWith('.'))
        .map(e => ({
          name: e.name,
          path: relPath ? `${relPath}/${e.name}` : e.name,
          type: e.isDirectory() ? 'directory' : 'file',
        }))
        .sort((a, b) => {
          if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
          return a.name.localeCompare(b.name)
        })
      sendJSON(res, 200, { entries })
    } catch (err) {
      sendError(res, 500, err.message)
    }
    return
  }

  // ── API: Agents read ──
  if (url.pathname === '/api/agents/read') {
    try {
      const relPath = query.path
      if (!relPath) { sendError(res, 400, 'Missing "path" parameter'); return }
      const resolved = safeAgentPath(relPath)
      if (!resolved || !fs.existsSync(resolved)) { sendError(res, 404, 'Not found'); return }
      const stat = fs.statSync(resolved)
      if (!stat.isFile()) { sendError(res, 400, 'Not a file'); return }
      if (stat.size > 1024 * 1024) { sendError(res, 413, 'File too large (max 1MB)'); return }
      const buffer = fs.readFileSync(resolved)
      if (buffer.includes(0)) { sendError(res, 400, 'Cannot preview binary files'); return }
      sendJSON(res, 200, { content: buffer.toString('utf-8'), size: stat.size })
    } catch (err) {
      sendError(res, 500, err.message)
    }
    return
  }

  // ── API: info page ──
  if (url.pathname === '/api' || url.pathname === '/api/') {
    sendHTML(res, apiDocPage('http://localhost:' + PORT))
    return
  }

  // ── SPA: serve static files ──
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/favicon')) {
    if (await serveStatic(res, path.join(DIST_DIR, url.pathname))) return
  }

  // ── SPA fallback: serve index.html for all non-API routes ──
  if (await serveStatic(res, path.join(DIST_DIR, url.pathname === '/' ? 'index.html' : url.pathname.slice(1)))) return
  if (await serveStatic(res, path.join(DIST_DIR, 'index.html'))) return

  sendError(res, 404, 'Not found')
})

server.listen(PORT, () => {
  console.log(`GlyphWeave running at http://localhost:${PORT}`)
  console.log(`   Frontend:  http://localhost:${PORT}/`)
  console.log(`   API:       POST/GET /api/render`)
})
