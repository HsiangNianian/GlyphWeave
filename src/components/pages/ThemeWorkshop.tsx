import { useState, useCallback, useRef, useEffect } from 'react'
import type { Theme, TileColors } from '@/types'
import { TILE_TYPES } from '@/constants/tiles'
import { THEMES } from '@/constants/themes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Download, Upload, Eye } from 'lucide-react'

const CATEGORIES = [
  { key: 'wall', label: 'Walls' },
  { key: 'floor', label: 'Floors' },
  { key: 'water', label: 'Water' },
  { key: 'terrain', label: 'Terrain' },
  { key: 'vegetation', label: 'Vegetation' },
  { key: 'furniture', label: 'Furniture' },
  { key: 'item', label: 'Items' },
  { key: 'decoration', label: 'Decorations' },
  { key: 'special', label: 'Special' },
] as const

// Demo map that uses every tile type so the preview shows all colors at once
const TILE_IDS = Object.keys(TILE_TYPES).filter((id) => id !== 'void')
const ITEMS_PER_ROW = 9

const DEMO_TILES: Record<string, string> = {}
TILE_IDS.forEach((id, i) => {
  const x = i % ITEMS_PER_ROW
  const y = Math.floor(i / ITEMS_PER_ROW)
  DEMO_TILES[`${x},${y}`] = id
})

const DEMO_MAP = {
  tiles: DEMO_TILES,
  themeId: 'preview-theme',
  padding: 1,
  scale: 32,
}

interface ThemeWorkshopProps {
  onBack: () => void
  onUseTheme: (theme: Theme) => void
}

