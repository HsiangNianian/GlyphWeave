import { useEffect, useState, useMemo, type RefObject } from 'react'
import { Stage, Layer, Rect, Line } from 'react-konva'
import Konva from 'konva'
import { TileCell } from './TileCell'
import { consolidateTiles, getPyramidBlockSize } from './pyramid'
import type { ConsolidatedTile } from './pyramid'
import { useCanvas } from '@/hooks/useCanvas'
import { useMapStore } from '@/stores/map-store'
import { useUiStore } from '@/stores/ui-store'
import { THEMES } from '@/constants/themes'
import type { MutableRefObject } from 'react'

function getVisibleRange(stage: Konva.Stage | null, tileSize: number, w: number, h: number, padding: number) {
  if (!stage) return { minX: -10, minY: -10, maxX: 10, maxY: 10 }
  const pos = stage.position()
  const s = stage.scaleX()
  const wx = -pos.x / s
  const wy = -pos.y / s
  const ww = w / s
  const wh = h / s
  return {
    minX: Math.floor(wx / tileSize) - padding,
    minY: Math.floor(wy / tileSize) - padding,
    maxX: Math.ceil((wx + ww) / tileSize) + padding,
    maxY: Math.ceil((wy + wh) / tileSize) + padding,
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
  const zoomScale = useUiStore((s) => s.zoomScale)
  const viewDistance = useUiStore((s) => s.viewDistance)
  const currentTool = useMapStore((s) => s.currentTool)
  const themeId = useMapStore((s) => s.themeId)
  const theme = THEMES[themeId]
  const { tileSize, handleWheel, handleMouseDown, handleMouseMove, handleMouseUp, handleMouseLeave } = useCanvas(stageRef)

  const blockSize = getPyramidBlockSize(zoomScale)

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
    () => getVisibleRange(stageRef.current, tileSize, size.width, size.height, viewDistance),
    [size, tileSize, tiles, viewDistance, stageRef.current],
  )

  const visibleTiles = useMemo(() => {
    const result: ConsolidatedTile[] = []
    for (const layer of layers) {
      if (!layer.visible) continue
      const layerTiles = tiles[layer.id]
      if (!layerTiles) continue
      const consolidated = consolidateTiles(layerTiles, blockSize, visibleRange)
      for (const tile of consolidated) {
        tile.key = `${layer.id}:${tile.key}`
        result.push(tile)
      }
    }
    return result
  }, [tiles, layers, visibleRange, blockSize])

  const gridLineElements = useMemo(() => {
    if (!showGrid) return null
    const lines: React.ReactElement[] = []
    const { minX, minY, maxX, maxY } = visibleRange
    // Align grid to block boundaries when consolidated
    const step = Math.max(blockSize, 1)
    const gsx = (Math.floor(minX / step)) * step * tileSize
    const gsy = (Math.floor(minY / step)) * step * tileSize
    const gex = (Math.ceil((maxX + 1) / step)) * step * tileSize
    const gey = (Math.ceil((maxY + 1) / step)) * step * tileSize
    const gxStart = Math.floor(minX / step) * step
    const gxEnd = Math.ceil((maxX + 1) / step) * step
    const gyStart = Math.floor(minY / step) * step
    const gyEnd = Math.ceil((maxY + 1) / step) * step
    for (let gx = gxStart; gx <= gxEnd; gx += step) {
      lines.push(<Line key={`gv${gx}`} points={[gx * tileSize, gsy, gx * tileSize, gey]} stroke="#222" strokeWidth={0.5} listening={false} />)
    }
    for (let gy = gyStart; gy <= gyEnd; gy += step) {
      lines.push(<Line key={`gh${gy}`} points={[gsx, gy * tileSize, gex, gy * tileSize]} stroke="#222" strokeWidth={0.5} listening={false} />)
    }
    return lines
  }, [showGrid, visibleRange, tileSize, blockSize])

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
        {visibleTiles.map(({ key, gridX, gridY, tileTypeId }) => (
          <TileCell
            key={key}
            x={gridX / blockSize}
            y={gridY / blockSize}
            tileTypeId={tileTypeId}
            tileSize={tileSize * blockSize}
            colors={theme.colors[tileTypeId] || { fgColor: '#fff', bgColor: '#000' }}
          />
        ))}
        {gridLineElements}
      </Layer>
    </Stage>
  )
}
