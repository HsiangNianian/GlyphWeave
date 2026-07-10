'use client'
import { memo } from 'react'
import { Rect, Text } from 'react-konva'
import { ASCII_GLYPHS } from '@/constants/ascii-glyphs'
import type { TileColors } from '@/types'

type TileCellProps = {
  x: number
  y: number
  tileTypeId: string | null
  tileSize: number
  colors: TileColors
  renderMode?: 'glyph' | 'pixel'
}

type PixelRect = {
  key: string
  px: number
  py: number
  w: number
  h: number
  color: string
}

function TileCellInner({ x, y, tileTypeId, tileSize, colors, renderMode = 'glyph' }: TileCellProps) {
  const char = tileTypeId ? ASCII_GLYPHS[tileTypeId] ?? '' : ''
  const originX = x * tileSize
  const originY = y * tileSize
  const scale = tileSize / 24

  if (renderMode === 'pixel' && tileTypeId) {
    const rects = pixelRectsForTile(tileTypeId, colors)
    return (
      <>
        <Rect
          x={originX}
          y={originY}
          width={tileSize}
          height={tileSize}
          fill={colors?.bgColor || '#000000'}
          listening={false}
        />
        {rects.map((rect) => (
          <Rect
            key={rect.key}
            x={originX + rect.px * scale}
            y={originY + rect.py * scale}
            width={Math.max(1, rect.w * scale)}
            height={Math.max(1, rect.h * scale)}
            fill={rect.color}
            listening={false}
          />
        ))}
      </>
    )
  }

  return (
    <>
      <Rect
        x={originX}
        y={originY}
        width={tileSize}
        height={tileSize}
        fill={colors?.bgColor || '#000000'}
        listening={false}
      />
      {char && (
        <Text
          x={originX}
          y={originY}
          width={tileSize}
          height={tileSize}
          text={char}
          fontSize={Math.round(tileSize * 0.75)}
          fill={colors?.fgColor || '#ffffff'}
          align="center"
          verticalAlign="middle"
          fontFamily="'JetBrains Mono', 'Fira Code', 'Courier New', monospace"
          listening={false}
        />
      )}
    </>
  )
}

