/** Shared HTTP-level `.gemap` behavior for Node, Vite, and Workers. */

export const GEMAP_MEDIA_TYPE = 'application/vnd.glyphweave.gemap+zip'
export const MAX_API_BODY_BYTES = 16 * 1024 * 1024
export const MAX_LEGACY_JSON_BYTES = 2 * 1024 * 1024

const utf8Decoder = new TextDecoder('utf-8', { fatal: true })
const utf8Encoder = new TextEncoder()

export class ApiHttpError extends Error {
  constructor(status, message) {
    super(message)
    this.name = 'ApiHttpError'
    this.status = status
  }
}

export function mediaType(contentType = '') {
  return contentType.split(';', 1)[0].trim().toLowerCase()
}

export function isGemapContentType(contentType = '') {
  const type = mediaType(contentType)
  return type === GEMAP_MEDIA_TYPE || type === 'application/zip'
}

export function requireRenderZ(query) {
  const raw = query.z
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new ApiHttpError(400, 'Missing required "z" query parameter for .gemap v3')
  }
  if (!/^-?\d+$/u.test(raw.trim())) {
    throw new ApiHttpError(400, 'z must be a signed 32-bit integer')
  }
  const z = Number(raw)
  if (!Number.isInteger(z) || z < -2_147_483_648 || z > 2_147_483_647) {
    throw new ApiHttpError(400, 'z must be a signed 32-bit integer')
  }
  return z
}

export function ensureBodySize(byteLength, limit = MAX_API_BODY_BYTES) {
  if (!Number.isSafeInteger(byteLength) || byteLength < 0 || byteLength > limit) {
    throw new ApiHttpError(413, `Request body exceeds ${limit} bytes`)
  }
}

function parseLegacyJson(bytes) {
  ensureBodySize(bytes.byteLength, MAX_LEGACY_JSON_BYTES)
  let source
  try {
    source = utf8Decoder.decode(bytes)
  } catch {
    throw new ApiHttpError(400, 'Legacy JSON body is not valid UTF-8')
  }
  let parsed
  try {
    parsed = JSON.parse(source)
  } catch {
    throw new ApiHttpError(400, 'Legacy JSON body is not valid JSON')
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ApiHttpError(400, 'Request body must be a JSON object')
  }
  return parsed
}

export function decodeRenderPost(body, contentType, query, runtime) {
  ensureBodySize(body.byteLength)
  if (isGemapContentType(contentType)) {
    const z = requireRenderZ(query)
    return runtime.decodeGemapSlice(body, z)
  }
  const type = mediaType(contentType)
  if (type !== '' && type !== 'application/json') {
    throw new ApiHttpError(415, `Unsupported render content type: ${type}`)
  }
  return parseLegacyJson(body)
}

export function decodeRenderGet(dataBase64) {
  if (typeof dataBase64 !== 'string' || dataBase64.length === 0) {
    throw new ApiHttpError(400, 'Missing "data" parameter')
  }
  if (dataBase64.length > Math.ceil(MAX_LEGACY_JSON_BYTES / 3) * 4 + 4) {
    throw new ApiHttpError(413, `Legacy JSON exceeds ${MAX_LEGACY_JSON_BYTES} bytes`)
  }
  let binary
  try {
    binary = atob(dataBase64)
  } catch {
    throw new ApiHttpError(400, 'data must be valid base64-encoded legacy JSON')
  }
  ensureBodySize(binary.length, MAX_LEGACY_JSON_BYTES)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return parseLegacyJson(bytes)
}

export function bytesToBase64(bytes) {
  let output = ''
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index]
    const second = index + 1 < bytes.length ? bytes[index + 1] : 0
    const third = index + 2 < bytes.length ? bytes[index + 2] : 0
    const value = (first << 16) | (second << 8) | third
    output += alphabet[(value >>> 18) & 63]
    output += alphabet[(value >>> 12) & 63]
    output += index + 1 < bytes.length ? alphabet[(value >>> 6) & 63] : '='
    output += index + 2 < bytes.length ? alphabet[value & 63] : '='
  }
  return output
}

export function gemapConvertResponse(converted, runtime, renderSvg) {
  const archive = runtime.encodeConvertedMap(converted.map)
  if (converted.format === 'gemap') {
    return { body: archive, contentType: GEMAP_MEDIA_TYPE }
  }
  if (converted.format !== 'both') {
    throw new TypeError('gemapConvertResponse only accepts gemap or both')
  }
  const svg = renderSvg(converted.map, {
    themeId: converted.themeId,
    theme: converted.theme,
  })
  const bundle = {
    format: 'glyphweave-convert-bundle',
    version: 1,
    gemap: {
      data: bytesToBase64(archive),
      encoding: 'base64',
      mediaType: GEMAP_MEDIA_TYPE,
    },
    svg,
  }
  return {
    body: utf8Encoder.encode(`${JSON.stringify(bundle, null, 2)}\n`),
    contentType: 'application/json',
  }
}
