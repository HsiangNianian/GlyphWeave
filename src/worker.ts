import { renderMapSVG } from '../server/map-render-svg.mjs'

interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
}

let resvgInit: Promise<any> | null = null
function getResvg(env: Env) {
  if (!resvgInit) {
    resvgInit = (async () => {
      const wasmResponse = await env.ASSETS.fetch(new Request(new URL('https://placeholder/resvg-wasm.wasm')))
      const wasmBytes = await wasmResponse.arrayBuffer()
      const resvgPkg = await import('@resvg/resvg-wasm')
      await resvgPkg.initWasm(wasmBytes)
      return resvgPkg
    })()
  }
  return resvgInit
}

const API_PAGE = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>GlyphWeave Render API</title>
<style>body{font-family:monospace;background:#111;color:#ccc;padding:2rem;max-width:800px;margin:auto}
a{color:#8af}h1{color:#fff}code{background:#222;padding:0.2em 0.4em;border-radius:3px}
pre{background:#222;padding:1em;border-radius:4px;overflow-x:auto}
table{border-collapse:collapse;width:100%;margin:1em 0}
th,td{border:1px solid #333;padding:.4em .6em;text-align:left}
th{background:#1a1a1a;color:#8cf}</style>
</head><body>
<h1>GlyphWeave Render API</h1>
<p>Render tilemaps to SVG or PNG images.</p>
<h2>POST (any size, recommended)</h2>
<pre><code>POST /api/render
Content-Type: application/json

{
  "tiles": { "0,0": "wall", "1,0": "floor", ... },
  "themeId": "ansi-16",
  "padding": 1,
  "scale": 24
}</code></pre>
<h2>GET (small maps)</h2>
<pre><code>GET /api/render?data=&lt;base64&gt;&amp;theme=&lt;themeId&gt;</code></pre>
<h3>Parameters</h3>
<table>
<thead><tr><th>Param</th><th>Type</th><th>Default</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>data</code> (GET)</td><td>string</td><td>—</td><td>Base64-encoded map JSON</td></tr>
<tr><td><code>theme</code></td><td>string</td><td><code>ansi-16</code></td><td>Theme ID (<code>ansi-16</code> or <code>cogmind</code>)</td></tr>
<tr><td><code>padding</code></td><td>number</td><td><code>1</code></td><td>Extra tile border</td></tr>
<tr><td><code>scale</code></td><td>number</td><td>auto</td><td>Pixels per tile (auto-fit ≤4096px)</td></tr>
<tr><td><code>format</code></td><td>string</td><td><code>svg</code></td><td>Output format (<code>svg</code> or <code>png</code>)</td></tr>
</tbody>
</table>
<h3>Examples</h3>
<pre><code>curl -X POST https://glyphweave.hydroroll.team/api/render \\
  -H "Content-Type: application/json" \\
  -d @map.gemap > map.svg

curl -X POST "https://glyphweave.hydroroll.team/api/render?format=png" \\
  -H "Content-Type: application/json" \\
  -d @map.gemap > map.png</code></pre>
<h3>Endpoints</h3>
<table>
<thead><tr><th>Path</th><th>Methods</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>/api/render</code></td><td>GET, POST</td><td>Render a tilemap to SVG or PNG</td></tr>
<tr><td><code>/api/health</code></td><td>GET</td><td><code>{"ok":true,"version":1}</code></td></tr>
<tr><td><code>/api</code></td><td>GET</td><td>This documentation page</td></tr>
</tbody>
</table>
</body></html>`

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const method = request.method
    const format = url.searchParams.get('format') || 'svg'

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    // ── /api (documentation) ──
    if (url.pathname === '/api' || url.pathname === '/api/') {
      return new Response(API_PAGE, { headers: { ...corsHeaders, 'Content-Type': 'text/html' } })
    }

    // ── /api/health ──
    if (url.pathname === '/api/health') {
      return new Response(JSON.stringify({ ok: true, version: 1 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── /api/render ──
    if (url.pathname === '/api/render') {
      try {
        let data: any
        let themeId = 'ansi-16'
        let padding = 1
        let scale: number | undefined

        if (method === 'POST') {
          data = await request.json()
          themeId = url.searchParams.get('theme') || data.theme || data.themeId || 'ansi-16'
          padding = parseInt(url.searchParams.get('padding') || data.padding, 10) || 1
          scale = url.searchParams.get('scale')
            ? parseFloat(url.searchParams.get('scale')!)
            : data.scale
              ? parseFloat(data.scale)
              : undefined
        } else if (method === 'GET') {
          const dataB64 = url.searchParams.get('data')
          if (!dataB64) return new Response('Missing "data" parameter', { status: 400 })
          const json = atob(dataB64)
          data = JSON.parse(json)
          themeId = url.searchParams.get('theme') || 'ansi-16'
          padding = parseInt(url.searchParams.get('padding') || '1', 10) || 1
          scale = url.searchParams.get('scale') ? parseFloat(url.searchParams.get('scale')!) : undefined
        } else {
          return new Response('Method not allowed', { status: 405 })
        }

        const svg = renderMapSVG(data, { themeId, padding, scale })

        if (format === 'png') {
          const r = await getResvg(env)
          const resvg = new r.Resvg(svg, { fitTo: { mode: 'original' } })
          const pngBuffer = resvg.render().asPng()
          return new Response(pngBuffer, {
            headers: { ...corsHeaders, 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' },
          })
        }

        return new Response(svg, {
          headers: { ...corsHeaders, 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600' },
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return new Response(`Error: ${msg}`, { status: 400 })
      }
    }

    // SPA fallback
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
