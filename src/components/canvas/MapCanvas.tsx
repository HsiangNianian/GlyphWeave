import { useEffect, useState, useMemo, type RefObject, type MutableRefObject } from 'react'
import { Stage, Layer, Rect, Line } from 'react-konva'
import Konva from 'konva'
import { TileCell } from './TileCell'
import { useCanvas } from '@/hooks/useCanvas'
import { useMapStore } from '@/stores/map-store'
import { useUiStore } from '@/stores/ui-store'
import { getVisibleRange } from '@/lib/viewport'
import { iterateVisibleTiles } from '@/lib/map-core'
import { resolveTheme } from '@/lib/theme-registry'

interface MapCanvasProps {
  containerRef: RefObject<HTMLDivElement | null>
  stageRef: MutableRefObject<Konva.Stage | null>
}

export function MapCanvas({ containerRef, stageRef }: MapCanvasProps) {
  const tiles = useMapStore((s) => s.tiles)
  const layers = useMapStore((s) => s.layers)
  const showGrid = useUiStore((s) => s.showGrid)
  const viewDistance = useUiStore((s) => s.viewDistance)
  const viewport = useUiStore((s) => s.viewport)
  const currentTool = useMapStore((s) => s.currentTool)
  const themeId = useMapStore((s) => s.themeId)
  const customThemes = useMapStore((s) => s.customThemes)
  const theme = resolveTheme(themeId, customThemes)
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
    () => getVisibleRange(viewport, { width: size.width, height: size.height }, tileSize, viewDistance),
    [size, tileSize, viewDistance, viewport],
  )

  const visibleTiles = useMemo(() => {
    return [...iterateVisibleTiles(tiles, layers, { range: visibleRange })]
  }, [tiles, layers, visibleRange])

  const gridLineElements = useMemo(() => {
    if (!showGrid) return null
    const lines: React.ReactElement[] = []
    const { minX, minY, maxX, maxY } = visibleRange
    const step = 1
    const gsx = Math.floor(minX / step) * step * tileSize
    const gsy = Math.floor(minY / step) * step * tileSize
    const gex = Math.ceil((maxX + 1) / step) * step * tileSize
    const gey = Math.ceil((maxY + 1) / step) * step * tileSize
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
        {visibleTiles.map(({ key, gridX, gridY, tileTypeId }) => (
          <TileCell
            key={key}
            x={gridX}
            y={gridY}
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
