import { GEMAP_CHUNK_VOLUME } from './bitpack'
import { canonicalizeChunk } from './canonical'
import { gemapFail } from './errors'
import type {
  GemapChunkRecord,
  GemapDocument,
  GemapManifest,
  GemapRegion,
  GemapRegionDocument,
  GemapVoxel,
} from './types'
import { isValidBlockName, localVoxelIndex, validateGemapDocument } from './validation'

const INT32_MIN = -2_147_483_648
const INT32_MAX = 2_147_483_647

export type SplitVoxelCoordinate = {
  local: [lz: number, lx: number, ly: number]
  localIndex: number
  region: [rx: number, ry: number]
  regionKey: string
  section: [cz: number, rcx: number, rcy: number]
  sectionKey: string
}

type NormalizedVoxel = {
  block: string
  coord: [number, number, number]
}

function floorMod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor
}

export function splitVoxelCoordinate(
  coord: readonly [z: number, x: number, y: number],
): SplitVoxelCoordinate {
  for (const value of coord) {
    if (!Number.isInteger(value) || value < INT32_MIN || value > INT32_MAX) {
      throw new RangeError('voxel coordinates must be signed 32-bit integers')
    }
  }
  const [z, x, y] = coord
  const cz = Math.floor(z / 16)
  const cx = Math.floor(x / 16)
  const cy = Math.floor(y / 16)
  const lz = floorMod(z, 16)
  const lx = floorMod(x, 16)
  const ly = floorMod(y, 16)
  const rx = Math.floor(cx / 32)
  const ry = Math.floor(cy / 32)
  const rcx = floorMod(cx, 32)
  const rcy = floorMod(cy, 32)
  return {
    local: [lz, lx, ly],
    localIndex: localVoxelIndex(lz, lx, ly),
    region: [rx, ry],
    regionKey: `${rx},${ry}`,
    section: [cz, rcx, rcy],
    sectionKey: `${cz},${rcx},${rcy}`,
  }
}

function normalizeVoxels(voxels: Iterable<GemapVoxel>): NormalizedVoxel[] {
  const output: NormalizedVoxel[] = []
  const coordinates = new Set<string>()
  for (const voxel of voxels) {
    if (
      typeof voxel !== 'object'
      || voxel === null
      || !Array.isArray(voxel.coord)
      || voxel.coord.length !== 3
    ) {
      gemapFail('semantic.invalid_chunk', 'voxel must contain a three-axis coordinate')
    }
    const coord: [number, number, number] = [voxel.coord[0], voxel.coord[1], voxel.coord[2]]
    try {
      splitVoxelCoordinate(coord)
    } catch (error) {
      gemapFail('semantic.invalid_chunk', 'voxel coordinate is outside signed 32-bit space', {
        cause: error,
      })
    }
    if (typeof voxel.block !== 'string' || !isValidBlockName(voxel.block)) {
      gemapFail('semantic.invalid_chunk', `invalid namespaced block: ${String(voxel.block)}`)
    }
    const coordinateKey = coord.join(',')
    if (coordinates.has(coordinateKey)) {
      gemapFail('semantic.invalid_chunk', `duplicate voxel coordinate: ${coordinateKey}`)
    }
    coordinates.add(coordinateKey)
    if (voxel.block !== 'glyphweave:air') output.push({ block: voxel.block, coord })
  }
  return output
}

function createManifest(worldName: string, names: readonly string[]): GemapManifest {
  const blockRegistry: Record<string, string> = { 0: 'glyphweave:air' }
  for (let index = 0; index < names.length; index += 1) {
    blockRegistry[String(index + 1)] = names[index]
  }
  return {
    format: 'glyphweave-map',
    version: 3,
    world: { name: worldName },
    axisOrder: 'z,x,y',
    chunkShape: [16, 16, 16],
    regionShape: ['infinite', 32, 32],
    blockRegistry,
    regions: {},
  }
}

export function buildGemapDocument(
  worldName: string,
  voxels: Iterable<GemapVoxel>,
): GemapDocument {
  if (typeof worldName !== 'string' || worldName.length === 0) {
    gemapFail('semantic.invalid_manifest', 'world name must be a non-empty string')
  }
  const normalized = normalizeVoxels(voxels)
  const blockNames = [...new Set(normalized.map((voxel) => voxel.block))].sort()
  const blockIds = new Map(blockNames.map((name, index) => [name, index + 1]))
  const manifest = createManifest(worldName, blockNames)
  const workingRegions = new Map<string, {
    coord: [number, number]
    sections: Map<string, Uint32Array>
  }>()

  for (const voxel of normalized) {
    const split = splitVoxelCoordinate(voxel.coord)
    let region = workingRegions.get(split.regionKey)
    if (region === undefined) {
      region = { coord: split.region, sections: new Map() }
      workingRegions.set(split.regionKey, region)
    }
    let section = region.sections.get(split.sectionKey)
    if (section === undefined) {
      section = new Uint32Array(GEMAP_CHUNK_VOLUME)
      region.sections.set(split.sectionKey, section)
    }
    const blockId = blockIds.get(voxel.block)
    if (blockId === undefined) throw new Error('builder registry is internally inconsistent')
    section[split.localIndex] = blockId
  }

  const regions: Record<string, GemapRegionDocument> = Object.create(null) as Record<
    string,
    GemapRegionDocument
  >
  for (const [regionKey, workingRegion] of workingRegions) {
    const [rx, ry] = workingRegion.coord
    const regionPath = `regions/${rx}.${ry}/region.json`
    manifest.regions[regionKey] = regionPath
    const sections: Record<string, string> = Object.create(null) as Record<string, string>
    const chunks: Record<string, GemapChunkRecord> = Object.create(null) as Record<
      string,
      GemapChunkRecord
    >
    const binaries: Record<string, Uint8Array> = Object.create(null) as Record<string, Uint8Array>

    for (const [sectionKey, blocks] of workingRegion.sections) {
      const canonical = canonicalizeChunk(blocks)
      sections[sectionKey] = canonical.id
      if (!(canonical.id in chunks)) {
        chunks[canonical.id] = {
          bits: canonical.bits,
          palette: canonical.palette,
          data: `chunks/${canonical.id}.bin`,
        }
        binaries[canonical.id] = canonical.packed
      }
    }
    const record: GemapRegion = {
      format: 'glyphweave-region',
      version: 1,
      region: [rx, ry],
      sections,
      chunks,
    }
    regions[regionKey] = { chunks: binaries, record }
  }

  const document = { manifest, regions }
  validateGemapDocument(document)
  return document
}
