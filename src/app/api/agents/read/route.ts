import { NextRequest, NextResponse } from 'next/server'
import { resolve, extname } from 'path'
import { statSync, readFileSync } from 'fs'

const AGENTS_DIR = resolve(process.env.HOME || '/home/hsiangnianian', '.agents')

const MIME_MAP: Record<string, string> = {
  '.md': 'text/markdown', '.json': 'application/json',
  '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.ts': 'text/typescript', '.tsx': 'text/typescript',
  '.html': 'text/html', '.css': 'text/css',
}

export function GET(request: NextRequest) {
  const relPath = request.nextUrl.searchParams.get('path')
  if (!relPath) return NextResponse.json({ error: 'Missing path' }, { status: 400 })
  const abs = resolve(AGENTS_DIR, relPath)
  if (!abs.startsWith(AGENTS_DIR)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    const s = statSync(abs)
    if (!s.isFile() || s.size > 1024 * 1024) return NextResponse.json({ error: 'Invalid file' }, { status: 400 })
    const buf = readFileSync(abs)
    if (buf.includes(0)) return NextResponse.json({ error: 'Binary file' }, { status: 400 })
    const ext = extname(relPath).toLowerCase()
    return NextResponse.json({ content: buf.toString('utf-8'), size: s.size, mime: MIME_MAP[ext] || 'text/plain' })
  } catch { return NextResponse.json({ error: 'Read error' }, { status: 404 }) }
}
