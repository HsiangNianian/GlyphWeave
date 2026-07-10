import { useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useMapStore } from '@/stores/map-store'
import { convertImageFileToMap, DEFAULT_IMAGE_CONVERT_WIDTH } from '@/lib/image-convert'
import { buildGemapDocument, writeGemap } from '@/lib/gemap'
import { importGemapBytes } from '@/lib/gemap-import'
import { resolveTheme } from '@/lib/theme-registry'
import { Button } from '@/components/ui/button'
import { Download, Upload, Image } from 'lucide-react'

export function ExportPanel() {
  const { t } = useTranslation()
  const exportMap = useMapStore((s) => s.exportMap)
  const exportVoxels = useMapStore((s) => s.exportVoxels)
  const importMap = useMapStore((s) => s.importMap)
  const importVoxels = useMapStore((s) => s.importVoxels)
  const worldName = useMapStore((s) => s.worldName)
  const themeId = useMapStore((s) => s.themeId)
  const customThemes = useMapStore((s) => s.customThemes)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const handleExport = useCallback(() => {
    const archive = writeGemap(buildGemapDocument(worldName, exportVoxels()))
    const archiveBlobBytes = new Uint8Array(archive.length)
    archiveBlobBytes.set(archive)
    const blob = new Blob([archiveBlobBytes], { type: 'application/vnd.glyphweave.gemap+zip' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${worldName.replace(/\s+/g, '_')}.gemap`
    a.click()
    URL.revokeObjectURL(url)
  }, [exportVoxels, worldName])

  const handleImport = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleImageImport = useCallback(() => {
    imageInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const imported = importGemapBytes(new Uint8Array(await file.arrayBuffer()))
      importVoxels({ voxels: imported.voxels, worldName: imported.worldName })
      if (imported.migrationReport) {
        const report = imported.migrationReport
        window.alert(
          `Legacy map migrated with ${report.mode}: ${report.outputVoxelCount} voxels, `
          + `${report.overwrittenTileCount} overwritten tiles, `
          + `${report.unknownTileIds.length} unknown tile IDs.`,
        )
      }
    } catch (err) {
      console.error('Failed to import map:', err)
      window.alert(err instanceof Error ? err.message : 'Failed to import map')
    }
    e.target.value = ''
  }, [importVoxels])

  const handleImageFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const mapWorldName = file.name.replace(/\.[^.]+$/, '')
    try {
      const data = await convertImageFileToMap(file, {
        themeId,
        theme: resolveTheme(themeId, customThemes),
        width: DEFAULT_IMAGE_CONVERT_WIDTH,
        worldName: mapWorldName,
      })
      importMap({
        activeZ: 0,
        slices: { 'z:0': data.tiles },
        worldName: data.worldName,
      })
    } catch (err) {
      console.error('Failed to import image:', err)
      window.alert(err instanceof Error ? err.message : 'Failed to import image')
    }
    e.target.value = ''
  }, [customThemes, importMap, themeId])

  const handleRenderExport = useCallback(async (format: 'svg' | 'png') => {
    const data = exportMap()
    const gemapDocument = buildGemapDocument(worldName, exportVoxels())
    gemapDocument.manifest.metadata = { appearance: { themeId } }
    const archive = writeGemap(gemapDocument)
    const archiveBuffer = new ArrayBuffer(archive.byteLength)
    new Uint8Array(archiveBuffer).set(archive)
    const name = data.worldName.replace(/\s+/g, '_')
    const baseUrl = window.location.origin
    const url = `${baseUrl}/api/render?format=${format}&z=${data.activeZ}`

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/vnd.glyphweave.gemap+zip' },
        body: archiveBuffer,
      })
      if (!res.ok) throw new Error(`API returned ${res.status}`)
      const blob = await res.blob()
      const dlUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = dlUrl
      a.download = `${name}.${format}`
      a.click()
      URL.revokeObjectURL(dlUrl)
    } catch (err) {
      console.error('Render export failed:', err)
    }
  }, [exportMap, exportVoxels, themeId, worldName])

  return (
    <div className="flex flex-col gap-3 p-3">
      <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">{t('exportPanel.title')}</h4>
      <p className="text-[11px] text-zinc-500 leading-relaxed">
        {t('exportPanel.desc')}
      </p>
      <Button variant="outline" className="w-full justify-start gap-2 text-xs h-8" onClick={handleExport}>
        <Download className="w-3.5 h-3.5" />
        {t('exportPanel.exportGemap')}
      </Button>
      <Button variant="outline" className="w-full justify-start gap-2 text-xs h-8" onClick={handleImport}>
        <Upload className="w-3.5 h-3.5" />
        {t('exportPanel.importGemap')}
      </Button>
      <Button variant="outline" className="w-full justify-start gap-2 text-xs h-8" onClick={handleImageImport}>
        <Image className="w-3.5 h-3.5" />
        {t('exportPanel.importImage')}
      </Button>

      <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider pt-1">{t('exportPanel.render')}</h4>
      <p className="text-[11px] text-zinc-500 leading-relaxed">
        {t('exportPanel.renderDesc')}
      </p>
      <Button variant="outline" className="w-full justify-start gap-2 text-xs h-8" onClick={() => handleRenderExport('svg')}>
        <Image className="w-3.5 h-3.5" />
        {t('exportPanel.exportSvg')}
      </Button>

      <input
        ref={fileInputRef}
        type="file"
        accept=".gemap,.json"
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageFileChange}
      />
    </div>
  )
}
