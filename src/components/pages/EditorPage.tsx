import { useEffect, useRef } from 'react'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { PanelRightClose, PanelRightOpen } from 'lucide-react'

interface EditorPageProps {
  worldConfig: WorldConfig
  onBack: () => void
}

export function EditorPage({ worldConfig, onBack }: EditorPageProps) {
  const initWorld = useMapStore((s) => s.initWorld)
  const sidePanelOpen = useUiStore((s) => s.sidePanelOpen)
  const toggleSidePanel = useUiStore((s) => s.toggleSidePanel)
  const sidePanelTab = useUiStore((s) => s.sidePanelTab)
  const setSidePanelTab = useUiStore((s) => s.setSidePanelTab)
  const showMinimap = useUiStore((s) => s.showMinimap)

  const canvasRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage | null>(null)
  useKeyboard()

  useEffect(() => {
    initWorld(worldConfig)
  }, [initWorld, worldConfig])

  return (
    <div className="w-full h-full flex bg-black">
      <Toolbar />

      <div ref={canvasRef} className="flex-1 relative overflow-hidden">
        <MapCanvas containerRef={canvasRef} stageRef={stageRef} />

        <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none">
          <div className="flex items-center gap-2 pointer-events-auto">
            <Button
              variant="ghost"
              size="sm"
              className="text-[11px] text-zinc-500 hover:text-zinc-300 h-6 px-2 bg-black/60 backdrop-blur-sm border border-zinc-800"
              onClick={onBack}
            >
              ← Home
            </Button>
          </div>
        </div>

        {showMinimap && (
          <div className="absolute top-3 right-3 pointer-events-none">
            <Minimap stageRef={stageRef} />
          </div>
        )}

        <div className="absolute bottom-3 right-3 pointer-events-none">
          <div className="pointer-events-auto">
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
        <div className="w-56 bg-zinc-950 border-l border-zinc-800 flex flex-col overflow-hidden shrink-0">
          <Tabs value={sidePanelTab} onValueChange={setSidePanelTab} className="flex flex-col h-full">
            <TabsList className="bg-zinc-900 border-b border-zinc-800 rounded-none px-1 h-9 justify-start gap-0">
              <TabsTrigger value="tiles" className="text-xs h-8 px-2.5 data-[state=active]:bg-zinc-800 rounded-none">Tiles</TabsTrigger>
              <TabsTrigger value="presets" className="text-xs h-8 px-2.5 data-[state=active]:bg-zinc-800 rounded-none">Presets</TabsTrigger>
              <TabsTrigger value="layers" className="text-xs h-8 px-2.5 data-[state=active]:bg-zinc-800 rounded-none">Layers</TabsTrigger>
              <TabsTrigger value="export" className="text-xs h-8 px-2.5 data-[state=active]:bg-zinc-800 rounded-none">📦</TabsTrigger>
              <TabsTrigger value="settings" className="text-xs h-8 px-2.5 data-[state=active]:bg-zinc-800 rounded-none">⚙️</TabsTrigger>
            </TabsList>
            <TabsContent value="tiles" className="flex-1 mt-0 data-[state=inactive]:hidden flex flex-col">
              <TilePalette />
            </TabsContent>
            <TabsContent value="presets" className="flex-1 mt-0 data-[state=inactive]:hidden flex flex-col">
              <PresetsPanel />
            </TabsContent>
            <TabsContent value="layers" className="flex-1 mt-0 data-[state=inactive]:hidden flex flex-col">
              <LayersPanel />
            </TabsContent>
            <TabsContent value="export" className="mt-0 data-[state=inactive]:hidden">
              <ExportPanel />
            </TabsContent>
            <TabsContent value="settings" className="flex-1 mt-0 data-[state=inactive]:hidden flex flex-col">
              <SettingsPanel />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  )
}
