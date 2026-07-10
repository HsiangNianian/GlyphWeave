import { describe, expect, it } from 'vitest'

import { GemapError } from './errors'
import { readZipEntries, writeZipEntries } from './zip'

describe('safe gemap ZIP container', () => {
  it('round-trips stored and deflated entries deterministically', () => {
    const entries = [
      ['regions/0.0/chunks/example.bin', { compression: 'store' as const, data: Uint8Array.of(1, 2, 3) }],
      ['manifest.json', { compression: 'deflate' as const, data: new TextEncoder().encode('{}\n') }],
    ] as const

    const first = writeZipEntries(entries)
    const second = writeZipEntries(entries)
    expect(first).toEqual(second)
    expect(readZipEntries(first)).toEqual(new Map([
      ['manifest.json', new TextEncoder().encode('{}\n')],
      ['regions/0.0/chunks/example.bin', Uint8Array.of(1, 2, 3)],
    ]))
  })

  it('rejects unsafe paths before writing', () => {
    expect(() => writeZipEntries([
      ['../manifest.json', { data: new Uint8Array() }],
    ])).toThrowError(expect.objectContaining<Partial<GemapError>>({
      category: 'container.unsafe_path',
    }))
  })

  it('applies resource limits before writing', () => {
    expect(() => writeZipEntries([
      ['manifest.json', { data: new Uint8Array(5) }],
    ], { maxEntryUncompressedBytes: 4 })).toThrowError(
      expect.objectContaining<Partial<GemapError>>({ category: 'container.resource_limit' }),
    )
  })
})
