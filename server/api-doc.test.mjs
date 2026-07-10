import { describe, expect, it } from 'vitest'

import { apiDocPage } from './api-doc.mjs'
import { GEMAP_MEDIA_TYPE } from './gemap-api.mjs'

describe('API documentation', () => {
  it('documents v3 ZIP rendering, explicit z, legacy compatibility, and both bundle', () => {
    const page = apiDocPage('https://example.test')

    expect(page).toContain('Map Data Format (.gemap v3 ZIP)')
    expect(page).toContain(GEMAP_MEDIA_TYPE)
    expect(page).toContain('/api/render?z=0&amp;format=svg')
    expect(page).toContain('Legacy compatibility window')
    expect(page).toContain('glyphweave-convert-bundle')
    expect(page).toContain('encoding: "base64"')
  })
})
