import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { clampZoomScale, type Viewport } from '@/lib/viewport'

export type ViewportState = Viewport

export interface UiStore {
  sidePanelTab: string
  sidePanelOpen: boolean
  showGrid: boolean
  showMinimap: boolean
  viewDistance: number
  zoomScale: number
  viewport: ViewportState

  setSidePanelTab: (tab: string) => void
  setSidePanelOpen: (open: boolean) => void
  toggleSidePanel: () => void
  setShowGrid: (show: boolean) => void
  setShowMinimap: (show: boolean) => void
  setViewDistance: (d: number) => void
  setZoomScale: (scale: number) => void
  setViewport: (viewport: ViewportState) => void
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
    viewport: { x: 0, y: 0, scale: 1 },

    setSidePanelTab: (tab) => set((draft) => { draft.sidePanelTab = tab }),
    setSidePanelOpen: (open) => set((draft) => { draft.sidePanelOpen = open }),
    toggleSidePanel: () => set((draft) => { draft.sidePanelOpen = !draft.sidePanelOpen }),
    setShowGrid: (show) => set((draft) => { draft.showGrid = show }),
    setShowMinimap: (show) => set((draft) => { draft.showMinimap = show }),
    setViewDistance: (d) => set((draft) => { draft.viewDistance = Math.max(1, Math.min(100, d)) }),
    setZoomScale: (scale) => set((draft) => {
      const clamped = clampZoomScale(scale)
      draft.zoomScale = clamped
      draft.viewport.scale = clamped
    }),
    setViewport: (viewport) => set((draft) => {
      const scale = Math.max(0.0625, Math.min(16, viewport.scale))
      draft.viewport = { x: viewport.x, y: viewport.y, scale }
      draft.zoomScale = scale
    }),

    zoomIn: () => {
      const { zoomScale } = get()
      set((draft) => {
        const scale = clampZoomScale(zoomScale * 1.5)
        draft.zoomScale = scale
        draft.viewport.scale = scale
      })
    },

    zoomOut: () => {
      const { zoomScale } = get()
      set((draft) => {
        const scale = clampZoomScale(zoomScale / 1.5)
        draft.zoomScale = scale
        draft.viewport.scale = scale
      })
    },

    resetZoom: () => set((draft) => {
      draft.zoomScale = 1
      draft.viewport.scale = 1
    }),

    zoomToFit: (mapBounds, containerSize) => {
      if (mapBounds.w <= 0 || mapBounds.h <= 0 || containerSize.w <= 0 || containerSize.h <= 0) return
      const scaleX = containerSize.w / (mapBounds.w * 24)
      const scaleY = containerSize.h / (mapBounds.h * 24)
      const rawScale = Math.min(scaleX, scaleY) * 0.85
      set((draft) => {
        const scale = clampZoomScale(rawScale)
        draft.zoomScale = scale
        draft.viewport.scale = scale
      })
    },
  }))
)
