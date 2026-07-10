import type { GemapVoxel } from '@/lib/gemap'
import {
  blockNameToTileToken,
  tileTokenToBlockName,
} from '@/lib/render-surface'

export {
  blockNameToTileToken,
  tileTokenToBlockName,
} from '@/lib/render-surface'

export type VoxelSliceTiles = Record<string, string | null>
export type VoxelSlices = Record<string, VoxelSliceTiles>

const INT32_MIN = -2_147_483_648
const INT32_MAX = 2_147_483_647
const canonicalIntegerPattern = /^(?:0|-?[1-9][0-9]*)$/u

function assertI32(value: number, label: string): void {
  if (!Number.isInteger(value) || value < INT32_MIN || value > INT32_MAX) {
    throw new RangeError(`${label} must be a signed 32-bit integer`)
  }
}

function parseCoordinate(value: string, label: string): number {
  if (!canonicalIntegerPattern.test(value)) throw new Error(`invalid ${label}: ${value}`)
  const parsed = Number(value)
  assertI32(parsed, label)
  return parsed
}

export function formatVoxelSliceId(z: number): string {
  assertI32(z, 'z')
  return `z:${z}`
}

export function parseVoxelSliceId(sliceId: string): number | null {
  if (!sliceId.startsWith('z:')) return null
  try {
    return parseCoordinate(sliceId.slice(2), 'slice z')
  } catch {
    return null
  }
}

export function slicesToGemapVoxels(slices: Readonly<VoxelSlices>): GemapVoxel[] {
  const voxels: GemapVoxel[] = []
  for (const [sliceId, tiles] of Object.entries(slices)) {
    const z = parseVoxelSliceId(sliceId)
    if (z === null) throw new Error(`invalid voxel slice ID: ${sliceId}`)
    for (const [key, tileToken] of Object.entries(tiles)) {
      if (tileToken === null) continue
      const parts = key.split(',')
      if (parts.length !== 2) throw new Error(`invalid tile coordinate: ${key}`)
      const x = parseCoordinate(parts[0], 'tile x')
      const y = parseCoordinate(parts[1], 'tile y')
      const block = tileTokenToBlockName(tileToken)
      if (block !== null) voxels.push({ block, coord: [z, x, y] })
    }
  }
  return voxels.sort((left, right) => (
    left.coord[0] - right.coord[0]
    || left.coord[1] - right.coord[1]
    || left.coord[2] - right.coord[2]
    || left.block.localeCompare(right.block, 'en')
  ))
}

export function gemapVoxelsToSlices(voxels: readonly GemapVoxel[]): VoxelSlices {
  const slices: VoxelSlices = {}
  for (const voxel of voxels) {
    const [z, x, y] = voxel.coord
    assertI32(z, 'voxel z')
    assertI32(x, 'voxel x')
    assertI32(y, 'voxel y')
    const tileToken = blockNameToTileToken(voxel.block)
    if (tileToken === null) continue
    const sliceId = formatVoxelSliceId(z)
    slices[sliceId] ??= {}
    slices[sliceId][`${x},${y}`] = tileToken
  }
  return slices
}
