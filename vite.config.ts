import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path, { resolve } from 'path'
import fs, { readdirSync, readFileSync, statSync } from 'fs'
import { renderMap } from './server/map-render.mjs'
import { apiDocPage } from './server/api-doc.mjs'

/**
 * Vite plugin: serves the agents directory browser + map doc at /api.
 * JSON endpoints at /api/agents/list and /api/agents/read for ~/.agents/.
 */
function agentsBrowserPlugin(): Plugin {
  const AGENTS_DIR = resolve(process.env.HOME || '/home/hsiangnianian', '.agents')

  function listEntries(relPath: string) {
    const abs = resolve(AGENTS_DIR, relPath)
    if (!abs.startsWith(AGENTS_DIR)) return []
    try {
      return readdirSync(abs, { withFileTypes: true })
        .filter(d => d.name !== '.git')
        .map(d => ({ name: d.name, type: d.isDirectory() ? 'directory' as const : 'file' as const, path: relPath ? relPath + '/' + d.name : d.name }))
        .sort((a, b) => a.type !== b.type ? (a.type === 'directory' ? -1 : 1) : a.name.localeCompare(b.name))
    } catch { return [] }
  }

  function readFileContent(relPath: string) {
    const abs = resolve(AGENTS_DIR, relPath)
    if (!abs.startsWith(AGENTS_DIR)) return null
    try {
      const s = statSync(abs)
      if (!s.isFile() || s.size > 524288) return null
      const buf = readFileSync(abs)
      if (buf.includes(0)) return null
      return { content: buf.toString('utf-8'), size: s.size }
    } catch { return null }
  }
 

  return {
    name: 'agents-browser',
    configureServer(server) {
      // ── Health check ──
      server.middlewares.use('/api/health', (_req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.end(JSON.stringify({ ok: true, version: 1 }))
      })

      // ── Render API (POST + GET) ──
      server.middlewares.use('/api/render', async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*')
        try {
          const u = new URL(req.url || '/', 'http://' + (req.headers.host || 'localhost'))
          const query = Object.fromEntries(u.searchParams)
          let data, themeId, padding, scale
          if (req.method === 'POST') {
            const chunks = []
            for await (const chunk of req) chunks.push(chunk)
            const body = Buffer.concat(chunks)
            const parsed = JSON.parse(body.toString('utf-8'))
            data = parsed
            themeId = query.theme || parsed.theme || parsed.themeId || 'ansi-16'
            padding = parseInt(query.padding, 10) || parseInt(parsed.padding, 10) || 1
            scale = query.scale ? parseFloat(query.scale) : (parsed.scale ? parseFloat(parsed.scale) : undefined)
          } else if (req.method === 'GET') {
            if (!query.data) { res.statusCode = 400; res.end('Missing "data" parameter'); return }
            const json = Buffer.from(query.data, 'base64').toString('utf-8')
            data = JSON.parse(json)
            themeId = query.theme || 'ansi-16'
            padding = parseInt(query.padding, 10) || 1
            scale = query.scale ? parseFloat(query.scale) : undefined
          } else {
            res.statusCode = 405; res.end('Method not allowed'); return
          }
          const pngBuffer = renderMap(data, { themeId, padding, scale })
          res.writeHead(200, {
            'Content-Type': 'image/png',
            'Content-Length': pngBuffer.length,
            'Cache-Control': 'public, max-age=3600',
          })
          res.end(pngBuffer)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          res.statusCode = 400
          res.end(`Error: ${msg}`)
        }
      })

      // ── Agents directory listing ──
      server.middlewares.use('/api/agents/list', (req, res, _next) => {
        const url = new URL(req.url || '/', 'http://' + (req.headers.host || 'localhost'))
        const relPath = url.searchParams.get('path') || ''
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.end(JSON.stringify({ entries: listEntries(relPath) }))
      })

      // ── Agents file reader ──
      server.middlewares.use('/api/agents/read', (req, res, _next) => {
        const url = new URL(req.url || '/', 'http://' + (req.headers.host || 'localhost'))
        const relPath = url.searchParams.get('path') || ''
        const result = readFileContent(relPath)
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Access-Control-Allow-Origin', '*')
        if (result) {
          res.end(JSON.stringify(result))
        } else {
          res.statusCode = 404
          res.end(JSON.stringify({ error: 'File not found or binary' }))
        }
      })

      // ── Main /api page (doc + tree browser) ──
      server.middlewares.use('/api', (req, res, next) => {
        const pathname = req.url || '/'
        if (pathname === '/' || pathname === '') {
          const addr = server.httpServer?.address()
          const port = addr && typeof addr !== 'string' ? addr.port : 5173
          res.writeHead(200, { 'Content-Type': 'text/html' })
          res.end(apiDocPage('http://localhost:' + port))
          return
        }
        next()
      })
    },

    writeBundle() {
      const outDir = path.resolve(__dirname, 'dist')
      const wasmSrc = path.resolve(__dirname, 'node_modules/@resvg/resvg-wasm/index_bg.wasm')
      const wasmDst = path.join(outDir, 'resvg-wasm.wasm')
      if (fs.existsSync(wasmSrc)) fs.copyFileSync(wasmSrc, wasmDst)
      console.log('[Agents] Generated api/index.html (baseUrl=' + baseUrl + ')')
    },
  }
}

export default defineConfig({
  server: {
    host: '0.0.0.0',
  },
  plugins: [react(), tailwindcss(), agentsBrowserPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})