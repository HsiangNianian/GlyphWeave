'use client'
import { memo } from 'react'
import { Rect, Text } from 'react-konva'
import { ASCII_GLYPHS } from '@/constants/ascii-glyphs'
import type { TileColors } from '@/types'

interface TileCellProps {
  x: number
  y: number
  tileTypeId: string | null
  tileSize: number
  colors: TileColors
}

function TileCellInner({ x, y, tileTypeId, tileSize, colors }: TileCellProps) {
  const char = tileTypeId ? ASCII_GLYPHS[tileTypeId] ?? '' : ''
  return (
    <>
      <Rect
        x={x * tileSize}
        y={y * tileSize}
        width={tileSize}
        height={tileSize}
        fill={colors?.bgColor || '#000000'}
      />
      {char && (
        <Text
          x={x * tileSize}
          y={y * tileSize}
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

export const TileCell = memo(TileCellInner)
