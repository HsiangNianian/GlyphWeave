import { TILE_TYPES } from '@/constants/tiles'
import { THEMES } from '@/constants/themes'
import { normalizeTheme } from '@/lib/theme-registry'
import type { Theme } from '@/types'

export const DEFAULT_IMAGE_CONVERT_WIDTH = 240

const TILE_SIZE = 24
const MAX_DIMENSION = 512
const MAX_CELLS = 512 * 256
const DEFAULT_ALPHA_THRESHOLD = 16

type RGB = readonly [number, number, number]

type PaletteEntry = {
  tileId: string
  color: RGB
}

type LoadedImage = {
  image: CanvasImageSource
  width: number
  height: number
  release: () => void
}

export type ImageConvertOptions = {
  themeId: string
  theme?: Theme
  worldName?: string
  width?: number
  height?: number
  alphaThreshold?: number
}

export type ConvertedImageMap = {
  version: 2
  worldName: string
  tileSize: number
  themeId: string
  tiles: Record<string, string>
  conversion: {
    sourceWidth: number
    sourceHeight: number
    width: number
    height: number
    strategy: 'theme-nearest'
  }
}

function normalizeDimension(value: number | undefined, name: string): number | undefined {
  if (value === undefined) return undefined
  if (!Number.isInteger(value) || value < 1 || value > MAX_DIMENSION) {
    throw new Error(`${name} must be an integer between 1 and ${MAX_DIMENSION}`)
  }
  return value
}

function normalizeAlphaThreshold(value: number | undefined): number {
  if (value === undefined) return DEFAULT_ALPHA_THRESHOLD
  if (!Number.isFinite(value) || value < 0 || value > 255) {
    throw new Error('alphaThreshold must be between 0 and 255')
  }
  return value
}

export function fitImageConvertDimensions(
  sourceWidth: number,
  sourceHeight: number,
  options: Pick<ImageConvertOptions, 'width' | 'height'> = {},
): { width: number; height: number } {
  if (sourceWidth < 1 || sourceHeight < 1) {
    throw new Error('image has invalid dimensions')
  }

  const requestedWidth = normalizeDimension(options.width, 'width')
  const requestedHeight = normalizeDimension(options.height, 'height')

  let width = requestedWidth
  let height = requestedHeight

  if (!width && !height) {
    width = DEFAULT_IMAGE_CONVERT_WIDTH
    height = Math.max(1, Math.round(width * sourceHeight / sourceWidth))
  } else if (width && !height) {
    height = Math.max(1, Math.round(width * sourceHeight / sourceWidth))
  } else if (!width && height) {
    width = Math.max(1, Math.round(height * sourceWidth / sourceHeight))
  }

  if (!width || !height) throw new Error('could not determine output dimensions')
  if (width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_CELLS) {
    throw new Error(`output dimensions must be at most ${MAX_DIMENSION}px per side and ${MAX_CELLS} cells total`)
  }

  return { width, height }
}

function parseHexColor(value: string | undefined): RGB | null {
  if (!value) return null

  const normalized = value.startsWith('#') ? value.slice(1) : value
  if (/^[0-9a-f]{3}$/i.test(normalized)) {
    return [
      parseInt(normalized[0] + normalized[0], 16),
      parseInt(normalized[1] + normalized[1], 16),
      parseInt(normalized[2] + normalized[2], 16),
    ]
  }
  if (/^[0-9a-f]{6}$/i.test(normalized)) {
    return [
      parseInt(normalized.slice(0, 2), 16),
      parseInt(normalized.slice(2, 4), 16),
      parseInt(normalized.slice(4, 6), 16),
    ]
  }

  return null
}

function glyphWeight(tileId: string): number {
  const char = TILE_TYPES[tileId]?.char
  if (!char || char === ' ') return 0
  if (char === '.' || char === ',' || char === "'" || char === ';') return 0.18
  if (char === '#' || char === '█') return 0.42
  return 0.32
}

function mixColor(bg: RGB, fg: RGB, weight: number): RGB {
  return [
    Math.round(bg[0] * (1 - weight) + fg[0] * weight),
    Math.round(bg[1] * (1 - weight) + fg[1] * weight),
    Math.round(bg[2] * (1 - weight) + fg[2] * weight),
  ]
}

function buildPalette(theme: Theme): PaletteEntry[] {
  const palette: PaletteEntry[] = []

  for (const tileId of Object.keys(TILE_TYPES)) {
    const colors = theme.colors[tileId]
    if (!colors) continue

    const bg = parseHexColor(colors.bgColor)
    const fg = parseHexColor(colors.fgColor)
    if (!bg || !fg) continue

    palette.push({
      tileId,
      color: mixColor(bg, fg, glyphWeight(tileId)),
    })
  }

  if (palette.length === 0) throw new Error('theme does not define usable tile colors')
  return palette
}

function colorDistance(a: RGB, b: RGB): number {
  const dr = a[0] - b[0]
  const dg = a[1] - b[1]
  const db = a[2] - b[2]

  return dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11
}

function nearestTileId(color: RGB, palette: PaletteEntry[]): string {
  let best = palette[0]
  let bestDistance = Infinity

  for (const candidate of palette) {
    const distance = colorDistance(color, candidate.color)
    if (distance < bestDistance) {
      best = candidate
      bestDistance = distance
    }
  }

  return best.tileId
}

async function loadImage(file: File): Promise<LoadedImage> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file)
    return {
      image: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      release: () => bitmap.close(),
    }
  }

  const url = URL.createObjectURL(file)
  return await new Promise<LoadedImage>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({
      image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    })
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('failed to decode image'))
    }
    image.src = url
  })
}

function imageToPixels(loaded: LoadedImage, width: number, height: number): Uint8ClampedArray {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('canvas 2D context is unavailable')

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.clearRect(0, 0, width, height)
  ctx.drawImage(loaded.image, 0, 0, width, height)
  return ctx.getImageData(0, 0, width, height).data
}

export async function convertImageFileToMap(
  file: File,
  options: ImageConvertOptions,
): Promise<ConvertedImageMap> {
  const theme = options.theme ? normalizeTheme(options.theme) : THEMES[options.themeId]
  if (!theme) throw new Error(`Unknown theme: ${options.themeId}`)

  const loaded = await loadImage(file)

  try {
    const { width, height } = fitImageConvertDimensions(loaded.width, loaded.height, options)
    const alphaThreshold = normalizeAlphaThreshold(options.alphaThreshold)
    const palette = buildPalette(theme)
    const pixels = imageToPixels(loaded, width, height)
    const tiles: Record<string, string> = {}

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4
        const alpha = pixels[offset + 3]
        if (alpha <= alphaThreshold) continue

        const alphaRatio = alpha / 255
        const color: RGB = [
          Math.round(pixels[offset] * alphaRatio),
          Math.round(pixels[offset + 1] * alphaRatio),
          Math.round(pixels[offset + 2] * alphaRatio),
        ]
        const tileId = nearestTileId(color, palette)
        if (tileId !== 'void') tiles[`${x},${y}`] = tileId
      }
    }

    return {
      version: 2,
      worldName: options.worldName?.trim() || 'converted-image',
      tileSize: TILE_SIZE,
      themeId: options.themeId,
      tiles,
      conversion: {
        sourceWidth: loaded.width,
        sourceHeight: loaded.height,
        width,
        height,
        strategy: 'theme-nearest',
      },
    }
  } finally {
    loaded.release()
  }
}
