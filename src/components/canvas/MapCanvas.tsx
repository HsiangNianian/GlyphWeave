import { useCallback, useEffect, useMemo, useRef, useState, type RefObject, type MutableRefObject } from 'react'
import { Stage, Layer, Rect, Line } from 'react-konva'
import Konva from 'konva'
import { TileBatchLayer } from './TileBatchLayer'
import { useCanvas } from '@/hooks/useCanvas'
import { useMapStore } from '@/stores/map-store'
import { useUiStore } from '@/stores/ui-store'
import { getVisibleRange, type Viewport, type VisibleRange } from '@/lib/viewport'
import { DEFAULT_TILE_CHUNK_SIZE, buildVisibleTileChunkIndex, iterateVisibleTileChunks } from '@/lib/map-core'
import { resolveTheme } from '@/lib/theme-registry'

interface MapCanvasProps {
  containerRef: RefObject<HTMLDivElement | null>
  stageRef: MutableRefObject<Konva.Stage | null>
}

function visibleRangeEquals(a: VisibleRange, b: VisibleRange): boolean {
  return a.minX === b.minX && a.minY === b.minY && a.maxX === b.maxX && a.maxY === b.maxY
}

function alignVisibleRangeToChunks(
  range: VisibleRange,
  chunkSize = DEFAULT_TILE_CHUNK_SIZE,
): VisibleRange {
  const minChunkX = Math.floor(range.minX / chunkSize)
  const minChunkY = Math.floor(range.minY / chunkSize)
  const maxChunkX = Math.floor(range.maxX / chunkSize)
  const maxChunkY = Math.floor(range.maxY / chunkSize)

  return {
    minX: minChunkX * chunkSize,
    minY: minChunkY * chunkSize,
    maxX: (maxChunkX + 1) * chunkSize - 1,
    maxY: (maxChunkY + 1) * chunkSize - 1,
  }
}

export function MapCanvas({ containerRef, stageRef }: MapCanvasProps) {
  const tiles = useMapStore((s) => s.tiles)
  const layers = useMapStore((s) => s.layers)
  const showGrid = useUiStore((s) => s.showGrid)
  const viewDistance = useUiStore((s) => s.viewDistance)
  const currentTool = useMapStore((s) => s.currentTool)
  const themeId = useMapStore((s) => s.themeId)
  const customThemes = useMapStore((s) => s.customThemes)
  const theme = resolveTheme(themeId, customThemes)
  const { tileSize, handleWheel, handleMouseDown, handleMouseMove, handleMouseUp, handleMouseLeave } = useCanvas(stageRef)

  const [size, setSize] = useState({ width: 800, height: 600 })
  const [visibleRange, setVisibleRange] = useState(() =>
    alignVisibleRangeToChunks(
      getVisibleRange(useUiStore.getState().viewport, { width: 800, height: 600 }, tileSize, viewDistance),
    ),
  )
  const visibleRangeRef = useRef(visibleRange)

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

  const updateVisibleRange = useCallback((viewport: Viewport): void => {
    const nextRange = alignVisibleRangeToChunks(
      getVisibleRange(
        viewport,
        { width: size.width, height: size.height },
        tileSize,
        viewDistance,
      ),
    )
    if (visibleRangeEquals(visibleRangeRef.current, nextRange)) return

    visibleRangeRef.current = nextRange
    setVisibleRange(nextRange)
  }, [size.height, size.width, tileSize, viewDistance])

  useEffect(() => {
    updateVisibleRange(useUiStore.getState().viewport)
  }, [updateVisibleRange])

  useEffect(() => {
    return useUiStore.subscribe((state) => {
      updateVisibleRange(state.viewport)
    })
  }, [updateVisibleRange])

  const visibleTileIndex = useMemo(() => {
    return buildVisibleTileChunkIndex(tiles, layers)
  }, [tiles, layers])

  const visibleTiles = useMemo(() => {
    return [...iterateVisibleTileChunks(visibleTileIndex, { range: visibleRange })]
  }, [visibleTileIndex, visibleRange])

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
        <TileBatchLayer
          tiles={visibleTiles}
          tileSize={tileSize}
          colorsByTileId={theme.colors}
        />
        {gridLineElements}
      </Layer>
    </Stage>
  )
}
