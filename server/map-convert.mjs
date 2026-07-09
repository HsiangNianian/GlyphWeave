import { createCanvas, loadImage } from '@napi-rs/canvas'
import { THEMES, TILE_TYPES, ASCII_GLYPHS, TILE_SIZE } from './map-shared.mjs'

const DEFAULT_WIDTH = 160
const MAX_DIMENSION = 512
const MAX_CELLS = 512 * 256
const DEFAULT_ALPHA_THRESHOLD = 16

const IMAGE_CONTENT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
])

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringValue(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function integerValue(value) {
  if (typeof value === 'number' && Number.isInteger(value)) return value
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : undefined
}

function numberValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseJsonField(value) {
  if (isRecord(value)) return value
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed.startsWith('{')) return undefined
  const parsed = JSON.parse(trimmed)
  if (!isRecord(parsed)) throw new Error('theme must be a JSON object')
  return parsed
}

function parseDataUrl(value) {
  const match = /^data:[^;]+;base64,(.+)$/i.exec(value)
  return match ? match[1] : value
}

function parseBoundary(contentType) {
  const match = /(?:^|;)\s*boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType)
  return match?.[1] || match?.[2]
}

function parsePartHeaders(headerText) {
  const headers = {}
  for (const line of headerText.split('\r\n')) {
    const index = line.indexOf(':')
    if (index === -1) continue
    headers[line.slice(0, index).toLowerCase()] = line.slice(index + 1).trim()
  }
  return headers
}

function parseContentDisposition(value = '') {
  const params = {}
  for (const part of value.split(';').slice(1)) {
    const index = part.indexOf('=')
    if (index === -1) continue
    const key = part.slice(0, index).trim()
    const rawValue = part.slice(index + 1).trim()
    params[key] = rawValue.replace(/^"|"$/g, '')
  }
  return params
}

function parseMultipart(buffer, contentType) {
  const boundary = parseBoundary(contentType)
  if (!boundary) throw new Error('Missing multipart boundary')

  const delimiter = Buffer.from(`--${boundary}`)
  const headerDelimiter = Buffer.from('\r\n\r\n')
  const fields = {}
  let imageBuffer = null
  let position = buffer.indexOf(delimiter)

  while (position !== -1) {
    position += delimiter.length

    if (buffer.subarray(position, position + 2).toString('utf8') === '--') break
    if (buffer.subarray(position, position + 2).toString('utf8') === '\r\n') position += 2

    const next = buffer.indexOf(delimiter, position)
    if (next === -1) break

    let part = buffer.subarray(position, next)
    if (part.length >= 2 && part.subarray(part.length - 2).toString('utf8') === '\r\n') {
      part = part.subarray(0, part.length - 2)
    }

    const headerEnd = part.indexOf(headerDelimiter)
    if (headerEnd !== -1) {
      const headers = parsePartHeaders(part.subarray(0, headerEnd).toString('utf8'))
      const content = part.subarray(headerEnd + headerDelimiter.length)
      const disposition = parseContentDisposition(headers['content-disposition'])
      const name = disposition.name
      if (name) {
        if (name === 'image' || name === 'file') {
          imageBuffer = Buffer.from(content)
        } else {
          fields[name] = content.toString('utf8')
        }
      }
    }

    position = next
  }

  if (!imageBuffer) throw new Error('Missing image file')
  return { imageBuffer, fields }
}

function parseJsonRequest(buffer) {
  const parsed = JSON.parse(buffer.toString('utf8'))
  if (!isRecord(parsed)) throw new Error('Request body must be a JSON object')

  const imageValue = stringValue(parsed.imageBase64) || stringValue(parsed.image)
  if (!imageValue) throw new Error('Missing imageBase64')

  return {
    imageBuffer: Buffer.from(parseDataUrl(imageValue), 'base64'),
    fields: parsed,
  }
}

function parseImageRequest(buffer) {
  return { imageBuffer: buffer, fields: {} }
}

export function parseConvertRequest(contentType, buffer, query = {}) {
  const mediaType = contentType.split(';', 1)[0].trim().toLowerCase()
  let parsed

  if (mediaType === 'multipart/form-data') {
    parsed = parseMultipart(buffer, contentType)
  } else if (mediaType === 'application/json') {
    parsed = parseJsonRequest(buffer)
  } else if (IMAGE_CONTENT_TYPES.has(mediaType)) {
    parsed = parseImageRequest(buffer)
  } else {
    throw new Error('Unsupported content type for convert API')
  }

  return {
    imageBuffer: parsed.imageBuffer,
    options: { ...parsed.fields, ...query },
  }
}

function normalizeFormat(value) {
  const format = stringValue(value) || 'svg'
  if (format === 'svg' || format === 'png' || format === 'gemap' || format === 'both') return format
  throw new Error(`Unsupported convert format: ${format}`)
}

