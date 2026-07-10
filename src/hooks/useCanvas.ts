import { useRef, useCallback, type MutableRefObject } from 'react'
import Konva from 'konva'
import { useMapStore } from '@/stores/map-store'
import { useUiStore } from '@/stores/ui-store'
import { formatTileKey } from '@/lib/map-core'
import {
  createTilePatch,
  mergeStrokeTransaction,
  type TileTransaction,
} from '@/lib/tile-history'
import { panViewport, pointerToTile as viewportPointerToTile, zoomAtPoint } from '@/lib/viewport'
import { formatVoxelSliceId } from '@/lib/voxel-map'

export function useCanvas(stageRef: MutableRefObject<Konva.Stage | null>) {
  const isPanning = useRef(false)
  const lastMousePos = useRef({ x: 0, y: 0 })
  const isDrawing = useRef(false)
  const lastDrawnTile = useRef<string | null>(null)
  const strokeSliceId = useRef<string | null>(null)
  const strokeTransaction = useRef<TileTransaction>({ patches: [] })

  const currentTool = useMapStore((s) => s.currentTool)
  const activeTileType = useMapStore((s) => s.activeTileType)
  const activePreset = useMapStore((s) => s.activePreset)
  const placePreset = useMapStore((s) => s.placePreset)
  const floodFill = useMapStore((s) => s.floodFill)
  const tileSize = useMapStore((s) => s.tileSize)

  const resetStroke = useCallback((): void => {
    isDrawing.current = false
    lastDrawnTile.current = null
    strokeSliceId.current = null
    strokeTransaction.current = { patches: [] }
  }, [])

  const recordStrokeTile = useCallback((x: number, y: number, tileTypeId: string | null): void => {
    const state = useMapStore.getState()
    const sliceId = strokeSliceId.current ?? formatVoxelSliceId(state.activeZ)

    strokeSliceId.current = sliceId
    const key = formatTileKey(x, y)
    strokeTransaction.current = mergeStrokeTransaction(
      strokeTransaction.current,
      createTilePatch({
        sliceId,
        key,
        before: state.tiles[sliceId]?.[key],
        after: tileTypeId,
      }),
    )
    state.setTilePreview(sliceId, x, y, tileTypeId)
  }, [])

  const finishStroke = useCallback((): void => {
    if (!isDrawing.current) return

    const transaction = strokeTransaction.current
    if (transaction.patches.length > 0) {
      useMapStore.getState().commitTilePreview(transaction)
    }
    resetStroke()
  }, [resetStroke])

  const pointerToTile = useCallback((pointer: { x: number; y: number }): [number, number] => {
    const stage = stageRef.current
    if (!stage) return [0, 0]
    const pos = stage.position()
    const [x, y] = viewportPointerToTile(pointer, { x: pos.x, y: pos.y, scale: stage.scaleX() }, tileSize)
    return [x, y]
  }, [stageRef, tileSize])

  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const stage = stageRef.current
    if (!stage) return
    const pointer = stage.getPointerPosition()
    if (!pointer) return

    const direction = e.evt.deltaY > 0 ? -1 : 1
    const factor = Math.pow(1.12, direction)
    const currentViewport = { x: stage.x(), y: stage.y(), scale: stage.scaleX() }
    const nextViewport = zoomAtPoint(currentViewport, pointer, currentViewport.scale * factor)
    stage.position({ x: nextViewport.x, y: nextViewport.y })
    stage.scale({ x: nextViewport.scale, y: nextViewport.scale })
    stage.batchDraw()
    useUiStore.getState().setViewport(nextViewport)
  }, [stageRef])

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
      strokeTransaction.current = { patches: [] }
      const state = useMapStore.getState()
      strokeSliceId.current = formatVoxelSliceId(state.activeZ)
      const tileId = currentTool === 'erase' ? null : activeTileType
      recordStrokeTile(tx, ty, tileId)
      lastDrawnTile.current = formatTileKey(tx, ty)
    }
  }, [activePreset, activeTileType, currentTool, floodFill, placePreset, pointerToTile, recordStrokeTile, stageRef])

  const handleMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    const evt = e.evt
    const stage = stageRef.current
    if (!stage) return

    if (isPanning.current) {
      const dx = evt.clientX - lastMousePos.current.x
      const dy = evt.clientY - lastMousePos.current.y
      const pos = stage.position()
      const nextViewport = panViewport({ x: pos.x, y: pos.y, scale: stage.scaleX() }, { x: dx, y: dy })
      stage.position({ x: nextViewport.x, y: nextViewport.y })
      lastMousePos.current = { x: evt.clientX, y: evt.clientY }
      stage.batchDraw()
      useUiStore.getState().setViewport(nextViewport)
      return
    }

    if (!isDrawing.current) return
    if (currentTool !== 'brush' && currentTool !== 'erase') return
    const pointer = stage.getPointerPosition()
    if (!pointer) return
    const [tx, ty] = pointerToTile(pointer)
    const tileKey = `${tx},${ty}`
    if (tileKey === lastDrawnTile.current) return

    const tileId = currentTool === 'erase' ? null : activeTileType
    recordStrokeTile(tx, ty, tileId)
    lastDrawnTile.current = tileKey
  }, [activeTileType, currentTool, pointerToTile, recordStrokeTile, stageRef])

  const handleMouseUp = useCallback(() => {
    isPanning.current = false
    finishStroke()
    const stage = stageRef.current
    if (stage) {
      stage.container().style.cursor = currentTool === 'pan' ? 'grab' : 'crosshair'
    }
  }, [currentTool, finishStroke, stageRef])

  const handleMouseLeave = useCallback(() => {
    isPanning.current = false
    finishStroke()
  }, [finishStroke])

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
