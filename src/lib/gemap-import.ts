import {
  buildGemapDocument,
  gemapVoxels,
  migrateLegacyGemap,
  readGemap,
  writeGemap,
  type GemapVoxel,
  type MigrationReport,
} from '@/lib/gemap'

export type ImportedGemap = {
  source: 'legacy' | 'v3'
  themeId?: string
  voxels: GemapVoxel[]
  worldName: string
  migrationReport?: MigrationReport
}

export type MigrationFeedback = {
  hiddenTileCount: number
  outputVoxelCount: number
  overwrittenTileCount: number
  sourceVersion: number
  unknownTileCount: number
}

function appearanceThemeId(metadata: unknown): string | undefined {
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) return undefined
  const appearance = (metadata as Record<string, unknown>).appearance
  if (typeof appearance !== 'object' || appearance === null || Array.isArray(appearance)) {
    return undefined
  }
  const themeId = (appearance as Record<string, unknown>).themeId
  return typeof themeId === 'string' && themeId.length > 0 ? themeId : undefined
}

export function createEditorGemapArchive(
  worldName: string,
  voxels: readonly GemapVoxel[],
  themeId: string,
): Uint8Array {
  const document = buildGemapDocument(worldName, voxels)
  document.manifest.metadata = {
    appearance: { themeId },
  }
  return writeGemap(document)
}

export function migrationFeedback(report: MigrationReport): MigrationFeedback {
  return {
    hiddenTileCount: report.skippedHiddenLayers.reduce(
      (total, layer) => total + layer.tileCount,
      0,
    ),
    outputVoxelCount: report.outputVoxelCount,
    overwrittenTileCount: report.overwrittenTileCount,
    sourceVersion: report.sourceVersion,
    unknownTileCount: report.unknownTileIds.length,
  }
}

export function hasZipMagic(bytes: Uint8Array): boolean {
  return bytes.length >= 4
    && bytes[0] === 0x50
    && bytes[1] === 0x4b
    && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07)
}

export function importGemapBytes(bytes: Uint8Array): ImportedGemap {
  if (hasZipMagic(bytes)) {
    const document = readGemap(bytes)
    return {
      source: 'v3',
      themeId: appearanceThemeId(document.manifest.metadata),
      voxels: gemapVoxels(document),
      worldName: document.manifest.world.name,
    }
  }

  const migration = migrateLegacyGemap(bytes, 'flatten')
  return {
    source: 'legacy',
    themeId: migration.metadata.sourceThemeId,
    voxels: migration.voxels,
    worldName: migration.document.manifest.world.name,
    migrationReport: migration.report,
  }
}
