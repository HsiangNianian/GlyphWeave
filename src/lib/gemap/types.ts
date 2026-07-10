export type JsonPrimitive = boolean | number | string | null

export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export type BlockRegistry = Record<string, string>

export type GemapManifest = {
  format: 'glyphweave-map'
  version: 3
  world: {
    name: string
    [key: string]: unknown
  }
  axisOrder: 'z,x,y'
  chunkShape: [16, 16, 16]
  regionShape: ['infinite', 32, 32]
  blockRegistry: BlockRegistry
  regions: Record<string, string>
  metadata?: Record<string, JsonValue>
  [key: string]: unknown
}

export type GemapChunkRecord = {
  bits: number
  palette: number[]
  data: string
  [key: string]: unknown
}

export type GemapRegion = {
  format: 'glyphweave-region'
  version: 1
  region: [number, number]
  sections: Record<string, string>
  chunks: Record<string, GemapChunkRecord>
  [key: string]: unknown
}

export type GemapRegionDocument = {
  record: GemapRegion
  chunks: Record<string, Uint8Array>
}

export type GemapDocument = {
  manifest: GemapManifest
  regions: Record<string, GemapRegionDocument>
}

export type GemapVoxel = {
  coord: [z: number, x: number, y: number]
  block: string
}

export type ZipResourceLimits = {
  maxCompressionRatio: number
  maxEntries: number
  maxEntryUncompressedBytes: number
  maxTotalUncompressedBytes: number
}

export type ReadGemapOptions = {
  limits?: Partial<ZipResourceLimits>
}
