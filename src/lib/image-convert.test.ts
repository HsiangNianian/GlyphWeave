import { describe, expect, it } from 'vitest'

import { DEFAULT_IMAGE_CONVERT_WIDTH, fitImageConvertDimensions } from './image-convert'

describe('fitImageConvertDimensions', () => {
  it('uses the default width and preserves aspect ratio', () => {
    expect(fitImageConvertDimensions(1200, 600)).toEqual({
      width: DEFAULT_IMAGE_CONVERT_WIDTH,
      height: 120,
    })
  })

  it('derives height when only width is requested', () => {
    expect(fitImageConvertDimensions(400, 100, { width: 101 })).toEqual({
      width: 101,
      height: 25,
    })
  })

  it('derives width when only height is requested', () => {
    expect(fitImageConvertDimensions(300, 1200, { height: 80 })).toEqual({
      width: 20,
      height: 80,
    })
  })

  it('honors explicit dimensions without rescaling them', () => {
    expect(fitImageConvertDimensions(100, 100, { width: 17, height: 19 })).toEqual({
      width: 17,
      height: 19,
    })
  })

  it('rejects invalid source dimensions', () => {
    expect(() => fitImageConvertDimensions(0, 100)).toThrow('image has invalid dimensions')
    expect(() => fitImageConvertDimensions(100, 0)).toThrow('image has invalid dimensions')
  })

  it('rejects invalid requested dimensions', () => {
    expect(() => fitImageConvertDimensions(100, 100, { width: 1.5 })).toThrow(
      'width must be an integer between 1 and 512',
    )
    expect(() => fitImageConvertDimensions(100, 100, { height: 513 })).toThrow(
      'height must be an integer between 1 and 512',
    )
  })

  it('rejects outputs that exceed the total cell cap', () => {
    expect(() => fitImageConvertDimensions(100, 100, { width: 512, height: 512 })).toThrow(
      'output dimensions must be at most 512px per side and 131072 cells total',
    )
  })
})
