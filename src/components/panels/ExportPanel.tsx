'use client'
import { useCallback, useRef } from 'react'
import { useMapStore } from '@/stores/map-store'
import { Button } from '@/components/ui/button'
import { Download, Upload } from 'lucide-react'

export function ExportPanel() {
  const exportMap = useMapStore((s) => s.exportMap)
  const importMap = useMapStore((s) => s.importMap)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleExport = useCallback(() => {
    const data = exportMap()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${data.worldName.replace(/\s+/g, '_')}.gemap`
    a.click()
    URL.revokeObjectURL(url)
  }, [exportMap])

  const handleImport = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      importMap(data)
    } catch (err) {
      console.error('Failed to import map:', err)
    }
    e.target.value = ''
  }, [importMap])

  return (
    <div className="flex flex-col gap-3 p-3">
      <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Export / Import</h4>
      <p className="text-[11px] text-zinc-500 leading-relaxed">
        Export your map as a <code>.gemap</code> JSON file, or import one to continue editing.
      </p>
      <Button variant="outline" className="w-full justify-start gap-2 text-xs h-8" onClick={handleExport}>
        <Download className="w-3.5 h-3.5" />
        Export Map
      </Button>
      <Button variant="outline" className="w-full justify-start gap-2 text-xs h-8" onClick={handleImport}>
        <Upload className="w-3.5 h-3.5" />
        Import Map
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".gemap,.json"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  )
}
