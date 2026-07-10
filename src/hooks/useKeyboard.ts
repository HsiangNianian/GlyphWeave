import { useEffect } from 'react'
import { useMapStore } from '@/stores/map-store'
import { useUiStore } from '@/stores/ui-store'
import type { ToolType } from '@/types'

export function useKeyboard() {
  const undo = useMapStore((s) => s.undo)
  const redo = useMapStore((s) => s.redo)
  const setCurrentTool = useMapStore((s) => s.setCurrentTool)
  const activeZ = useMapStore((s) => s.activeZ)
  const setActiveZ = useMapStore((s) => s.setActiveZ)
  const setShowGrid = useUiStore((s) => s.setShowGrid)
  const showGrid = useUiStore((s) => s.showGrid)
  const zoomIn = useUiStore((s) => s.zoomIn)
  const zoomOut = useUiStore((s) => s.zoomOut)
  const resetZoom = useUiStore((s) => s.resetZoom)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

      // Zoom shortcuts (Ctrl +/-/0)
      if (e.ctrlKey && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        zoomIn()
        return
      }
      if (e.ctrlKey && e.key === '-') {
        e.preventDefault()
        zoomOut()
        return
      }
      if (e.ctrlKey && e.key === '0') {
        e.preventDefault()
        resetZoom()
        return
      }

      if (e.ctrlKey && e.shiftKey && e.key === 'Z') {
        e.preventDefault()
        redo()
        return
      }
      if (e.ctrlKey && e.key === 'z') {
        e.preventDefault()
        undo()
        return
      }

      const toolMap: Record<string, ToolType> = {
        'b': 'brush', 'B': 'brush',
        'e': 'erase', 'E': 'erase',
        'p': 'pan', 'P': 'pan',
        'f': 'fill', 'F': 'fill',
        's': 'select', 'S': 'select',
      }
      if (toolMap[e.key]) {
        e.preventDefault()
        setCurrentTool(toolMap[e.key])
        return
      }

      if (e.key === 'g' || e.key === 'G') {
        e.preventDefault()
        setShowGrid(!showGrid)
        return
      }

      if (e.key === 'PageUp') {
        e.preventDefault()
        setActiveZ(activeZ + 1)
        return
      }
      if (e.key === 'PageDown') {
        e.preventDefault()
        setActiveZ(activeZ - 1)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeZ, redo, resetZoom, setActiveZ, setCurrentTool, setShowGrid, showGrid, undo, zoomIn, zoomOut])
}
