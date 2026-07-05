#!/usr/bin/env node

import http from 'http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderMap } from './map-render.mjs'
import { apiDocPage } from './api-doc.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = parseInt(process.argv[2], 10) || 3001
const DIST_DIR = path.resolve(__dirname, '../dist')
const AGENTS_DIR = path.resolve(process.env.HOME || '/home/hsiangnianian', '.agents')

const MIME_MAP = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.ttf': 'font/ttf',
}

function safeAgentPath(relPath) {
  const resolved = path.resolve(AGENTS_DIR, relPath || '')
  if (!resolved.startsWith(AGENTS_DIR)) return null
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

function collectBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function handleRender(query, body) {
  let data, themeId, padding, scale
  if (body && body.length > 0) {
    const json = body.toString('utf-8')
    const parsed = JSON.parse(json)
    data = parsed
    themeId = query.theme || parsed.theme || 'ansi-16'
    padding = parseInt(query.padding, 10) || parseInt(parsed.padding, 10) || 1
    scale = query.scale ? parseFloat(query.scale) : (parsed.scale ? parseFloat(parsed.scale) : undefined)
  } else {
    const dataB64 = query.data
    if (!dataB64) throw new Error('Missing "data" parameter')
    const json = Buffer.from(dataB64, 'base64').toString('utf-8')
    data = JSON.parse(json)
    themeId = query.theme || 'ansi-16'
    padding = parseInt(query.padding, 10) || 1
    scale = query.scale ? parseFloat(query.scale) : undefined
  }
  return renderMap(data, { themeId, padding, scale })
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
      const pngBuffer = await handleRender(query, body)
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Length': pngBuffer.length,
        'Cache-Control': 'public, max-age=3600',
      })
      res.end(pngBuffer)
    } catch (err) {
      sendError(res, 400, `Error: ${err.message}`)
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
