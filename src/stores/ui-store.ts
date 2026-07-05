import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
/**
 * Zoom pyramid levels (discrete zoom ratios).
 * Each level is a "stop" — zoom snaps to the nearest level for consistency.
 * Sorted ascending.
 */
export const PYRAMID_LEVELS = [
  0.125,   // 12.5%
  0.1667,  // ~16.7%
  0.25,    // 25%
  0.3333,  // ~33%
  0.5,     // 50%
  0.75,    // 75%
  1.0,     // 100%
  1.5,     // 150%
  2.0,     // 200%
  3.0,     // 300%
  4.0,     // 400%
  6.0,     // 600%
  8.0,     // 800%
] as const

export function nearestPyramidLevel(scale: number): number {
  return PYRAMID_LEVELS.reduce((prev, curr) =>
    Math.abs(curr - scale) < Math.abs(prev - scale) ? curr : prev,
  )
}

export interface UiStore {
  sidePanelTab: string
  sidePanelOpen: boolean
  showGrid: boolean
  showMinimap: boolean
  viewDistance: number
  zoomScale: number

  setSidePanelTab: (tab: string) => void
  setSidePanelOpen: (open: boolean) => void
  toggleSidePanel: () => void
  setShowGrid: (show: boolean) => void
  setShowMinimap: (show: boolean) => void
  setViewDistance: (d: number) => void
  setZoomScale: (scale: number) => void
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
  zoomToFit: (mapBounds: { w: number; h: number }, containerSize: { w: number; h: number }) => void
}

export const useUiStore = create<UiStore>()(
  immer((set, get) => ({
    sidePanelTab: 'tiles',
    sidePanelOpen: true,
    showGrid: true,
    showMinimap: true,
    viewDistance: 5,
    zoomScale: 1,

    setSidePanelTab: (tab) => set((draft) => { draft.sidePanelTab = tab }),
    setSidePanelOpen: (open) => set((draft) => { draft.sidePanelOpen = open }),
    toggleSidePanel: () => set((draft) => { draft.sidePanelOpen = !draft.sidePanelOpen }),
    setShowGrid: (show) => set((draft) => { draft.showGrid = show }),
    setShowMinimap: (show) => set((draft) => { draft.showMinimap = show }),
    setViewDistance: (d) => set((draft) => { draft.viewDistance = Math.max(1, Math.min(100, d)) }),
    setZoomScale: (scale) => set((draft) => { draft.zoomScale = Math.max(0.125, Math.min(8, scale)) }),

    zoomIn: () => {
      const { zoomScale } = get()
      const next = PYRAMID_LEVELS.find((l) => l > zoomScale + 0.001)
      if (next !== undefined) set((draft) => { draft.zoomScale = next })
    },

    zoomOut: () => {
      const { zoomScale } = get()
      let prev: number | undefined
      for (let i = PYRAMID_LEVELS.length - 1; i >= 0; i--) {
        if (PYRAMID_LEVELS[i] < zoomScale - 0.001) {
          prev = PYRAMID_LEVELS[i]
          break
        }
      }
      if (prev !== undefined) set((draft) => { draft.zoomScale = prev })
    },

    resetZoom: () => set((draft) => { draft.zoomScale = 1 }),

    zoomToFit: (mapBounds, containerSize) => {
      if (mapBounds.w <= 0 || mapBounds.h <= 0 || containerSize.w <= 0 || containerSize.h <= 0) return
      const scaleX = containerSize.w / (mapBounds.w * 24)
      const scaleY = containerSize.h / (mapBounds.h * 24)
      const rawScale = Math.min(scaleX, scaleY) * 0.85
      const snapped = nearestPyramidLevel(rawScale)
      set((draft) => { draft.zoomScale = Math.max(0.125, Math.min(8, snapped)) })
    },
  }))
)
