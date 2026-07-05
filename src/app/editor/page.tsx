'use client'
import type { WorldConfig } from '@/types'
import { EditorPage } from '@/components/pages/EditorPage'

interface Props { worldConfig: WorldConfig; onBack: () => void }

export default function EditorPageWrapper({ worldConfig, onBack }: Props) {
  return <EditorPage worldConfig={worldConfig} onBack={onBack} />
}
