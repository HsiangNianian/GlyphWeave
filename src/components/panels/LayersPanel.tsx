'use client'
import { useMapStore } from '@/stores/map-store'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { useTranslation } from 'react-i18next'
import { Plus, Eye, EyeOff, Lock, Unlock, Trash2 } from 'lucide-react'

export function LayersPanel() {
  const { t } = useTranslation()
  const layers = useMapStore((s) => s.layers)
  const activeLayer = useMapStore((s) => s.activeLayer)
  const addLayer = useMapStore((s) => s.addLayer)
  const removeLayer = useMapStore((s) => s.removeLayer)
  const setActiveLayer = useMapStore((s) => s.setActiveLayer)
  const toggleLayerVisibility = useMapStore((s) => s.toggleLayerVisibility)
  const toggleLayerLock = useMapStore((s) => s.toggleLayerLock)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
        <span className="text-xs font-medium text-zinc-400">{t('layers.title')}</span>
        <Button
          variant="ghost"
          size="icon"
          className="w-6 h-6"
          onClick={() => addLayer()}
          title={t('layers.addLayer')}
        >
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>
      <ScrollArea className="flex-1 px-2 py-2">
        <div className="space-y-1">
          {layers.map((layer, i) => (
            <div
              key={layer.id}
              className={`
                flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer group
                ${i === activeLayer ? 'bg-zinc-700' : 'hover:bg-zinc-800'}
              `}
              onClick={() => setActiveLayer(i)}
            >
              <Button
                variant="ghost"
                size="icon"
                className="w-5 h-5 shrink-0"
                onClick={(e) => { e.stopPropagation(); toggleLayerVisibility(i) }}
                title={layer.visible ? t('layers.hideLayer') : t('layers.showLayer')}
              >
                {layer.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              </Button>
              <span className="text-xs text-zinc-300 flex-1 truncate">{layer.name}</span>
              <Button
                variant="ghost"
                size="icon"
                className="w-5 h-5 shrink-0"
                onClick={(e) => { e.stopPropagation(); toggleLayerLock(i) }}
                title={layer.locked ? t('layers.unlockLayer') : t('layers.lockLayer')}
              >
                {layer.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
              </Button>
              {layers.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-5 h-5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => { e.stopPropagation(); removeLayer(i) }}
                  title={t('layers.deleteLayer')}
                >
                  <Trash2 className="w-3 h-3 text-red-400" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
