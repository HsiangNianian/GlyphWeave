export const GEMAP_MEDIA_TYPE: 'application/vnd.glyphweave.gemap+zip'
export const MAX_API_BODY_BYTES: number
export const MAX_LEGACY_JSON_BYTES: number

export class ApiHttpError extends Error {
  readonly status: number
  constructor(status: number, message: string)
}

export type GemapRuntime = {
  decodeGemapSlice(archive: Uint8Array, z: number): unknown
  encodeConvertedMap(map: Record<string, unknown>): Uint8Array
}

export function mediaType(contentType?: string): string
export function isGemapContentType(contentType?: string): boolean
export function requireRenderZ(query: Record<string, string | undefined>): number
export function ensureBodySize(byteLength: number, limit?: number): void
export function decodeRenderPost(
  body: Uint8Array,
  contentType: string,
  query: Record<string, string | undefined>,
  runtime: GemapRuntime,
): Record<string, unknown>
export function decodeRenderGet(dataBase64: string | undefined): Record<string, unknown>
export function bytesToBase64(bytes: Uint8Array): string
export function gemapConvertResponse(
  converted: {
    format: string
    map: Record<string, unknown>
    theme: unknown
    themeId: string
  },
  runtime: GemapRuntime,
  renderSvg: (map: Record<string, unknown>, options: Record<string, unknown>) => string,
): { body: Uint8Array; contentType: string }
