import type { ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Eye, Hammer } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useUiStore } from '@/stores/ui-store'
import { getAllSurfaces } from '@/lib/surfaces'
import type { SurfaceStyle } from '@/types'

export type TitlebarPage = 'home' | 'editor' | 'workshop'

interface TitlebarProps {
  page: TitlebarPage
  worldName?: string
  onBack?: () => void
  onWorkshop?: () => void
}

export function Titlebar({ page, worldName, onBack, onWorkshop }: TitlebarProps): ReactElement {
  const { t } = useTranslation()
  const surfaceStyle = useUiStore((s) => s.surfaceStyle)
  const setSurfaceStyle = useUiStore((s) => s.setSurfaceStyle)
  const isEditable = surfaceStyle === 'ascii'
  const surfaces = getAllSurfaces()

  return (
    <div className="h-9 shrink-0 flex items-center gap-2 px-3 bg-zinc-950 border-b border-zinc-800 select-none">
      {/* Left section: branding + navigation */}
      <div className="flex items-center gap-2 min-w-0">
        {/* Back button (editor & workshop) */}
        {(page === 'editor' || page === 'workshop') && onBack && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[11px] text-zinc-400 hover:text-zinc-200 -ml-1"
            onClick={onBack}
          >
            <ArrowLeft className="w-3 h-3" />
          </Button>
        )}

        {/* Logo / app name */}
        <div className="flex items-center gap-1.5 text-zinc-300">
          <Hammer className="w-3.5 h-3.5 text-zinc-500" />
          <span className="text-xs font-mono font-medium tracking-wide">
            {t('app.title')}
          </span>
        </div>

        {/* Page context */}
        {page === 'editor' && worldName && (
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[10px] text-zinc-600">/</span>
            <span className="text-[11px] text-zinc-500 truncate font-mono">
              {worldName}
            </span>
          </div>
        )}
        {page === 'workshop' && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-zinc-600">/</span>
            <span className="text-[11px] text-zinc-500 font-mono">
              {t('home.themeWorkshop')}
            </span>
          </div>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" data-tauri-drag-region />

      {/* Right section: actions */}
      <div className="flex items-center gap-1">
        {/* Surface style switcher (editor only) */}
        {page === 'editor' && (
          <>
            {!isEditable && (
              <span className="text-[10px] text-amber-500/80 font-mono px-1 select-none">
                <Eye className="w-3 h-3 inline-block mr-0.5 -mt-px" />
                {t('surfaces.viewOnlyBadge')}
              </span>
            )}
            <Select
              value={surfaceStyle}
              onValueChange={(v) => setSurfaceStyle(v as SurfaceStyle)}
            >
              <SelectTrigger
                size="sm"
                className={`h-6 text-[11px] px-1.5 gap-1 border-0 bg-transparent hover:bg-zinc-800/50 ${
                  isEditable ? 'text-zinc-400' : 'text-amber-400'
                }`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="min-w-[130px]">
                {surfaces.map((s) => (
                  <SelectItem key={s.id} value={s.id} className="text-xs">
                    {t(`surfaces.${s.id}`, s.name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
        {page === 'home' && onWorkshop && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[11px] text-zinc-500 hover:text-zinc-300 px-2"
            onClick={onWorkshop}
          >
            {t('home.themeWorkshop')}
          </Button>
        )}
      </div>
    </div>
  )
}
