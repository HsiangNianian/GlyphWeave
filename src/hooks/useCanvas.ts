import { useRef, useCallback, type MutableRefObject } from 'react'
import Konva from 'konva'
import { useMapStore } from '@/stores/map-store'
import { useUiStore, PYRAMID_LEVELS } from '@/stores/ui-store'

export function useCanvas(stageRef: MutableRefObject<Konva.Stage | null>) {
  const isPanning = useRef(false)
  const lastMousePos = useRef({ x: 0, y: 0 })
  const isDrawing = useRef(false)
  const lastDrawnTile = useRef<string | null>(null)

  const setTile = useMapStore((s) => s.setTile)
  const currentTool = useMapStore((s) => s.currentTool)
  const activeTileType = useMapStore((s) => s.activeTileType)
  const activePreset = useMapStore((s) => s.activePreset)
  const placePreset = useMapStore((s) => s.placePreset)
  const floodFill = useMapStore((s) => s.floodFill)
  const tileSize = useMapStore((s) => s.tileSize)
  const activeLayerLocked = useMapStore((s) => s.activeLayerLocked)

  const pointerToTile = useCallback((pointer: { x: number; y: number }): [number, number] => {
    const stage = stageRef.current
    if (!stage) return [0, 0]
    const pos = stage.position()
    const scale = stage.scaleX()
    return [
      Math.floor((pointer.x - pos.x) / scale / tileSize),
      Math.floor((pointer.y - pos.y) / scale / tileSize),
    ]
  }, [tileSize])

  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const stage = stageRef.current
    if (!stage) return
    const pointer = stage.getPointerPosition()
    const zoomScale = useUiStore.getState().zoomScale
    if (!pointer) return

    // Determine next pyramid level based on scroll direction
    let nextLevel: number | undefined
    if (e.evt.deltaY > 0) {
      // Zoom out — find next lower level
      for (let i = PYRAMID_LEVELS.length - 1; i >= 0; i--) {
        if (PYRAMID_LEVELS[i] < zoomScale - 0.001) {
          nextLevel = PYRAMID_LEVELS[i]
          break
        }
      }
    } else {
      // Zoom in — find next higher level
      for (let i = 0; i < PYRAMID_LEVELS.length; i++) {
        if (PYRAMID_LEVELS[i] > zoomScale + 0.001) {
          nextLevel = PYRAMID_LEVELS[i]
          break
        }
      }
    }

    if (nextLevel === undefined) return // already at min/max
    const clampedScale = nextLevel

    const mousePointTo = {
      x: (pointer.x - stage.x()) / zoomScale,
      y: (pointer.y - stage.y()) / zoomScale,
    }
    stage.position({
      x: pointer.x - mousePointTo.x * clampedScale,
      y: pointer.y - mousePointTo.y * clampedScale,
    })
    stage.scale({ x: clampedScale, y: clampedScale })
    stage.batchDraw()
    useUiStore.getState().setZoomScale(clampedScale)
  }, [])

  const handleMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    const evt = e.evt
    const stage = stageRef.current
    if (!stage) return

    if (evt.button === 1) {
      isPanning.current = true
      lastMousePos.current = { x: evt.clientX, y: evt.clientY }
      stage.container().style.cursor = 'grabbing'
      return
    }

    if (evt.button !== 0) return

    const pointer = stage.getPointerPosition()
    if (!pointer) return
    const [tx, ty] = pointerToTile(pointer)

    if (currentTool === 'pan') {
      isPanning.current = true
      lastMousePos.current = { x: evt.clientX, y: evt.clientY }
      stage.container().style.cursor = 'grabbing'
      return
    }

    if (activeLayerLocked()) return

    if (activePreset) {
      placePreset(activePreset, tx, ty)
      return
    }

    if (currentTool === 'fill') {
      floodFill(tx, ty, activeTileType)
      return
    }

    if (currentTool === 'brush' || currentTool === 'erase') {
      isDrawing.current = true
      const tileId = currentTool === 'erase' ? null : activeTileType
      setTile(tx, ty, tileId)
      lastDrawnTile.current = `${tx},${ty}`
    }
  }, [pointerToTile, currentTool, activeTileType, activePreset, placePreset, floodFill, setTile])

  const handleMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    const evt = e.evt
    const stage = stageRef.current
    if (!stage) return

    if (isPanning.current) {
      const dx = evt.clientX - lastMousePos.current.x
      const dy = evt.clientY - lastMousePos.current.y
      const pos = stage.position()
      stage.position({ x: pos.x + dx, y: pos.y + dy })
      lastMousePos.current = { x: evt.clientX, y: evt.clientY }
      stage.batchDraw()
      return
    }

    if (!isDrawing.current) return
    if (currentTool !== 'brush' && currentTool !== 'erase') return
    if (activeLayerLocked()) return

    const pointer = stage.getPointerPosition()
    if (!pointer) return
    const [tx, ty] = pointerToTile(pointer)
    const tileKey = `${tx},${ty}`
    if (tileKey === lastDrawnTile.current) return

    const tileId = currentTool === 'erase' ? null : activeTileType
    setTile(tx, ty, tileId)
    lastDrawnTile.current = tileKey
  }, [pointerToTile, currentTool, activeTileType, setTile])

  const handleMouseUp = useCallback(() => {
    isPanning.current = false
    isDrawing.current = false
    lastDrawnTile.current = null
    const stage = stageRef.current
    if (stage) {
      stage.container().style.cursor = currentTool === 'pan' ? 'grab' : 'crosshair'
    }
  }, [currentTool])

  const handleMouseLeave = useCallback(() => {
    isPanning.current = false
    isDrawing.current = false
    lastDrawnTile.current = null
  }, [])

  return {
    stageRef,
    tileSize,
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave,
  }
}
