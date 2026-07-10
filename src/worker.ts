import { renderMapSVG } from '../server/map-render-svg.mjs'
import { apiDocPage } from '../server/api-doc.mjs'
import {
  ApiHttpError,
  MAX_API_BODY_BYTES,
  decodeRenderGet,
  decodeRenderPost,
  ensureBodySize,
} from '../server/gemap-api.mjs'
import * as gemapRuntime from '../server/gemap-runtime.ts'

interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
}

type RenderFormat = 'svg' | 'png'
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

function renderFormat(queryFormat: unknown, bodyFormat: unknown): RenderFormat {
  const value = stringValue(queryFormat) || stringValue(bodyFormat) || 'svg'
  if (value === 'svg' || value === 'png') return value
  throw new Error(`Unsupported render format: ${value}`)
}

async function readRequestBody(request: Request): Promise<Uint8Array> {
  const declared = request.headers.get('Content-Length')
  if (declared !== null) {
    const length = Number(declared)
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new ApiHttpError(400, 'Invalid Content-Length header')
    }
    ensureBodySize(length, MAX_API_BODY_BYTES)
  }

  const reader = request.body?.getReader()
  if (reader === undefined) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    try {
      ensureBodySize(total, MAX_API_BODY_BYTES)
    } catch (error) {
      await reader.cancel(error)
      throw error
    }
    chunks.push(value)
  }
  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const method = request.method

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    if (url.pathname === '/api' || url.pathname === '/api/') {
      return new Response(apiDocPage(url.origin), { headers: { ...corsHeaders, 'Content-Type': 'text/html' } })
    }

    if (url.pathname === '/api/health') {
      return new Response(JSON.stringify({ ok: true, version: 1 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (url.pathname === '/api/render') {
      try {
        let data: RenderPayload
        let themeId = 'ansi-16'
        let padding = 1
        let scale: number | undefined
        let format: RenderFormat = 'svg'

        if (method === 'POST') {
          data = decodeRenderPost(
            await readRequestBody(request),
            request.headers.get('Content-Type') || '',
            Object.fromEntries(url.searchParams),
            gemapRuntime,
          )
          themeId = url.searchParams.get('theme') || stringValue(data.themeId) || 'ansi-16'
          padding = numberValue(url.searchParams.get('padding')) ?? numberValue(data.padding) ?? 1
          scale = numberValue(url.searchParams.get('scale')) ?? numberValue(data.scale)
          format = renderFormat(url.searchParams.get('format'), data.format)
        } else if (method === 'GET') {
          data = decodeRenderGet(url.searchParams.get('data') || undefined)
          themeId = url.searchParams.get('theme') || 'ansi-16'
          padding = numberValue(url.searchParams.get('padding')) ?? 1
          scale = numberValue(url.searchParams.get('scale'))
          format = renderFormat(url.searchParams.get('format'), undefined)
        } else {
          return new Response('Method not allowed', { status: 405 })
        }

        if (format === 'png') {
          return new Response('PNG rendering is only available in the Node renderer', {
            status: 501,
            headers: corsHeaders,
          })
        }

        const svg = renderMapSVG(data, { themeId, padding, scale, theme: isRecord(data.theme) ? data.theme : undefined })
        return new Response(svg, {
          headers: { ...corsHeaders, 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600' },
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return new Response(`Error: ${msg}`, {
          status: e instanceof ApiHttpError ? e.status : 400,
          headers: corsHeaders,
        })
      }
    }

    if (url.pathname === '/api/convert') {
      return new Response('Direct Convert API requires the Node image renderer. Use app-side image import on Cloudflare deployments or run a Node-backed server.', {
        status: 501,
        headers: corsHeaders,
      })
    }

    try {
      const response = await env.ASSETS.fetch(request)
      if (response.status === 404) {
        return await env.ASSETS.fetch(new Request(new URL('/', url), request))
      }
      return response
    } catch {
      return await env.ASSETS.fetch(new Request(new URL('/', url), request))
    }
  },
}
