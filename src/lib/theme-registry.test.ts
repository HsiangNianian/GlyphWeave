import { describe, expect, it } from 'vitest'

import { THEMES } from '@/constants/themes'
import { TILE_TYPES } from '@/constants/tiles'
import type { Theme } from '@/types'
import { customThemeForExport, normalizeTheme, resolveTheme } from './theme-registry'

const partialCustomTheme: Theme = {
  id: 'custom-dark',
  name: 'Custom Dark',
  description: 'A small custom palette.',
  colors: {
    wall: { fgColor: '#123456', bgColor: '' },
  },
}

describe('theme-registry', () => {
  it('resolves built-in themes', () => {
    expect(resolveTheme('cogmind')).toBe(THEMES.cogmind)
  })

  it('resolves custom themes before falling back to built-ins', () => {
    const customAnsi: Theme = {
      ...partialCustomTheme,
      id: 'ansi-16',
      name: 'Custom ANSI',
    }

    expect(resolveTheme('ansi-16', { 'ansi-16': customAnsi })).toBe(customAnsi)
  })

  it('normalizes custom themes and fills missing tile colors', () => {
    const normalized = normalizeTheme(partialCustomTheme)

    expect(normalized).toMatchObject({
      id: 'custom-dark',
      name: 'Custom Dark',
      description: 'A small custom palette.',
    })
    expect(Object.keys(normalized.colors).sort()).toEqual(Object.keys(TILE_TYPES).sort())
    expect(normalized.colors.wall).toEqual({
      fgColor: '#123456',
      bgColor: THEMES['ansi-16'].colors.wall.bgColor,
    })
    expect(normalized.colors.floor).toEqual(THEMES['ansi-16'].colors.floor)
  })

  it('omits built-in themes from custom export payloads', () => {
    expect(customThemeForExport('ansi-16', { 'ansi-16': partialCustomTheme })).toBeUndefined()
  })
})
