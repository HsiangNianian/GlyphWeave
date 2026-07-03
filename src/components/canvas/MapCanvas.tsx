import { useEffect, useState, useMemo, type RefObject } from 'react'
import { Stage, Layer, Rect, Line } from 'react-konva'
import Konva from 'konva'
import { TileCell } from './TileCell'
import { useCanvas } from '@/hooks/useCanvas'
import { useMapStore } from '@/stores/map-store'
import { useUiStore } from '@/stores/ui-store'
import { THEMES } from '@/constants/themes'
import type { MutableRefObject } from 'react'

function getVisibleRange(stage: Konva.Stage | null, tileSize: number, w: number, h: number) {
  if (!stage) return { minX: -10, minY: -10, maxX: 10, maxY: 10 }
  const pos = stage.position()
  const s = stage.scaleX()
  const wx = -pos.x / s
  const wy = -pos.y / s
  const ww = w / s
  const wh = h / s
  const p = 2
  return {
    minX: Math.floor(wx / tileSize) - p,
    minY: Math.floor(wy / tileSize) - p,
    maxX: Math.ceil((wx + ww) / tileSize) + p,
    maxY: Math.ceil((wy + wh) / tileSize) + p,
  }
}

interface MapCanvasProps {
  containerRef: RefObject<HTMLDivElement | null>
  stageRef: MutableRefObject<Konva.Stage | null>
}

export function MapCanvas({ containerRef, stageRef }: MapCanvasProps) {
  const tiles = useMapStore((s) => s.tiles)
  const layers = useMapStore((s) => s.layers)
  const showGrid = useUiStore((s) => s.showGrid)
  const currentTool = useMapStore((s) => s.currentTool)
  const themeId = useMapStore((s) => s.themeId)
  const theme = THEMES[themeId]
  const { tileSize, handleWheel, handleMouseDown, handleMouseMove, handleMouseUp, handleMouseLeave } = useCanvas(stageRef)

  const [size, setSize] = useState({ width: 800, height: 600 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      if (entry) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [containerRef])

  const visibleRange = useMemo(
    () => getVisibleRange(stageRef.current, tileSize, size.width, size.height),
    [size, tileSize, tiles],
  )

  const visibleTiles = useMemo(() => {
    const result: { key: string; x: number; y: number; tileTypeId: string }[] = []
    for (const layer of layers) {
      if (!layer.visible) continue
      const layerTiles = tiles[layer.id]
      if (!layerTiles) continue
      for (const [key, tileTypeId] of Object.entries(layerTiles)) {
        if (!tileTypeId) continue
        const [sx, sy] = key.split(',')
        const x = parseInt(sx, 10)
        const y = parseInt(sy, 10)
        if (x >= visibleRange.minX && x <= visibleRange.maxX && y >= visibleRange.minY && y <= visibleRange.maxY) {
          result.push({ key: `${layer.id}:${key}`, x, y, tileTypeId })
        }
      }
    }
    return result
  }, [tiles, layers, visibleRange])

  const gridLineElements = useMemo(() => {
    if (!showGrid) return null
    const lines: React.ReactElement[] = []
    const { minX, minY, maxX, maxY } = visibleRange
    const gsx = minX * tileSize
    const gsy = minY * tileSize
    const gex = (maxX + 1) * tileSize
    const gey = (maxY + 1) * tileSize
    for (let gx = minX; gx <= maxX + 1; gx++) {
      lines.push(<Line key={`gv${gx}`} points={[gx * tileSize, gsy, gx * tileSize, gey]} stroke="#222" strokeWidth={0.5} listening={false} />)
    }
    for (let gy = minY; gy <= maxY + 1; gy++) {
      lines.push(<Line key={`gh${gy}`} points={[gsx, gy * tileSize, gex, gy * tileSize]} stroke="#222" strokeWidth={0.5} listening={false} />)
    }
    return lines
  }, [showGrid, visibleRange, tileSize])

  return (
    <Stage
      ref={stageRef}
      width={size.width}
      height={size.height}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      style={{ background: '#000', cursor: currentTool === 'pan' ? 'grab' : 'crosshair' }}
    >
      <Layer>
        <Rect x={-50000} y={-50000} width={100000} height={100000} fill="#000" listening={false} />
        {visibleTiles.map(({ key, x, y, tileTypeId }) => (
          <TileCell
            key={key}
            x={x}
            y={y}
            tileTypeId={tileTypeId}
            tileSize={tileSize}
            colors={theme.colors[tileTypeId] || { fgColor: '#fff', bgColor: '#000' }}
          />
        ))}
        {gridLineElements}
      </Layer>
    </Stage>
  )
}
