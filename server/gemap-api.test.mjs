import { describe, expect, it, vi } from 'vitest'

import {
  ApiHttpError,
  GEMAP_MEDIA_TYPE,
  MAX_API_BODY_BYTES,
  bytesToBase64,
  decodeRenderPost,
  ensureBodySize,
  gemapConvertResponse,
} from './gemap-api.mjs'

const encoder = new TextEncoder()

describe('render API input contract', () => {
  it('requires explicit z and delegates ZIP decoding to the shared runtime', () => {
    const archive = new Uint8Array([0x50, 0x4b, 3, 4])
    const decodeGemapSlice = vi.fn(() => ({ tiles: { '0,0': 'wall' } }))
    const runtime = { decodeGemapSlice }

    expect(decodeRenderPost(archive, GEMAP_MEDIA_TYPE, { z: '-3' }, runtime)).toEqual({
      tiles: { '0,0': 'wall' },
    })
    expect(decodeGemapSlice).toHaveBeenCalledWith(archive, -3)
    expect(() => decodeRenderPost(archive, 'application/zip', {}, runtime)).toThrowError(
      /required "z"/u,
    )
  })

  it('keeps bounded legacy JSON input during the compatibility window', () => {
    expect(decodeRenderPost(
      encoder.encode('{"tiles":{"0,0":"floor"}}'),
      'application/json; charset=utf-8',
      {},
      {},
    )).toEqual({ tiles: { '0,0': 'floor' } })
  })

  it('uses 413 for oversized bodies and 415 for unsupported media', () => {
    expect(() => ensureBodySize(MAX_API_BODY_BYTES + 1)).toThrowError(ApiHttpError)
    try {
      ensureBodySize(MAX_API_BODY_BYTES + 1)
    } catch (error) {
      expect(error.status).toBe(413)
    }
    try {
      decodeRenderPost(new Uint8Array(), 'text/plain', {}, {})
    } catch (error) {
      expect(error.status).toBe(415)
    }
  })
})

describe('convert API v3 responses', () => {
  it('returns vendor ZIP bytes for format=gemap', () => {
    const archive = new Uint8Array([0x50, 0x4b, 3, 4])
    const response = gemapConvertResponse(
      { format: 'gemap', map: { tiles: {} }, theme: {}, themeId: 'ansi-16' },
      { encodeConvertedMap: () => archive },
      vi.fn(),
    )

    expect(response).toEqual({ body: archive, contentType: GEMAP_MEDIA_TYPE })
  })

  it('defines a usable JSON bundle for format=both', () => {
    const archive = new Uint8Array([0x50, 0x4b, 3, 4])
    const response = gemapConvertResponse(
      { format: 'both', map: { tiles: {} }, theme: {}, themeId: 'ansi-16' },
      { encodeConvertedMap: () => archive },
      () => '<svg/>',
    )
    const bundle = JSON.parse(new TextDecoder().decode(response.body))

    expect(response.contentType).toBe('application/json')
    expect(bundle).toEqual({
      format: 'glyphweave-convert-bundle',
      version: 1,
      gemap: {
        data: bytesToBase64(archive),
        encoding: 'base64',
        mediaType: GEMAP_MEDIA_TYPE,
      },
      svg: '<svg/>',
    })
  })
})
