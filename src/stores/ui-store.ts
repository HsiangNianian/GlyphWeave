import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

export interface UiStore {
  sidePanelTab: string
  sidePanelOpen: boolean
  showGrid: boolean
  showMinimap: boolean
  viewDistance: number

  setSidePanelTab: (tab: string) => void
  setSidePanelOpen: (open: boolean) => void
  toggleSidePanel: () => void
  setShowGrid: (show: boolean) => void
  setShowMinimap: (show: boolean) => void
  setViewDistance: (d: number) => void
}

export const useUiStore = create<UiStore>()(
  immer((set) => ({
    sidePanelTab: 'tiles',
    sidePanelOpen: true,
    showGrid: true,
    showMinimap: true,
    viewDistance: 5,

    setSidePanelTab: (tab) => set((draft) => { draft.sidePanelTab = tab }),
    setSidePanelOpen: (open) => set((draft) => { draft.sidePanelOpen = open }),
    toggleSidePanel: () => set((draft) => { draft.sidePanelOpen = !draft.sidePanelOpen }),
    setShowGrid: (show) => set((draft) => { draft.showGrid = show }),
    setShowMinimap: (show) => set((draft) => { draft.showMinimap = show }),
    setViewDistance: (d) => set((draft) => { draft.viewDistance = Math.max(1, Math.min(100, d)) }),
  }))
)
