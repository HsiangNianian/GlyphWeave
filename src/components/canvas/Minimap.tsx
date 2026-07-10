'use client'
import { useRef, useEffect, useCallback, useMemo } from 'react'
import Konva from 'konva'
import { useMapStore } from '@/stores/map-store'
import { useUiStore } from '@/stores/ui-store'
import { computeTileBounds, iterateVisibleTiles } from '@/lib/map-core'
import { resolveTheme } from '@/lib/theme-registry'
import { formatVoxelSliceId } from '@/lib/voxel-map'
import { colorsForTileToken } from '@/lib/render-surface'

interface MinimapProps {
  stageRef: React.RefObject<Konva.Stage | null>
}

const MINIMAP_WIDTH = 200
const MINIMAP_HEIGHT = 140

export function Minimap({ stageRef }: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cachedBase = useRef<ImageData | null>(null)
  const draggingRef = useRef(false)
  const tiles = useMapStore((s) => s.tiles)
  const activeZ = useMapStore((s) => s.activeZ)
  const themeId = useMapStore((s) => s.themeId)
  const customThemes = useMapStore((s) => s.customThemes)
  const tileSize = useMapStore((s) => s.tileSize)
  const worldName = useMapStore((s) => s.worldName)
  const setViewport = useUiStore((s) => s.setViewport)
  const viewportRef = useRef(useUiStore.getState().viewport)

  const theme = resolveTheme(themeId, customThemes)
  const themeColors = theme.colors
  const sliceId = formatVoxelSliceId(activeZ)
  const activeTiles = useMemo(() => tiles[sliceId] ?? {}, [sliceId, tiles])
  const activeSlice = useMemo(() => [{ id: sliceId, visible: true }], [sliceId])

  const bounds = useCallback(() => {
    return computeTileBounds(
      activeTiles,
      { emptyBounds: { minX: 0, minY: 0, maxX: 1, maxY: 1, w: 2, h: 2 } },
    )
  }, [activeTiles])

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

    for (const tile of iterateVisibleTiles({ [sliceId]: activeTiles }, activeSlice)) {
      const x = tile.gridX - b.minX
      const y = tile.gridY - b.minY
      const colors = colorsForTileToken({ colors: themeColors }, tile.tileTypeId)
      const color = colors?.bgColor || '#000'
      ctx.fillStyle = color
      ctx.fillRect(
        x * tileSize * scale,
        y * tileSize * scale,
        Math.ceil(tileSize * scale) + 0.5,
        Math.ceil(tileSize * scale) + 0.5,
      )
    }

    cachedBase.current = ctx.getImageData(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT)

    canvas.dataset.scale = String(scale)
    canvas.dataset.originX = String(b.minX)
    canvas.dataset.originY = String(b.minY)
    drawViewport()
  }, [activeSlice, activeTiles, bounds, drawViewport, sliceId, themeColors, tileSize])

  useEffect(() => {
    return useUiStore.subscribe((state) => {
      viewportRef.current = state.viewport
      drawViewport()
    })
  }, [drawViewport])

  const minimapToWorld = useCallback(
    (px: number, py: number): { wx: number; wy: number } => {
      const canvas = canvasRef.current
      if (!canvas) return { wx: 0, wy: 0 }
      const rect = canvas.getBoundingClientRect()
      const cx = px - rect.left
      const cy = py - rect.top
      const scale = parseFloat(canvas.dataset.scale || '1')
      const originX = parseInt(canvas.dataset.originX || '0', 10)
      const originY = parseInt(canvas.dataset.originY || '0', 10)
      return { wx: cx / scale + originX * tileSize, wy: cy / scale + originY * tileSize }
    },
    [tileSize],
  )

  const panToWorld = useCallback(
    (wx: number, wy: number): void => {
      const stage = stageRef.current
      if (!stage) return
      const s = stage.scaleX()
      const nextPosition = {
        x: -wx * s + stage.width() / 2,
        y: -wy * s + stage.height() / 2,
      }
      stage.position(nextPosition)
      stage.batchDraw()
      setViewport({
        x: nextPosition.x,
        y: nextPosition.y,
        scale: s,
      })
    },
    [setViewport, stageRef],
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault()
      draggingRef.current = true
      const { wx, wy } = minimapToWorld(e.clientX, e.clientY)
      panToWorld(wx, wy)
      document.body.style.cursor = 'grabbing'
    },
    [minimapToWorld, panToWorld],
  )

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!draggingRef.current) return
      const { wx, wy } = minimapToWorld(e.clientX, e.clientY)
      panToWorld(wx, wy)
    }
    const handleUp = () => {
      draggingRef.current = false
      document.body.style.cursor = ''
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [minimapToWorld, panToWorld])

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
        onMouseDown={handleMouseDown}
      />
    </div>
  )
}
