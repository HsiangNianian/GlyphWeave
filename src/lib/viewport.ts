export const DEFAULT_MIN_ZOOM_SCALE = 0.0625
export const DEFAULT_MAX_ZOOM_SCALE = 16

export type Point = {
  readonly x: number
  readonly y: number
}

export type Size = {
  readonly width: number
  readonly height: number
}

export type Viewport = {
  readonly x: number
  readonly y: number
  readonly scale: number
}

export type TileCoordinate = readonly [number, number]

export type VisibleRange = {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
}

export type ZoomScaleBounds = {
  readonly minScale?: number
  readonly maxScale?: number
}

function requirePositiveFinite(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number`)
  }
  return value
}

function normalizePadding(padding: number): number {
  if (!Number.isFinite(padding)) return 0
  return Math.max(0, Math.floor(padding))
}

export function clampZoomScale(
  scale: number,
  minScale = DEFAULT_MIN_ZOOM_SCALE,
  maxScale = DEFAULT_MAX_ZOOM_SCALE,
): number {
  const safeMin = Number.isFinite(minScale) ? minScale : DEFAULT_MIN_ZOOM_SCALE
  const safeMax = Number.isFinite(maxScale) ? maxScale : DEFAULT_MAX_ZOOM_SCALE
  const lower = Math.min(safeMin, safeMax)
  const upper = Math.max(safeMin, safeMax)

  if (!Number.isFinite(scale)) return lower
  return Math.min(upper, Math.max(lower, scale))
}

export function screenToWorld(screenPoint: Point, viewport: Viewport): Point {
  const scale = requirePositiveFinite(viewport.scale, 'viewport.scale')
  return {
    x: (screenPoint.x - viewport.x) / scale,
    y: (screenPoint.y - viewport.y) / scale,
  }
}

export function worldToScreen(worldPoint: Point, viewport: Viewport): Point {
  const scale = requirePositiveFinite(viewport.scale, 'viewport.scale')
  return {
    x: worldPoint.x * scale + viewport.x,
    y: worldPoint.y * scale + viewport.y,
  }
}

export function pointerToTile(
  pointer: Point,
  viewport: Viewport,
  tileSize: number,
): TileCoordinate {
  const size = requirePositiveFinite(tileSize, 'tileSize')
  const worldPoint = screenToWorld(pointer, viewport)
  return [
    Math.floor(worldPoint.x / size),
    Math.floor(worldPoint.y / size),
  ]
}

export function getVisibleRange(
  viewport: Viewport,
  screenSize: Size,
  tileSize: number,
  padding = 0,
): VisibleRange {
  const size = requirePositiveFinite(tileSize, 'tileSize')
  const paddingTiles = normalizePadding(padding)
  const topLeft = screenToWorld({ x: 0, y: 0 }, viewport)
  const bottomRight = screenToWorld(
    { x: screenSize.width, y: screenSize.height },
    viewport,
  )
  const minWorldX = Math.min(topLeft.x, bottomRight.x)
  const minWorldY = Math.min(topLeft.y, bottomRight.y)
  const maxWorldX = Math.max(topLeft.x, bottomRight.x)
  const maxWorldY = Math.max(topLeft.y, bottomRight.y)

  return {
    minX: Math.floor(minWorldX / size) - paddingTiles,
    minY: Math.floor(minWorldY / size) - paddingTiles,
    maxX: Math.ceil(maxWorldX / size) + paddingTiles,
    maxY: Math.ceil(maxWorldY / size) + paddingTiles,
  }
}

export function zoomAtPoint(
  viewport: Viewport,
  screenPoint: Point,
  nextScale: number,
  bounds: ZoomScaleBounds = {},
): Viewport {
  const worldPoint = screenToWorld(screenPoint, viewport)
  const clampedScale = clampZoomScale(
    nextScale,
    bounds.minScale,
    bounds.maxScale,
  )

  return {
    x: screenPoint.x - worldPoint.x * clampedScale,
    y: screenPoint.y - worldPoint.y * clampedScale,
    scale: clampedScale,
  }
}

export function panViewport(viewport: Viewport, delta: Point): Viewport {
  return {
    x: viewport.x + delta.x,
    y: viewport.y + delta.y,
    scale: viewport.scale,
  }
}
