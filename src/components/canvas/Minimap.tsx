'use client'
import { useRef, useEffect, useCallback } from 'react'
import Konva from 'konva'
import { useMapStore } from '@/stores/map-store'
import { useUiStore } from '@/stores/ui-store'
import { computeTileBounds, flattenLayerTiles, iterateVisibleTiles } from '@/lib/map-core'
import { resolveTheme } from '@/lib/theme-registry'

interface MinimapProps {
  stageRef: React.RefObject<Konva.Stage | null>
}

const MINIMAP_WIDTH = 200
const MINIMAP_HEIGHT = 140

export function Minimap({ stageRef }: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cachedBase = useRef<ImageData | null>(null)
  const tiles = useMapStore((s) => s.tiles)
  const layers = useMapStore((s) => s.layers)
  const themeId = useMapStore((s) => s.themeId)
  const customThemes = useMapStore((s) => s.customThemes)
  const tileSize = useMapStore((s) => s.tileSize)
  const worldName = useMapStore((s) => s.worldName)
  const viewport = useUiStore((s) => s.viewport)
  const setViewport = useUiStore((s) => s.setViewport)
  const viewportRef = useRef(viewport)

  const theme = resolveTheme(themeId, customThemes)

  // ── compute map bounds from all layers ──
  const bounds = useCallback(() => {
    return computeTileBounds(
      flattenLayerTiles(tiles, layers),
      { emptyBounds: { minX: 0, minY: 0, maxX: 1, maxY: 1, w: 2, h: 2 } },
    )
  }, [tiles, layers])

  const drawViewport = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    if (cachedBase.current) {
      ctx.putImageData(cachedBase.current, 0, 0)
    }

    const stage = stageRef.current
    const scale = parseFloat(canvas.dataset.scale || '1')
    const originX = parseInt(canvas.dataset.originX || '0', 10)
    const originY = parseInt(canvas.dataset.originY || '0', 10)

    if (!stage) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)'
      ctx.fillRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT)
      return
    }

    const currentViewport = viewportRef.current
    const s = currentViewport.scale
    const w = stage.width()
    const h = stage.height()

    const vx = -currentViewport.x / s
    const vy = -currentViewport.y / s
    const vw = w / s
    const vh = h / s

    const mx = (vx - originX * tileSize) * scale
    const my = (vy - originY * tileSize) * scale
    const mw = vw * scale
    const mh = vh * scale

    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    if (my > 0) ctx.fillRect(0, 0, MINIMAP_WIDTH, Math.min(my, MINIMAP_HEIGHT))
    if (my + mh < MINIMAP_HEIGHT)
      ctx.fillRect(0, Math.max(0, my + mh), MINIMAP_WIDTH, MINIMAP_HEIGHT - Math.max(0, my + mh))
    if (mx > 0)
      ctx.fillRect(0, Math.max(0, my), Math.min(mx, MINIMAP_WIDTH), Math.max(0, Math.min(mh, MINIMAP_HEIGHT - my)))
    if (mx + mw < MINIMAP_WIDTH)
      ctx.fillRect(
        Math.max(0, mx + mw),
        Math.max(0, my),
        MINIMAP_WIDTH - Math.max(0, mx + mw),
        Math.max(0, Math.min(mh, MINIMAP_HEIGHT - my)),
      )

    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1.5
    ctx.strokeRect(mx, my, mw, mh)
  }, [stageRef, tileSize])

  // ── draw base tiles and cache ImageData ──
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

    for (const tile of iterateVisibleTiles(tiles, layers)) {
      const x = tile.gridX - b.minX
      const y = tile.gridY - b.minY
      const colors = theme.colors[tile.tileTypeId]
      const color = colors?.bgColor || '#000'
      ctx.fillStyle = color
      ctx.fillRect(
        x * tileSize * scale,
        y * tileSize * scale,
        Math.ceil(tileSize * scale) + 0.5,
        Math.ceil(tileSize * scale) + 0.5,
      )
    }

    // cache the full base image so the animation loop can restore it
    cachedBase.current = ctx.getImageData(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT)

    canvas.dataset.scale = String(scale)
    canvas.dataset.originX = String(b.minX)
    canvas.dataset.originY = String(b.minY)
    drawViewport()
  }, [tiles, layers, theme.colors, tileSize, bounds, drawViewport])

  // ── viewport rect overlay (evented, no permanent RAF loop) ──
  useEffect(() => {
    viewportRef.current = viewport
    drawViewport()
  }, [drawViewport, viewport])

  // ── click to pan ──
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
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
      const nextPosition = {
        x: -wx * s + vw / 2,
        y: -wy * s + vh / 2,
      }
      stage.position(nextPosition)
      stage.batchDraw()
      setViewport({
        x: nextPosition.x,
        y: nextPosition.y,
        scale: s,
      })
    },
    [setViewport, stageRef, tileSize],
  )

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
