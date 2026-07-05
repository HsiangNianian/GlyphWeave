'use client'
import { useState } from 'react'
import type { WorldConfig } from '@/types'
import { HomePage } from '@/components/pages/HomePage'
import EditorPageInner from './editor/page'

export default function Page() {
  const [worldConfig, setWorldConfig] = useState<WorldConfig | null>(null)

  if (worldConfig) {
    return <EditorPageInner worldConfig={worldConfig} onBack={() => setWorldConfig(null)} />
  }
  return <HomePage onStart={setWorldConfig} />
}
