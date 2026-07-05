import { NextRequest, NextResponse } from 'next/server'
import { resolve } from 'path'
import { readdirSync } from 'fs'

const AGENTS_DIR = resolve(process.env.HOME || '/home/hsiangnianian', '.agents')

export function GET(request: NextRequest) {
  const relPath = request.nextUrl.searchParams.get('path') || ''
  const abs = resolve(AGENTS_DIR, relPath)
  if (!abs.startsWith(AGENTS_DIR)) return NextResponse.json({ entries: [] })
  try {
    const entries = readdirSync(abs, { withFileTypes: true })
      .filter(e => !e.name.startsWith('.'))
      .map(e => ({
        name: e.name,
        path: relPath ? relPath + '/' + e.name : e.name,
        type: e.isDirectory() ? 'directory' as const : 'file' as const,
      }))
      .sort((a, b) => a.type !== b.type ? (a.type === 'directory' ? -1 : 1) : a.name.localeCompare(b.name))
    return NextResponse.json({ entries })
  } catch { return NextResponse.json({ entries: [] }) }
}