function pixelRectsForTile(tileTypeId: string, colors: TileColors): PixelRect[] {
  const fg = colors?.fgColor || '#ffffff'
  const bg = colors?.bgColor || '#000000'
  const dark = mixHex(bg, '#000000', 0.35)
  const light = mixHex(fg, '#ffffff', 0.2)
  const warm = mixHex(fg, '#f0c27a', 0.35)

  switch (tileTypeId) {
    case 'wall':
      return [
        r('top', 1, 2, 22, 4, mixHex(fg, bg, 0.35)),
        r('left', 2, 8, 8, 5, mixHex(fg, bg, 0.2)),
        r('right', 12, 8, 10, 5, mixHex(fg, bg, 0.28)),
        r('low', 4, 15, 17, 5, mixHex(fg, bg, 0.18)),
        r('crack', 11, 4, 2, 16, dark),
      ]
    case 'floor':
      return [r('a', 4, 6, 4, 3, fg), r('b', 13, 9, 5, 2, mixHex(fg, bg, 0.5)), r('c', 7, 16, 8, 2, dark)]
    case 'floorAlt':
      return [r('a', 2, 4, 8, 3, dark), r('b', 12, 12, 9, 3, fg), r('c', 5, 18, 4, 2, mixHex(fg, bg, 0.45))]
    case 'door':
      return [r('plank1', 5, 3, 5, 18, fg), r('plank2', 11, 3, 5, 18, warm), r('plank3', 17, 3, 3, 18, mixHex(fg, bg, 0.35)), r('knob', 16, 11, 3, 3, '#e6c45a')]
    case 'doorOpen':
      return [r('shadow', 4, 3, 10, 18, dark), r('edge', 15, 3, 4, 18, fg)]
    case 'water':
      return [r('w1', 2, 6, 8, 2, light), r('w2', 10, 11, 11, 2, fg), r('w3', 4, 17, 9, 2, mixHex(fg, bg, 0.4))]
    case 'deepWater':
      return [r('w1', 3, 7, 7, 2, fg), r('w2', 12, 15, 8, 2, mixHex(fg, bg, 0.35))]
    case 'lava':
      return [r('l1', 2, 7, 9, 3, '#ffcf5c'), r('l2', 9, 12, 13, 3, '#ff6d2d'), r('l3', 5, 17, 6, 2, '#ffd27a')]
    case 'tree':
      return [r('trunk', 10, 11, 4, 10, '#6b4529'), r('leaf1', 5, 4, 14, 9, fg), r('leaf2', 3, 8, 18, 7, mixHex(fg, bg, 0.2))]
    case 'grass':
      return [r('g1', 4, 8, 2, 8, fg), r('g2', 10, 6, 2, 11, light), r('g3', 17, 9, 2, 7, mixHex(fg, bg, 0.25))]
    case 'bridge':
      return [r('p1', 2, 5, 20, 4, fg), r('p2', 2, 11, 20, 4, warm), r('p3', 2, 17, 20, 3, mixHex(fg, bg, 0.4)), r('gap', 10, 4, 2, 17, dark)]
    case 'stairsDown':
      return [r('s1', 6, 6, 13, 3, fg), r('s2', 8, 11, 10, 3, mixHex(fg, bg, 0.4)), r('s3', 10, 16, 7, 3, dark)]
    case 'stairsUp':
      return [r('s1', 10, 5, 7, 3, light), r('s2', 8, 10, 10, 3, fg), r('s3', 6, 15, 13, 3, mixHex(fg, bg, 0.35))]
    case 'altar':
      return [r('base', 5, 12, 14, 6, fg), r('top', 7, 8, 10, 4, light), r('mark', 11, 5, 2, 4, '#d6c6ff')]
    case 'fountain':
      return [r('bowl', 5, 13, 14, 5, fg), r('water', 8, 8, 8, 6, '#7fd4e8'), r('stem', 11, 5, 2, 5, light)]
    case 'grave':
      return [r('stone', 8, 5, 8, 13, fg), r('cap', 9, 3, 6, 3, light), r('mark', 11, 7, 2, 7, dark)]
    case 'trap':
      return [r('base', 5, 15, 14, 2, fg), r('spike1', 7, 9, 3, 6, '#d45b4f'), r('spike2', 14, 8, 3, 7, '#d45b4f')]
    case 'pillar':
      return [r('top', 6, 3, 12, 4, light), r('body', 8, 7, 8, 12, fg), r('base', 5, 19, 14, 3, dark)]
    case 'treasure':
      return [r('chest', 5, 10, 14, 8, '#8f4e24'), r('lid', 6, 7, 12, 4, '#d59d3a'), r('gold', 10, 11, 4, 3, '#ffe07a')]
    case 'shop':
      return [r('counter', 4, 13, 16, 5, warm), r('awning', 4, 6, 16, 5, '#cf6d4a'), r('sign', 9, 3, 6, 3, '#f0c85a')]
    case 'table':
      return [r('top', 4, 8, 16, 7, fg), r('leg1', 6, 15, 3, 5, dark), r('leg2', 16, 15, 3, 5, dark)]
    case 'throne':
      return [r('back', 7, 4, 10, 11, '#b89239'), r('seat', 5, 14, 14, 5, fg), r('gem', 11, 7, 2, 3, '#d65dff')]
    case 'cage':
      return [r('top', 4, 4, 16, 2, fg), r('bottom', 4, 18, 16, 2, fg), r('bar1', 6, 5, 2, 14, fg), r('bar2', 12, 5, 2, 14, fg), r('bar3', 18, 5, 2, 14, fg)]
    case 'blood':
      return [r('b1', 6, 9, 7, 5, fg), r('b2', 13, 12, 5, 4, mixHex(fg, '#000000', 0.15)), r('b3', 9, 17, 3, 2, fg)]
    case 'bar':
      return [r('rail1', 5, 3, 2, 18, fg), r('rail2', 11, 3, 2, 18, mixHex(fg, bg, 0.3)), r('rail3', 17, 3, 2, 18, fg), r('cross', 4, 11, 16, 2, dark)]
    default:
      return [r('mark', 7, 7, 10, 10, fg)]
  }
}

function r(key: string, px: number, py: number, w: number, h: number, color: string): PixelRect {
  return { key, px, py, w, h, color }
}

function mixHex(a: string, b: string, t: number): string {
  const ca = parseHex(a)
  const cb = parseHex(b)
  const mix = (i: number) => Math.round(ca[i] * (1 - t) + cb[i] * t)
  return `rgb(${mix(0)}, ${mix(1)}, ${mix(2)})`
}

function parseHex(value: string): [number, number, number] {
  const raw = value.startsWith('#') ? value.slice(1) : value
  const safe = raw.length === 6 ? raw : 'ffffff'
  return [
    Number.parseInt(safe.slice(0, 2), 16),
    Number.parseInt(safe.slice(2, 4), 16),
    Number.parseInt(safe.slice(4, 6), 16),
  ]
}

export const TileCell = memo(TileCellInner)
