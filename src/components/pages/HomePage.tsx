'use client'
import { useState, useRef, useCallback } from 'react'
import type { WorldConfig } from '@/types'
import { THEME_LIST } from '@/constants/themes'
import { ASCII_GLYPHS } from '@/constants/ascii-glyphs'
import { generateDemoMap } from '@/constants/demo-map'
import { convertImageFileToMap, DEFAULT_IMAGE_CONVERT_WIDTH } from '@/lib/image-convert'
import { importGemapBytes } from '@/lib/gemap-import'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

import { Code2, Image as ImageIcon, MapIcon, Settings, Upload } from 'lucide-react'

const TILE_SIZES = [16, 20, 24, 32]

type HomePageProps = {
  onStart: (config: WorldConfig) => void
  onWorkshop: () => void
}

export function HomePage({ onStart, onWorkshop }: HomePageProps) {
  const { t } = useTranslation()
  const [worldName, setWorldName] = useState('My Roguelike World')
  const [tileSize, setTileSize] = useState(24)
  const [themeId, setThemeId] = useState('ansi-16')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const handleCreate = () => {
    if (!worldName.trim()) return
    onStart({ worldName: worldName.trim(), tileSize, themeId })
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleImageImportClick = () => {
    imageInputRef.current?.click()
  }

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const imported = importGemapBytes(bytes)
      onStart({
        worldName: imported.worldName || file.name.replace(/\.(gemap|json)$/i, ''),
        tileSize,
        themeId,
        initialVoxels: imported.voxels,
      })
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
  }, [onStart, tileSize, themeId])

  const handleImageFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const mapWorldName = file.name.replace(/\.[^.]+$/, '')
    try {
      const data = await convertImageFileToMap(file, {
        themeId,
        width: DEFAULT_IMAGE_CONVERT_WIDTH,
        worldName: mapWorldName,
      })

      onStart({
        worldName: data.worldName || mapWorldName,
        tileSize,
        themeId: data.themeId || themeId,
        initialSlices: { 'z:0': data.tiles },
      })
    } catch (err) {
      console.error('Failed to import image:', err)
      window.alert(err instanceof Error ? err.message : 'Failed to import image')
    }
    e.target.value = ''
  }, [onStart, tileSize, themeId])

  const sampleTileIds = ['wall', 'floor', 'door', 'water', 'tree', 'lava']

  return (
    <div className="w-full h-full flex items-center justify-center bg-black">
      <Card className="w-full max-w-lg bg-zinc-950 border-zinc-800 p-6 space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-mono font-bold text-zinc-100 tracking-tight">
            {t('app.title')}
          </h1>
          <p className="text-sm text-zinc-500 font-mono">
            {t('app.subtitle')}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="worldName" className="text-xs text-zinc-400">{t('home.worldName')}</Label>
            <Input
              id="worldName"
              value={worldName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWorldName(e.target.value)}
            placeholder={t('home.worldNamePlaceholder')}
            className="bg-zinc-900 border-zinc-700 text-zinc-100 h-9 text-sm"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-zinc-400">{t('home.tileSize')}</Label>
          <div className="flex gap-2">
            {TILE_SIZES.map((size) => (
              <Button
                key={size}
                variant={tileSize === size ? 'default' : 'outline'}
                size="sm"
                className="flex-1 h-8 text-xs"
                onClick={() => setTileSize(size)}
              >
                {size}px
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-zinc-400">{t('home.colorTheme')}</Label>
          <div className="grid grid-cols-1 gap-2">
            {THEME_LIST.map((theme) => {
              const colors = sampleTileIds.map((id) => theme.colors[id])
              return (
                <div
                  key={theme.id}
                  role="radio"
                  aria-checked={themeId === theme.id}
                  tabIndex={0}
                  onClick={() => setThemeId(theme.id)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setThemeId(theme.id)}
                  className={`
                    flex items-center gap-3 rounded-md border p-3 cursor-pointer
                    transition-colors
                    ${themeId === theme.id
                      ? 'border-zinc-500 bg-zinc-800/50'
                      : 'border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/30'
                    }
                  `}
                >
                  <div className="flex gap-1">
                    {colors.map((c, i) => (
                      <div
                        key={i}
                        className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-mono"
                        style={{ backgroundColor: c?.bgColor || '#000', color: c?.fgColor || '#fff' }}
                      >
                        {ASCII_GLYPHS[sampleTileIds[i]] || ' '}
                      </div>
                    ))}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-200">{t(`themes.${theme.id}.name`, theme.name)}</p>
                    <p className="text-[11px] text-zinc-500 truncate">{t(`themes.${theme.id}.description`, theme.description)}</p>
                  </div>
                  {themeId === theme.id && (
                    <div className="w-2 h-2 rounded-full bg-zinc-100 shrink-0" />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <Separator className="bg-zinc-800" />

        <Button
          className="w-full h-10 font-mono text-sm"
          onClick={handleCreate}
          disabled={!worldName.trim()}
        >
          {t('home.createWorld')}
        </Button>

        <div className="grid grid-cols-3 gap-2">
          <Button
            variant="outline"
            className="h-10 font-mono text-xs border-zinc-700 hover:bg-zinc-800 gap-2"
            onClick={handleImportClick}
          >
            <Upload className="w-4 h-4" />
            {t('home.importGemap')}
          </Button>

          <Button
            variant="outline"
            className="h-10 font-mono text-xs border-zinc-700 hover:bg-zinc-800 gap-2"
            onClick={handleImageImportClick}
          >
            <ImageIcon className="w-4 h-4" />
            {t('home.importImage')}
          </Button>

          <Button
            variant="outline"
            className="h-10 font-mono text-xs border-zinc-700 hover:bg-zinc-800 gap-2"
            onClick={() =>
              onStart({
                worldName: 'The Forgotten Catacombs',
                tileSize,
                themeId,
                initialTiles: generateDemoMap(),
              })
            }
          >
            <MapIcon className="w-4 h-4" />
            {t('home.demoMap')}
          </Button>
        </div>

        <div className="flex justify-center gap-3 pt-2">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs text-zinc-600 hover:text-zinc-400"
          >
            <a href="/api" target="_blank" rel="noopener noreferrer">
              <Code2 className="h-3.5 w-3.5" />
              API Docs
            </a>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs text-zinc-600 hover:text-zinc-400"
            onClick={onWorkshop}
          >
            <Settings className="h-3.5 w-3.5" />
            {t('home.themeWorkshop')}
          </Button>
        </div>

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
      </Card>
    </div>
  )
}
