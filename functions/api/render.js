/**
 * Cloudflare Pages Function: /api/render
 * Renders tilemaps to SVG (PNG requires native canvas, unavailable in Workers).
 */
import { renderMapSVG } from '../../server/map-render-svg.mjs'

export async function onRequestPost(context) {
  try {
    const body = await context.request.json()
    const u = new URL(context.request.url)
    const themeId = u.searchParams.get('theme') || body.theme || body.themeId || 'ansi-16'
    const padding = parseInt(u.searchParams.get('padding'), 10) || parseInt(body.padding, 10) || 1
    const scale = parseFloat(u.searchParams.get('scale')) || (body.scale ? parseFloat(body.scale) : undefined)

    const svg = renderMapSVG(body, { themeId, padding, scale })
    return new Response(svg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=3600'
      }
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return new Response(`Error: ${msg}`, { status: 400 })
  }
}

export async function onRequestGet(context) {
  try {
    const u = new URL(context.request.url)
    const dataB64 = u.searchParams.get('data')
    if (!dataB64) return new Response('Missing "data" parameter', { status: 400 })

    const json = atob(dataB64)  // standard base64 decode (available in Workers)
    const data = JSON.parse(json)
    const themeId = u.searchParams.get('theme') || 'ansi-16'
    const padding = parseInt(u.searchParams.get('padding'), 10) || 1
    const scale = u.searchParams.get('scale') ? parseFloat(u.searchParams.get('scale')) : undefined

    const svg = renderMapSVG(data, { themeId, padding, scale })
    return new Response(svg, {
      headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600' }
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return new Response(`Error: ${msg}`, { status: 400 })
  }
}
