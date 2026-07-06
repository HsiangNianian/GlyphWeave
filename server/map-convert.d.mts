export type ConvertFormat = 'svg' | 'png' | 'gemap' | 'both'

export type ConvertRequest = {
  imageBuffer: Buffer
  options: Record<string, unknown>
}

export type ConvertedMap = {
  map: Record<string, unknown>
  themeId: string
  theme: unknown
  format: ConvertFormat
}

export function parseConvertRequest(
  contentType: string,
  buffer: Buffer,
  query?: Record<string, unknown>,
): ConvertRequest

export function convertImageToMap(
  imageBuffer: Buffer,
  options?: Record<string, unknown>,
): Promise<ConvertedMap>
