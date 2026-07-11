'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import Konva from 'konva'
import type { WorldConfig } from '@/types'
import { useMapStore } from '@/stores/map-store'
import { useUiStore } from '@/stores/ui-store'
import { useKeyboard } from '@/hooks/useKeyboard'
import { MapCanvas } from '@/components/canvas/MapCanvas'
import { Minimap } from '@/components/canvas/Minimap'
import { Toolbar } from '@/components/toolbar/Toolbar'
import { TilePalette } from '@/components/panels/TilePalette'
import { PresetsPanel } from '@/components/panels/PresetsPanel'
import { LayersPanel } from '@/components/panels/LayersPanel'
import { SettingsPanel } from '@/components/panels/SettingsPanel'
import { ExportPanel } from '@/components/panels/ExportPanel'
import { ChatPanel } from '@/components/panels/ChatPanel'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Download, Layers, MessageCircle, Minus, PanelRightClose, PanelRightOpen, Plus, Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { zoomAtPoint } from '@/lib/viewport'

interface EditorPageProps {
  worldConfig: WorldConfig
}

export function EditorPage({ worldConfig }: EditorPageProps) {
  const { t } = useTranslation()
  const initWorld = useMapStore((s) => s.initWorld)
  const activeZ = useMapStore((s) => s.activeZ)
  const sidePanelOpen = useUiStore((s) => s.sidePanelOpen)
  const toggleSidePanel = useUiStore((s) => s.toggleSidePanel)
  const toggleChat = useUiStore((s) => s.toggleChat)
  const sidePanelTab = useUiStore((s) => s.sidePanelTab)
  const setSidePanelTab = useUiStore((s) => s.setSidePanelTab)
  const showMinimap = useUiStore((s) => s.showMinimap)
  const zoomScale = useUiStore((s) => s.zoomScale)
  const zoomIn = useUiStore((s) => s.zoomIn)
  const zoomOut = useUiStore((s) => s.zoomOut)
  const resetZoom = useUiStore((s) => s.resetZoom)
  const setViewport = useUiStore((s) => s.setViewport)

  const canvasRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage | null>(null)
  useKeyboard()

  const [panelWidth, setPanelWidth] = useState(320)
  const draggingRef = useRef(false)
  const pendingWidthRef = useRef(320)
  const rafRef = useRef(0)

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    draggingRef.current = true
    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!draggingRef.current) return
      const nextWidth = window.innerWidth - e.clientX
      pendingWidthRef.current = Math.max(240, Math.min(600, nextWidth))
      if (rafRef.current) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0
        setPanelWidth(pendingWidthRef.current)
      })
    }
    const handleUp = () => {
      if (!draggingRef.current) return
      draggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [])

  const prevZoomScale = useRef(zoomScale)
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const oldScale = prevZoomScale.current
    if (oldScale === zoomScale) return
    prevZoomScale.current = zoomScale

    const currentStageScale = stage.scaleX()
    if (Math.abs(currentStageScale - zoomScale) < 0.001) return

    const cx = stage.width() / 2
    const cy = stage.height() / 2
    const nextViewport = zoomAtPoint(
      { x: stage.x(), y: stage.y(), scale: currentStageScale },
      { x: cx, y: cy },
      zoomScale,
    )
    stage.position({ x: nextViewport.x, y: nextViewport.y })
    stage.scale({ x: zoomScale, y: zoomScale })
    stage.batchDraw()
    setViewport(nextViewport)
  }, [setViewport, zoomScale])

  useEffect(() => {
    initWorld(worldConfig)
  }, [initWorld, worldConfig])

  return (
    <div className="w-full h-full flex bg-black">
      <Toolbar />

      <div ref={canvasRef} className="flex-1 relative overflow-hidden">
        <MapCanvas containerRef={canvasRef} stageRef={stageRef} />

        <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none">
          <div className="flex h-6 items-center gap-1.5 border border-zinc-800 bg-black/70 px-2 font-mono text-[10px] text-zinc-500 backdrop-blur-sm">
            <Layers className="h-3 w-3 text-amber-400/80" />
            <span>{t('editor.slice')}</span>
            <span className="font-semibold tabular-nums text-amber-300">
              Z {activeZ >= 0 ? '+' : ''}{activeZ}
            </span>
          </div>
        </div>

        {showMinimap && (
          <div className="absolute top-3 right-3 pointer-events-none">
            <Minimap stageRef={stageRef} />
          </div>
        )}

        <div className="absolute bottom-3 left-3 pointer-events-none z-10">
          <div className="pointer-events-auto flex items-center gap-1 bg-black/70 backdrop-blur-sm border border-zinc-800 rounded-md px-1.5 py-1">
            <Button
              variant="ghost"
              size="icon"
              className="w-6 h-6 text-zinc-400 hover:text-zinc-200"
              title={t('editor.zoomOut')}
              onClick={zoomOut}
            >
              <Minus className="w-3 h-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-[11px] font-mono text-zinc-400 hover:text-zinc-200 px-1.5 min-w-[48px] text-center cursor-pointer select-none"
              title={t('editor.zoomReset')}
              onClick={resetZoom}
            >
              {Math.round(zoomScale * 100)}%
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="w-6 h-6 text-zinc-400 hover:text-zinc-200"
              title={t('editor.zoomIn')}
              onClick={zoomIn}
            >
              <Plus className="w-3 h-3" />
            </Button>
          </div>
        </div>

        <div className="absolute bottom-3 right-3 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              className="w-7 h-7 bg-black/60 backdrop-blur-sm border border-zinc-800"
              onClick={toggleChat}
            >
              <MessageCircle className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="w-7 h-7 bg-black/60 backdrop-blur-sm border border-zinc-800"
              onClick={toggleSidePanel}
            >
              {sidePanelOpen ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRightOpen className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>
      </div>

      {sidePanelOpen && (
        <div className="flex shrink-0">
          <div
            className="w-1.5 cursor-ew-resize hover:bg-zinc-600 active:bg-zinc-500 shrink-0 transition-colors"
            onMouseDown={handleDragStart}
          />
          <div
            className="bg-zinc-950 border-l border-zinc-800 flex flex-col overflow-hidden shrink-0"
            style={{ width: panelWidth }}
          >
            <Tabs value={sidePanelTab} onValueChange={setSidePanelTab} className="flex flex-col h-full">
              <TabsList className="bg-zinc-900 border-b border-zinc-800 rounded-none px-1 h-9 justify-start gap-0 overflow-x-auto flex-nowrap">
                <TabsTrigger value="tiles" className="text-xs h-8 px-2 data-[state=active]:bg-zinc-800 rounded-none shrink-0">{t('editor.tiles')}</TabsTrigger>
                <TabsTrigger value="presets" className="text-xs h-8 px-2 data-[state=active]:bg-zinc-800 rounded-none shrink-0">{t('editor.presets')}</TabsTrigger>
                <TabsTrigger value="layers" className="text-xs h-8 px-2 data-[state=active]:bg-zinc-800 rounded-none shrink-0">{t('editor.elevation')}</TabsTrigger>
                <TabsTrigger value="export" className="text-xs h-8 px-2 data-[state=active]:bg-zinc-800 rounded-none shrink-0">
                  <Download className="w-3.5 h-3.5" />
                </TabsTrigger>
                <TabsTrigger value="settings" className="text-xs h-8 px-2 data-[state=active]:bg-zinc-800 rounded-none shrink-0 flex items-center gap-1">
                  <Settings className="w-3.5 h-3.5" />
                </TabsTrigger>
              </TabsList>
              <TabsContent value="tiles" className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden flex flex-col">
                <TilePalette />
              </TabsContent>
              <TabsContent value="presets" className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden flex flex-col">
                <PresetsPanel />
              </TabsContent>
              <TabsContent value="layers" className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden flex flex-col">
                <LayersPanel />
              </TabsContent>
              <TabsContent value="export" className="mt-0 data-[state=inactive]:hidden">
                <ExportPanel />
              </TabsContent>
              <TabsContent value="settings" className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden flex flex-col">
                <SettingsPanel />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      )}

      <ChatPanel />
    </div>
  )
}
