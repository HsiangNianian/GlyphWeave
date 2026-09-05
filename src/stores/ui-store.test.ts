import { beforeEach, describe, expect, it } from 'vitest'

import { useUiStore } from './ui-store'

const initialState = useUiStore.getInitialState()

describe('ui-store actions', () => {
  beforeEach(() => {
    useUiStore.setState(initialState, true)
  })

  it('sets and toggles the side panel', () => {
    const store = useUiStore.getState()

    store.setSidePanelTab('layers')
    store.setSidePanelOpen(false)

    expect(useUiStore.getState()).toMatchObject({
      sidePanelTab: 'layers',
      sidePanelOpen: false,
    })

    useUiStore.getState().toggleSidePanel()
    expect(useUiStore.getState().sidePanelOpen).toBe(true)
  })

  it('sets and toggles the chat panel', () => {
    useUiStore.getState().setChatOpen(true)
    expect(useUiStore.getState().chatOpen).toBe(true)

    useUiStore.getState().toggleChat()
    expect(useUiStore.getState().chatOpen).toBe(false)
  })

  it('updates canvas visibility and surface settings', () => {
    const store = useUiStore.getState()

    store.setShowGrid(false)
    store.setShowMinimap(false)
    store.setSurfaceStyle('voxel')

    expect(useUiStore.getState()).toMatchObject({
      showGrid: false,
      showMinimap: false,
      surfaceStyle: 'voxel',
    })
  })

  it('clamps view distance to the supported range', () => {
    useUiStore.getState().setViewDistance(24)
    expect(useUiStore.getState().viewDistance).toBe(24)

    useUiStore.getState().setViewDistance(0)
    expect(useUiStore.getState().viewDistance).toBe(1)

    useUiStore.getState().setViewDistance(101)
    expect(useUiStore.getState().viewDistance).toBe(100)
  })

  it('sets and clamps zoom while keeping viewport scale synchronized', () => {
    useUiStore.getState().setZoomScale(32)
    expect(useUiStore.getState().zoomScale).toBe(16)
    expect(useUiStore.getState().viewport.scale).toBe(16)

    useUiStore.getState().setZoomScale(0)
    expect(useUiStore.getState().zoomScale).toBe(0.0625)
    expect(useUiStore.getState().viewport.scale).toBe(0.0625)
  })

  it('sets viewport coordinates and clamps its synchronized scale', () => {
    useUiStore.getState().setViewport({ x: 120, y: -45, scale: 32 })
    expect(useUiStore.getState()).toMatchObject({
      zoomScale: 16,
      viewport: { x: 120, y: -45, scale: 16 },
    })

    useUiStore.getState().setViewport({ x: -8, y: 9, scale: 0 })
    expect(useUiStore.getState()).toMatchObject({
      zoomScale: 0.0625,
      viewport: { x: -8, y: 9, scale: 0.0625 },
    })
  })

  it('zooms in and out while honoring scale limits', () => {
    useUiStore.getState().setZoomScale(4)

    useUiStore.getState().zoomIn()
    expect(useUiStore.getState().zoomScale).toBe(6)
    expect(useUiStore.getState().viewport.scale).toBe(6)

    useUiStore.getState().zoomOut()
    expect(useUiStore.getState().zoomScale).toBe(4)
    expect(useUiStore.getState().viewport.scale).toBe(4)

    useUiStore.getState().setZoomScale(16)
    useUiStore.getState().zoomIn()
    expect(useUiStore.getState().zoomScale).toBe(16)

    useUiStore.getState().setZoomScale(0.0625)
    useUiStore.getState().zoomOut()
    expect(useUiStore.getState().zoomScale).toBe(0.0625)
  })

  it('resets zoom without moving the viewport', () => {
    useUiStore.getState().setViewport({ x: 12, y: -8, scale: 4 })

    useUiStore.getState().resetZoom()

    expect(useUiStore.getState()).toMatchObject({
      zoomScale: 1,
      viewport: { x: 12, y: -8, scale: 1 },
    })
  })

  it.each([
    [{ w: 0, h: 5 }, { w: 480, h: 240 }],
    [{ w: 10, h: 0 }, { w: 480, h: 240 }],
    [{ w: 10, h: 5 }, { w: 0, h: 240 }],
    [{ w: 10, h: 5 }, { w: 480, h: 0 }],
  ])('ignores non-positive zoom-to-fit dimensions', (mapBounds, containerSize) => {
    useUiStore.getState().setViewport({ x: 5, y: 7, scale: 2 })

    useUiStore.getState().zoomToFit(mapBounds, containerSize)

    expect(useUiStore.getState()).toMatchObject({
      zoomScale: 2,
      viewport: { x: 5, y: 7, scale: 2 },
    })
  })

  it('fits zoom to valid dimensions and clamps extreme results', () => {
    useUiStore.getState().setViewport({ x: 5, y: 7, scale: 2 })

    useUiStore.getState().zoomToFit(
      { w: 10, h: 5 },
      { w: 480, h: 240 },
    )
    expect(useUiStore.getState().zoomScale).toBeCloseTo(1.7)
    expect(useUiStore.getState().viewport).toEqual({
      x: 5,
      y: 7,
      scale: useUiStore.getState().zoomScale,
    })

    useUiStore.getState().zoomToFit(
      { w: 1, h: 1 },
      { w: 100_000, h: 100_000 },
    )
    expect(useUiStore.getState().zoomScale).toBe(16)
    expect(useUiStore.getState().viewport.scale).toBe(16)

    useUiStore.getState().zoomToFit(
      { w: 100_000, h: 100_000 },
      { w: 1, h: 1 },
    )
    expect(useUiStore.getState().zoomScale).toBe(0.0625)
    expect(useUiStore.getState().viewport.scale).toBe(0.0625)
  })
})
