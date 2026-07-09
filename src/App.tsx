import { lazy, Suspense, useState, useCallback } from 'react'
import type { ReactElement } from 'react'
import type { WorldConfig, Theme } from '@/types'
import { HomePage } from '@/components/pages/HomePage'
import { TooltipProvider } from '@/components/ui/tooltip'

type Page = 'home' | 'editor' | 'workshop'

const EditorPage = lazy(() =>
  import('@/components/pages/EditorPage').then(({ EditorPage }) => ({
    default: EditorPage,
  })),
)

const ThemeWorkshop = lazy(() =>
  import('@/components/pages/ThemeWorkshop').then(({ ThemeWorkshop }) => ({
    default: ThemeWorkshop,
  })),
)

function PageLoading(): ReactElement {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-100">
      <div className="flex flex-col items-center gap-3">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-100"
          aria-hidden="true"
        />
        <p className="text-sm text-zinc-400">Loading workspace…</p>
      </div>
    </div>
  )
}

export default function App(): ReactElement {
  const [page, setPage] = useState<Page>('home')
  const [worldConfig, setWorldConfig] = useState<WorldConfig | null>(null)

  const handleStart = useCallback((config: WorldConfig) => {
    setWorldConfig(config)
    setPage('editor')
  }, [])

  const handleBack = useCallback(() => {
    setWorldConfig(null)
    setPage('home')
  }, [])

  const handleWorkshop = useCallback(() => {
    setPage('workshop')
  }, [])

  const handleUseTheme = useCallback((theme: Theme) => {
    setWorldConfig({
      worldName: 'Untitled',
      tileSize: 24,
      themeId: theme.id,
      initialTheme: theme,
    })
    setPage('editor')
  }, [])

  return (
    <TooltipProvider>
      {page === 'editor' && worldConfig ? (
        <Suspense fallback={<PageLoading />}>
          <EditorPage worldConfig={worldConfig} onBack={handleBack} />
        </Suspense>
      ) : page === 'workshop' ? (
        <Suspense fallback={<PageLoading />}>
          <ThemeWorkshop onBack={() => setPage('home')} onUseTheme={handleUseTheme} />
        </Suspense>
      ) : (
        <HomePage onStart={handleStart} onWorkshop={handleWorkshop} />
      )}
    </TooltipProvider>
  )
}
