'use client'
import { useMapStore } from '@/stores/map-store'
import type { ToolType } from '@/types'
import { Brush, Eraser, Hand, PaintBucket, MousePointer2, Undo2, Redo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const TOOLS: { id: ToolType; label: string; icon: typeof Brush; shortcut: string }[] = [
  { id: 'brush', label: 'Brush', icon: Brush, shortcut: 'B' },
  { id: 'erase', label: 'Eraser', icon: Eraser, shortcut: 'E' },
  { id: 'fill', label: 'Fill', icon: PaintBucket, shortcut: 'F' },
  { id: 'pan', label: 'Pan', icon: Hand, shortcut: 'P' },
  { id: 'select', label: 'Select', icon: MousePointer2, shortcut: 'S' },
]

export function Toolbar() {
  const currentTool = useMapStore((s) => s.currentTool)
  const setCurrentTool = useMapStore((s) => s.setCurrentTool)
  const undo = useMapStore((s) => s.undo)
  const redo = useMapStore((s) => s.redo)

  return (
    <div className="flex flex-col items-center gap-1.5 bg-zinc-950 border-r border-zinc-800 px-2 py-3">
      {TOOLS.map((tool) => {
        const Icon = tool.icon
        return (
          <Tooltip key={tool.id}>
            <TooltipTrigger asChild>
              <Button
                variant={currentTool === tool.id ? 'default' : 'ghost'}
                size="icon"
                className="w-9 h-9"
                onClick={() => setCurrentTool(tool.id)}
              >
                <Icon className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {tool.label} <span className="text-zinc-500 ml-1">[{tool.shortcut}]</span>
            </TooltipContent>
          </Tooltip>
        )
      })}

      <Separator className="my-1 bg-zinc-800" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="w-9 h-9" onClick={undo}>
            <Undo2 className="w-4 h-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">Undo [Ctrl+Z]</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="w-9 h-9" onClick={redo}>
            <Redo2 className="w-4 h-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">Redo [Ctrl+Shift+Z]</TooltipContent>
      </Tooltip>
    </div>
  )
}
