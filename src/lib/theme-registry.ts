import { THEMES } from '@/constants/themes'
import { TILE_TYPES } from '@/constants/tiles'
import type { Theme, TileColors } from '@/types'

export const fallbackThemeId = 'ansi-16'
export const fallbackTileColors: TileColors = { fgColor: '#ffffff', bgColor: '#000000' }

export type ThemeRegistry = Record<string, Theme>

function cloneColors(colors: Record<string, TileColors>): Record<string, TileColors> {
  const result: Record<string, TileColors> = {}
  for (const [tileId, value] of Object.entries(colors)) {
    result[tileId] = { fgColor: value.fgColor, bgColor: value.bgColor }
  }
  return result
}

export function isBuiltInTheme(themeId: string): boolean {
  return themeId in THEMES
}

export function mergeThemeColors(
  colors: Record<string, TileColors>,
  fallbackTheme: Theme = THEMES[fallbackThemeId],
): Record<string, TileColors> {
  const merged = cloneColors(fallbackTheme.colors)

  for (const tileId of Object.keys(TILE_TYPES)) {
    const next = colors[tileId]
    if (!next) continue
    merged[tileId] = {
      fgColor: next.fgColor || fallbackTheme.colors[tileId]?.fgColor || fallbackTileColors.fgColor,
      bgColor: next.bgColor || fallbackTheme.colors[tileId]?.bgColor || fallbackTileColors.bgColor,
    }
  }

  return merged
}

export function normalizeTheme(theme: Theme, fallbackTheme: Theme = THEMES[fallbackThemeId]): Theme {
  return {
    id: theme.id.trim() || 'custom-theme',
    name: theme.name.trim() || 'Custom Theme',
    description: theme.description.trim() || 'Custom GlyphWeave theme.',
    colors: mergeThemeColors(theme.colors, fallbackTheme),
  }
}

export function createThemeRegistry(customThemes: ThemeRegistry = {}): ThemeRegistry {
  const registry: ThemeRegistry = { ...THEMES }
  for (const theme of Object.values(customThemes)) {
    const normalized = normalizeTheme(theme)
    registry[normalized.id] = normalized
  }
  return registry
}

export function resolveTheme(themeId: string, customThemes: ThemeRegistry = {}): Theme {
  return customThemes[themeId] || THEMES[themeId] || THEMES[fallbackThemeId]
}

export function customThemeForExport(themeId: string, customThemes: ThemeRegistry): Theme | undefined {
  if (isBuiltInTheme(themeId)) return undefined
  const theme = customThemes[themeId]
  return theme ? normalizeTheme(theme) : undefined
}
