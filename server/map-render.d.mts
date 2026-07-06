export type RenderOptions = {
  themeId?: string
  padding?: number
  scale?: number
  theme?: unknown
}

export function renderMap(
  data: unknown,
  options?: RenderOptions,
): Buffer