export function ThemeWorkshop({ onBack, onUseTheme }: ThemeWorkshopProps) {
  // Start from a copy of ansi-16
  const [theme, setTheme] = useState<Theme>(() => ({
    ...THEMES['ansi-16'],
    colors: { ...THEMES['ansi-16'].colors },
  }))
  const [selectedTile, setSelectedTile] = useState('wall')
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const previewUrlRef = useRef<string | null>(null)

  const setPreviewBlob = useCallback((blob: Blob) => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
    }
    const nextUrl = URL.createObjectURL(blob)
    previewUrlRef.current = nextUrl
    setPreviewUrl(nextUrl)
  }, [])

  const updateColor = useCallback((type: 'fgColor' | 'bgColor', value: string) => {
    setTheme((prev) => ({
      ...prev,
      colors: { ...prev.colors, [selectedTile]: { ...prev.colors[selectedTile], [type]: value } },
    }))
  }, [selectedTile])

  const updateMeta = useCallback((field: 'id' | 'name' | 'description', value: string) => {
    setTheme((prev) => ({ ...prev, [field]: value }))
  }, [])

  const renderPreview = useCallback(async (t: Theme) => {
    setPreviewLoading(true)
    try {
      const response = await fetch('/api/render?format=svg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...DEMO_MAP, themeId: t.id, theme: { colors: t.colors }, format: 'svg' }),
      })
      if (!response.ok) throw new Error(`API returned ${response.status}`)
      setPreviewBlob(await response.blob())
    } catch {
      setPreviewBlob(new Blob([
        '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="40"><text x="10" y="24" fill="#f88" font-size="14">Preview failed</text></svg>',
      ], { type: 'image/svg+xml' }))
    } finally {
      setPreviewLoading(false)
    }
  }, [setPreviewBlob])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => renderPreview(theme), 200)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [theme, renderPreview])

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
  }, [])

  const handleExport = useCallback(() => {
    const data = JSON.stringify({ glyphweaveTheme: 1, theme }, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${theme.id || 'custom-theme'}.theme.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [theme])

  const handleImport = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      if (data.glyphweaveTheme === 1 && data.theme?.colors) {
        setTheme({ ...data.theme, colors: { ...data.theme.colors } })
        setSelectedTile(Object.keys(data.theme.colors)[0] || 'wall')
      }
    } catch (err) {
      console.error('Failed to import theme:', err)
    }
    e.target.value = ''
  }, [])

  const selectedColors: TileColors = theme.colors[selectedTile] || { fgColor: '#ffffff', bgColor: '#000000' }

  // Group tiles by category
  const groupedTiles = CATEGORIES.map((cat) => ({
    ...cat,
    tiles: Object.entries(TILE_TYPES)
      .filter(([, t]) => t.category === cat.key)
      .map(([id]) => id),
  })).filter((g) => g.tiles.length > 0)

  return (
    <div className="w-full h-full flex flex-col bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 h-12 border-b border-zinc-800 shrink-0">
        <button onClick={onBack} className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200">
          <ArrowLeft className="w-3.5 h-3.5" />
          Home
        </button>
        <span className="text-sm font-mono text-zinc-500">/</span>
        <h1 className="text-sm font-medium text-zinc-200">Theme Workshop</h1>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Left: tile selector + metadata */}
        <aside className="w-72 shrink-0 border-r border-zinc-800 flex flex-col overflow-y-auto">
          {/* Metadata */}
          <div className="p-3 space-y-2 border-b border-zinc-800">
            <div>
              <Label className="text-[10px] text-zinc-500">Theme ID</Label>
              <Input
                value={theme.id}
                onChange={(e) => updateMeta('id', e.target.value)}
                className="h-7 text-xs bg-zinc-900 border-zinc-700 mt-1"
              />
            </div>
            <div>
              <Label className="text-[10px] text-zinc-500">Name</Label>
              <Input
                value={theme.name}
                onChange={(e) => updateMeta('name', e.target.value)}
                className="h-7 text-xs bg-zinc-900 border-zinc-700 mt-1"
              />
            </div>
            <div>
              <Label className="text-[10px] text-zinc-500">Description</Label>
              <Input
                value={theme.description}
                onChange={(e) => updateMeta('description', e.target.value)}
                className="h-7 text-xs bg-zinc-900 border-zinc-700 mt-1"
              />
            </div>
          </div>

          {/* Tile list grouped by category */}
          <div className="flex-1 overflow-y-auto p-2 space-y-3">
            {groupedTiles.map((group) => (
              <div key={group.key}>
                <p className="text-[10px] font-medium text-zinc-600 uppercase tracking-wider px-1 mb-1">
                  {group.label}
                </p>
                {group.tiles.map((tileId) => {
                  const tc = theme.colors[tileId] || { fgColor: '#fff', bgColor: '#000' }
                  const isSelected = selectedTile === tileId
                  return (
                    <button
                      key={tileId}
                      onClick={() => setSelectedTile(tileId)}
                      className={`
                        w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left
                        ${isSelected ? 'bg-zinc-700 text-zinc-100' : 'hover:bg-zinc-800 text-zinc-400'}
                      `}
                    >
                      <span
                        className="w-5 h-5 rounded flex items-center justify-center text-[11px] font-mono shrink-0"
                        style={{ background: tc.bgColor, color: tc.fgColor }}
                      >
                        {TILE_TYPES[tileId]?.char || '?'}
                      </span>
                      <span className="truncate">{tileId}</span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </aside>

        {/* Center: preview */}
        <main className="flex-1 flex flex-col min-w-0">
          {/* Toolbar */}
          <div className="flex items-center gap-2 px-3 h-10 border-b border-zinc-800 shrink-0">
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={handleExport}>
              <Download className="w-3 h-3" />
              Export .theme.json
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={handleImport}>
              <Upload className="w-3 h-3" />
              Import .theme.json
            </Button>
            <div className="flex-1" />
            <Button size="sm" className="h-7 text-xs gap-1.5" onClick={() => onUseTheme(theme)}>
              <Eye className="w-3 h-3" />
              Use This Theme
            </Button>
          </div>

          {/* Preview */}
          <div className="flex-1 flex items-center justify-center p-4 bg-black">
            {previewLoading ? (
              <span className="text-xs text-zinc-600">Rendering preview...</span>
            ) : previewUrl ? (
              <img
                src={previewUrl}
                alt="theme preview"
                className="max-w-full max-h-full rounded"
              />
            ) : (
              <span className="text-xs text-zinc-600">Adjust colors to preview</span>
            )}
          </div>
        </main>

        {/* Right: color pickers */}
        <aside className="w-64 shrink-0 border-l border-zinc-800 p-4 space-y-4 overflow-y-auto">
          <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Tile Colors</h3>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-400 font-mono">{selectedTile}</span>
              <span
                className="w-7 h-7 rounded flex items-center justify-center text-sm font-mono"
                style={{ background: selectedColors.bgColor, color: selectedColors.fgColor }}
              >
                {TILE_TYPES[selectedTile]?.char || '?'}
              </span>
            </div>

            <div>
              <Label className="text-[10px] text-zinc-500">Foreground (char color)</Label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="color"
                  value={selectedColors.fgColor}
                  onChange={(e) => updateColor('fgColor', e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
                />
                <input
                  value={selectedColors.fgColor}
                  onChange={(e) => updateColor('fgColor', e.target.value)}
                  className="flex-1 h-7 text-xs bg-zinc-900 border border-zinc-700 rounded px-2 font-mono"
                />
              </div>
            </div>

            <div>
              <Label className="text-[10px] text-zinc-500">Background</Label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="color"
                  value={selectedColors.bgColor}
                  onChange={(e) => updateColor('bgColor', e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
                />
                <input
                  value={selectedColors.bgColor}
                  onChange={(e) => updateColor('bgColor', e.target.value)}
                  className="flex-1 h-7 text-xs bg-zinc-900 border border-zinc-700 rounded px-2 font-mono"
                />
              </div>
            </div>
          </div>
        </aside>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".theme.json"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  )
}
