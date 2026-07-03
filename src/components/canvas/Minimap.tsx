import { useRef, useEffect, useCallback } from 'react'
import Konva from 'konva'
import { useMapStore } from '@/stores/map-store'
import { THEMES } from '@/constants/themes'

interface MinimapProps {
  stageRef: React.RefObject<Konva.Stage | null>
}

const MINIMAP_WIDTH = 200
const MINIMAP_HEIGHT = 140

export function Minimap({ stageRef }: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const tiles = useMapStore((s) => s.tiles)
  const layers = useMapStore((s) => s.layers)
  const themeId = useMapStore((s) => s.themeId)
  const tileSize = useMapStore((s) => s.tileSize)
  const worldName = useMapStore((s) => s.worldName)

  const theme = THEMES[themeId]

  // ── compute map bounds from all layers ──
  const bounds = useCallback(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    let hasTiles = false
    for (const layer of layers) {
      if (!layer.visible) continue
      const lt = tiles[layer.id]
      if (!lt) continue
      for (const key of Object.keys(lt)) {
        const [sx, sy] = key.split(',')
        const x = parseInt(sx, 10)
        const y = parseInt(sy, 10)
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
        hasTiles = true
      }
    }
    if (!hasTiles) return { minX: 0, minY: 0, maxX: 1, maxY: 1, w: 2, h: 2 }
    return { minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1 }
  }, [tiles, layers])

  // ── draw base tiles (only on data change) ──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const b = bounds()
    const scaleX = MINIMAP_WIDTH / (b.w * tileSize)
    const scaleY = MINIMAP_HEIGHT / (b.h * tileSize)
    const scale = Math.min(scaleX, scaleY)

    ctx.clearRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT)

    // draw from bottom layer to top
    for (let li = 0; li < layers.length; li++) {
      const layer = layers[li]
      if (!layer.visible) continue
      const lt = tiles[layer.id]
      if (!lt) continue

      for (const [key, tileTypeId] of Object.entries(lt)) {
        if (!tileTypeId) continue
        const [sx, sy] = key.split(',')
        const x = parseInt(sx, 10) - b.minX
        const y = parseInt(sy, 10) - b.minY
        const colors = theme.colors[tileTypeId]
        const color = colors?.bgColor || '#000'
        ctx.fillStyle = color
        ctx.fillRect(x * tileSize * scale, y * tileSize * scale, Math.ceil(tileSize * scale) + 0.5, Math.ceil(tileSize * scale) + 0.5)
      }
    }

    // cache for viewport overlay
    canvas.dataset.scale = String(scale)
    canvas.dataset.originX = String(b.minX)
    canvas.dataset.originY = String(b.minY)
  }, [tiles, layers, themeId, tileSize, bounds])

  // ── viewport rect & animation loop ──
  useEffect(() => {
    let frame = 0
    function drawViewport() {
      const canvas = canvasRef.current
      if (!canvas) { frame = requestAnimationFrame(drawViewport); return }
      const ctx = canvas.getContext('2d')
      if (!ctx) { frame = requestAnimationFrame(drawViewport); return }
      const stage = stageRef.current
      const scale = parseFloat(canvas.dataset.scale || '1')
      const originX = parseInt(canvas.dataset.originX || '0', 10)
      const originY = parseInt(canvas.dataset.originY || '0', 10)

      // redraw just the viewport rect
      // first restore the base image by drawing over old rect
      // simpler: we need the base tiles, so let's not clear — just draw a transparent overlay rect

      if (stage) {
        const pos = stage.position()
        const s = stage.scaleX()
        const w = stage.width()
        const h = stage.height()

        // visible area in stage coords
        const vx = (-pos.x) / s
        const vy = (-pos.y) / s
        const vw = w / s
        const vh = h / s

        // map to minimap coords
        const mx = (vx - originX * tileSize) * scale
        const my = (vy - originY * tileSize) * scale
        const mw = vw * scale
        const mh = vh * scale

        // dim overlay outside viewport
        ctx.fillStyle = 'rgba(0,0,0,0.45)'
        // top
        ctx.fillRect(0, 0, MINIMAP_WIDTH, Math.max(0, my))
        // bottom
        ctx.fillRect(0, my + mh, MINIMAP_WIDTH, Math.max(0, MINIMAP_HEIGHT - my - mh))
        // left
        ctx.fillRect(0, Math.max(0, my), Math.max(0, mx), Math.min(mh, MINIMAP_HEIGHT - my))
        // right
        ctx.fillRect(mx + mw, Math.max(0, my), Math.max(0, MINIMAP_WIDTH - mx - mw), Math.min(mh, MINIMAP_HEIGHT - my))

        // viewport border
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1.5
        ctx.strokeRect(mx, my, mw, mh)
      } else {
        // no stage — dim all
        ctx.fillStyle = 'rgba(0,0,0,0.5)'
        ctx.fillRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT)
      }

      frame = requestAnimationFrame(drawViewport)
    }
    frame = requestAnimationFrame(drawViewport)
    return () => cancelAnimationFrame(frame)
  }, [stageRef, tileSize])

  // ── click to pan ──
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const stage = stageRef.current
    if (!stage) return
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    const scale = parseFloat(canvas.dataset.scale || '1')
    const originX = parseInt(canvas.dataset.originX || '0', 10)
    const originY = parseInt(canvas.dataset.originY || '0', 10)

    // minimap pixel → world coordinate
    const wx = px / scale + originX * tileSize
    const wy = py / scale + originY * tileSize

    // center viewport on this point
    const vw = stage.width()
    const vh = stage.height()
    const s = stage.scaleX()
    stage.position({
      x: -wx * s + vw / 2,
      y: -wy * s + vh / 2,
    })
    stage.batchDraw()
  }, [stageRef, tileSize])

  return (
    <div
      className="rounded border border-zinc-700 overflow-hidden shadow-lg pointer-events-auto"
      style={{ width: MINIMAP_WIDTH, height: MINIMAP_HEIGHT }}
      title={worldName}
    >
      <canvas
        ref={canvasRef}
        width={MINIMAP_WIDTH}
        height={MINIMAP_HEIGHT}
        className="block cursor-crosshair"
        onClick={handleClick}
      />
    </div>
  )
}
