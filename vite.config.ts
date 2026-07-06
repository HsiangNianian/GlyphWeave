import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { renderMap } from './server/map-render.mjs'
import { renderMapSVG } from './server/map-render-svg.mjs'
import { convertImageToMap, parseConvertRequest } from './server/map-convert.mjs'
import { apiDocPage } from './server/api-doc.mjs'

type RenderFormat = 'png' | 'svg'
type RenderPayload = Record<string, unknown>

function isRecord(value: unknown): value is RenderPayload {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const parsed = parseFloat(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function renderFormat(queryFormat: unknown, bodyFormat: unknown, fallback: RenderFormat): RenderFormat {
  const value = stringValue(queryFormat) || stringValue(bodyFormat)
  if (!value) return fallback
  if (value === 'png' || value === 'svg') return value
  throw new Error(`Unsupported render format: ${value}`)
}

function renderOptions(query: Record<string, string>, data: RenderPayload, fallbackFormat: RenderFormat) {
  return {
    themeId: stringValue(query.theme) || stringValue(data.themeId) || 'ansi-16',
    padding: numberValue(query.padding) ?? numberValue(data.padding) ?? 1,
    scale: numberValue(query.scale) ?? numberValue(data.scale),
    format: renderFormat(query.format, data.format, fallbackFormat),
    theme: isRecord(data.theme) ? data.theme : undefined,
  }
}

async function readRequestBody(req: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

/**
 * Vite plugin: serves the render API + doc page.
 */
function apiPlugin(): Plugin {
  return {
    name: 'glyphweave-api',
    configureServer(server) {
      server.middlewares.use('/api/health', (_req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.end(JSON.stringify({ ok: true, version: 1 }))
      })

      server.middlewares.use('/api/render', async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*')
        try {
          const u = new URL(req.url || '/', 'http://' + (req.headers.host || 'localhost'))
          const query = Object.fromEntries(u.searchParams) as Record<string, string>
          let data: RenderPayload
          if (req.method === 'POST') {
            const body = await readRequestBody(req)
            const parsed = JSON.parse(body.toString('utf-8')) as unknown
            if (!isRecord(parsed)) throw new Error('Request body must be a JSON object')
            data = parsed
          } else if (req.method === 'GET') {
            if (!query.data) { res.statusCode = 400; res.end('Missing "data" parameter'); return }
            const json = Buffer.from(query.data, 'base64').toString('utf-8')
            const parsed = JSON.parse(json) as unknown
            if (!isRecord(parsed)) throw new Error('Decoded data must be a JSON object')
            data = parsed
          } else {
            res.statusCode = 405; res.end('Method not allowed'); return
          }
          const { themeId, padding, scale, format, theme } = renderOptions(query, data, 'png')
          const body = format === 'svg'
            ? Buffer.from(renderMapSVG(data, { themeId, padding, scale, theme }))
            : renderMap(data, { themeId, padding, scale, theme })
          res.writeHead(200, {
            'Content-Type': format === 'svg' ? 'image/svg+xml' : 'image/png',
            'Content-Length': body.length,
            'Cache-Control': 'public, max-age=3600',
          })
          res.end(body)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          res.statusCode = 400
          res.end(`Error: ${msg}`)
        }
      })

      server.middlewares.use('/api/convert', async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*')
        try {
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.end('Method not allowed')
            return
          }

          const u = new URL(req.url || '/', 'http://' + (req.headers.host || 'localhost'))
          const query = Object.fromEntries(u.searchParams) as Record<string, string>
          const body = await readRequestBody(req)
          const request = parseConvertRequest(req.headers['content-type'] || '', body, query)
          const converted = await convertImageToMap(request.imageBuffer, request.options)
          const renderOptions = { themeId: converted.themeId, theme: converted.theme }

          let responseBody: Buffer
          let contentType: string
          if (converted.format === 'gemap') {
            responseBody = Buffer.from(JSON.stringify(converted.map, null, 2))
            contentType = 'application/json'
          } else if (converted.format === 'both') {
            responseBody = Buffer.from(JSON.stringify({
              map: converted.map,
              svg: renderMapSVG(converted.map, renderOptions),
            }, null, 2))
            contentType = 'application/json'
          } else if (converted.format === 'png') {
            responseBody = renderMap(converted.map, renderOptions)
            contentType = 'image/png'
          } else {
            responseBody = Buffer.from(renderMapSVG(converted.map, renderOptions))
            contentType = 'image/svg+xml'
          }

          res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': responseBody.length,
            'Cache-Control': 'no-store',
          })
          res.end(responseBody)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          res.statusCode = 400
          res.end(`Error: ${msg}`)
        }
      })

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
    },
  }
}

export default defineConfig({
  server: {
    host: '0.0.0.0',
  },
  plugins: [react(), tailwindcss(), apiPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
