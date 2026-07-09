import { describe, expect, it } from 'vitest'

import {
  DEFAULT_MAX_ZOOM_SCALE,
  DEFAULT_MIN_ZOOM_SCALE,
  clampZoomScale,
  getVisibleRange,
  panViewport,
  pointerToTile,
  screenToWorld,
  worldToScreen,
  zoomAtPoint,
  type Point,
} from './viewport.ts'

function expectPointNearlyEqual(actual: Point, expected: Point): void {
  expect(actual.x).toBeCloseTo(expected.x, 9)
  expect(actual.y).toBeCloseTo(expected.y, 9)
}

describe('viewport', () => {
  it('clamps zoom scale to the shared zoom limits', () => {
    expect(clampZoomScale(0.001)).toBe(DEFAULT_MIN_ZOOM_SCALE)
    expect(clampZoomScale(100)).toBe(DEFAULT_MAX_ZOOM_SCALE)
    expect(clampZoomScale(2)).toBe(2)
  })

  it('round-trips screen and world points after pan and zoom', () => {
    const viewport = { x: 96, y: -48, scale: 2.5 }
    const screenPoint = { x: 321, y: 177 }
    const worldPoint = screenToWorld(screenPoint, viewport)

    expectPointNearlyEqual(worldToScreen(worldPoint, viewport), screenPoint)
  })

  it('accounts for pan and zoom before flooring tile coordinates', () => {
    const viewport = panViewport({ x: 0, y: 0, scale: 2 }, { x: 40, y: -20 })
    const pointer = { x: 72, y: 12 }

    expect(pointerToTile(pointer, viewport, 16)).toEqual([1, 1])
  })

  it('keeps the world point under the cursor stable while zooming', () => {
    const viewport = { x: -120, y: 80, scale: 0.75 }
    const pointer = { x: 320, y: 240 }
    const before = screenToWorld(pointer, viewport)
    const zoomed = zoomAtPoint(viewport, pointer, 1.5)

    expect(zoomed.scale).toBe(1.5)
    expectPointNearlyEqual(screenToWorld(pointer, zoomed), before)
  })

  it('expands the visible tile range by padding', () => {
    const range = getVisibleRange(
      { x: -32, y: -64, scale: 2 },
      { width: 64, height: 96 },
      16,
      2,
    )

    expect(range).toEqual({
      minX: -1,
      minY: 0,
      maxX: 5,
      maxY: 7,
    })
  })
})