function normalizeTheme(options) {
  const customTheme = parseJsonField(options.theme)
  const themeAlias = typeof options.theme === 'string' && !options.theme.trim().startsWith('{')
    ? stringValue(options.theme)
    : undefined
  const themeId = stringValue(options.themeId)
    || stringValue(customTheme?.id)
    || themeAlias

  if (!customTheme && !themeId) {
    throw new Error('Missing required theme or themeId')
  }

  if (customTheme) {
    if (!isRecord(customTheme.colors)) throw new Error('theme.colors must be an object')
    return {
      id: themeId || 'custom',
      theme: { ...customTheme, colors: { ...customTheme.colors } },
      includeThemeInMap: true,
    }
  }

  const theme = THEMES[themeId]
  if (!theme) throw new Error(`Unknown theme: ${themeId}`)
  return {
    id: themeId,
    theme,
    includeThemeInMap: false,
  }
}

function normalizeDimension(value, name) {
  const parsed = integerValue(value)
  if (parsed === undefined) return undefined
  if (parsed < 1 || parsed > MAX_DIMENSION) {
    throw new Error(`${name} must be between 1 and ${MAX_DIMENSION}`)
  }
  return parsed
}

function normalizeAlphaThreshold(value) {
  const parsed = numberValue(value)
  if (parsed === undefined) return DEFAULT_ALPHA_THRESHOLD
  if (parsed < 0 || parsed > 255) throw new Error('alphaThreshold must be between 0 and 255')
  return parsed
}

function fitDimensions(sourceWidth, sourceHeight, options) {
  const requestedWidth = normalizeDimension(options.width, 'width')
  const requestedHeight = normalizeDimension(options.height, 'height')

  let width = requestedWidth
  let height = requestedHeight

  if (!width && !height) {
    width = DEFAULT_WIDTH
    height = Math.max(1, Math.round(width * sourceHeight / sourceWidth))
  } else if (width && !height) {
    height = Math.max(1, Math.round(width * sourceHeight / sourceWidth))
  } else if (!width && height) {
    width = Math.max(1, Math.round(height * sourceWidth / sourceHeight))
  }

  if (!width || !height) throw new Error('Could not determine output dimensions')
  if (width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_CELLS) {
    throw new Error(`output dimensions must be at most ${MAX_DIMENSION}px per side and ${MAX_CELLS} cells total`)
  }

  return { width, height }
}

function parseHexColor(value) {
  const hex = stringValue(value)
  if (!hex) return null

  const normalized = hex.startsWith('#') ? hex.slice(1) : hex
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

function glyphWeight(tileId) {
  const char = ASCII_GLYPHS[tileId]
  if (!char || char === ' ') return 0
  if (char === '.' || char === ',' || char === "'" || char === ';') return 0.18
  if (char === '#' || char === '█') return 0.42
  return 0.32
}

function mixColor(bg, fg, weight) {
  return [
    Math.round(bg[0] * (1 - weight) + fg[0] * weight),
    Math.round(bg[1] * (1 - weight) + fg[1] * weight),
    Math.round(bg[2] * (1 - weight) + fg[2] * weight),
  ]
}

function buildPalette(theme) {
  const palette = []

  for (const tileId of Object.keys(TILE_TYPES)) {
    const colors = theme.colors?.[tileId]
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

function colorDistance(a, b) {
  const dr = a[0] - b[0]
  const dg = a[1] - b[1]
  const db = a[2] - b[2]

  return dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11
}

function nearestTileId(color, palette) {
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

function tileSourceToCanvas(image, width, height) {
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.clearRect(0, 0, width, height)
  ctx.drawImage(image, 0, 0, width, height)
  return ctx.getImageData(0, 0, width, height).data
}

export async function convertImageToMap(imageBuffer, options = {}) {
  const { id: themeId, theme, includeThemeInMap } = normalizeTheme(options)
  const format = normalizeFormat(options.format)
  const image = await loadImage(imageBuffer)
  const { width, height } = fitDimensions(image.width, image.height, options)
  const alphaThreshold = normalizeAlphaThreshold(options.alphaThreshold)
  const palette = buildPalette(theme)
  const pixels = tileSourceToCanvas(image, width, height)
  const tiles = {}

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4
      const alpha = pixels[offset + 3]
      if (alpha <= alphaThreshold) continue

      const alphaRatio = alpha / 255
      const color = [
        Math.round(pixels[offset] * alphaRatio),
        Math.round(pixels[offset + 1] * alphaRatio),
        Math.round(pixels[offset + 2] * alphaRatio),
      ]
      const tileId = nearestTileId(color, palette)
      if (tileId !== 'void') tiles[`${x},${y}`] = tileId
    }
  }

  const map = {
    version: 2,
    worldName: stringValue(options.worldName) || 'converted-image',
    tileSize: TILE_SIZE,
    themeId,
    tiles,
    conversion: {
      sourceWidth: image.width,
      sourceHeight: image.height,
      width,
      height,
      strategy: 'theme-nearest',
    },
  }

  if (includeThemeInMap) {
    map.theme = theme
  }

  return { map, themeId, theme, format }
}
