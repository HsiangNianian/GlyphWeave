'use client'
import { useState, useRef, useCallback } from 'react'
import type { WorldConfig } from '@/types'
import { THEME_LIST } from '@/constants/themes'
import { TILE_TYPES } from '@/constants/tiles'
import { generateDemoMap } from '@/constants/demo-map'
import { convertImageFileToMap, DEFAULT_IMAGE_CONVERT_WIDTH } from '@/lib/image-convert'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

import { Image as ImageIcon, MapIcon, Upload } from 'lucide-react'

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
      const text = await file.text()
      const data = JSON.parse(text)

      // Build world name from filename if not in data
      const mapWorldName = data.worldName || file.name.replace(/\.(gemap|json)$/i, '')

      // Detect format: v2 layered or v1 flat
      if (data.layerTiles && data.layers && data.layers.length > 0) {
        onStart({
          worldName: mapWorldName,
          tileSize: tileSize,
          themeId: themeId,
          initialLayerTiles: data.layerTiles,
          initialLayers: data.layers,
        })
      } else if (data.tiles) {
        onStart({
          worldName: mapWorldName,
          tileSize: tileSize,
          themeId: themeId,
          initialTiles: data.tiles,
        })
      }
    } catch (err) {
      console.error('Failed to import map:', err)
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
        initialTiles: data.tiles,
      })
    } catch (err) {
      console.error('Failed to import image:', err)
      window.alert(err instanceof Error ? err.message : 'Failed to import image')
    }
    e.target.value = ''
  }, [onStart, tileSize, themeId])

  const sampleColors = [
    TILE_TYPES.wall,
    TILE_TYPES.floor,
    TILE_TYPES.door,
    TILE_TYPES.water,
    TILE_TYPES.tree,
    TILE_TYPES.lava,
  ]

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
              const colors = sampleColors.map((t) => theme.colors[t.id])
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
                        {sampleColors[i]?.char}
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
          <a
            href="/api"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/></svg>
            API Docs
          </a>
          <button
            onClick={onWorkshop}
            className="inline-flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            {t('home.themeWorkshop')}
          </button>
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
