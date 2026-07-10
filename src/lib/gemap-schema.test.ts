import { describe, expect, it } from 'vitest'

import manifestSchemaJson from '../../schemas/gemap-v3-manifest.schema.json'
import regionSchemaJson from '../../schemas/gemap-v3-region.schema.json'

type SchemaObject = Record<string, unknown>

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function deepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function resolveLocalRef(root: SchemaObject, ref: string): unknown {
  if (!ref.startsWith('#/')) {
    throw new Error(`test validator only supports local refs, received ${ref}`)
  }

  let current: unknown = root
  for (const encodedPart of ref.slice(2).split('/')) {
    const part = encodedPart.replaceAll('~1', '/').replaceAll('~0', '~')
    if (!isObject(current) || !(part in current)) {
      throw new Error(`unresolved JSON Schema ref: ${ref}`)
    }
    current = current[part]
  }
  return current
}

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case 'array':
      return Array.isArray(value)
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value)
    case 'number':
      return typeof value === 'number'
    case 'object':
      return isObject(value)
    case 'string':
      return typeof value === 'string'
    case 'boolean':
      return typeof value === 'boolean'
    case 'null':
      return value === null
    default:
      throw new Error(`unsupported schema type in test validator: ${type}`)
  }
}

function validateSchemaValue(
  value: unknown,
  schema: unknown,
  root: SchemaObject,
  path = '$',
): string[] {
  if (schema === true) return []
  if (schema === false) return [`${path}: false schema`]
  if (!isObject(schema)) throw new Error(`${path}: schema must be an object or boolean`)

  if (typeof schema.$ref === 'string') {
    return validateSchemaValue(value, resolveLocalRef(root, schema.$ref), root, path)
  }

  const errors: string[] = []
  const check = (candidate: unknown): boolean => (
    validateSchemaValue(value, candidate, root, path).length === 0
  )

  if (Array.isArray(schema.allOf)) {
    for (const candidate of schema.allOf) {
      errors.push(...validateSchemaValue(value, candidate, root, path))
    }
  }
  if (Array.isArray(schema.anyOf) && !schema.anyOf.some(check)) {
    errors.push(`${path}: does not match anyOf`)
  }
  if (schema.not !== undefined && check(schema.not)) {
    errors.push(`${path}: matches forbidden schema`)
  }
  if (schema.if !== undefined && check(schema.if) && schema.then !== undefined) {
    errors.push(...validateSchemaValue(value, schema.then, root, path))
  }

  if (schema.const !== undefined && !deepEqual(value, schema.const)) {
    errors.push(`${path}: does not equal const`)
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => deepEqual(value, item))) {
    errors.push(`${path}: is not in enum`)
  }

  if (typeof schema.type === 'string' && !matchesType(value, schema.type)) {
    errors.push(`${path}: expected ${schema.type}`)
    return errors
  }

  if (typeof value === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
      errors.push(`${path}: shorter than minLength`)
    }
    if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern, 'u').test(value)) {
      errors.push(`${path}: does not match pattern`)
    }
  }

  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) {
      errors.push(`${path}: below minimum`)
    }
    if (typeof schema.maximum === 'number' && value > schema.maximum) {
      errors.push(`${path}: above maximum`)
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
      errors.push(`${path}: fewer than minItems`)
    }
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) {
      errors.push(`${path}: more than maxItems`)
    }
    if (schema.uniqueItems === true) {
      const encoded = value.map((item) => JSON.stringify(item))
      if (new Set(encoded).size !== encoded.length) errors.push(`${path}: duplicate items`)
    }

    const prefixItems = Array.isArray(schema.prefixItems) ? schema.prefixItems : []
    for (let index = 0; index < Math.min(prefixItems.length, value.length); index += 1) {
      errors.push(...validateSchemaValue(value[index], prefixItems[index], root, `${path}[${index}]`))
    }
    for (let index = prefixItems.length; index < value.length; index += 1) {
      if (schema.items !== undefined) {
        errors.push(...validateSchemaValue(value[index], schema.items, root, `${path}[${index}]`))
      }
    }
  }

  if (isObject(value)) {
    if (Array.isArray(schema.required)) {
      for (const name of schema.required) {
        if (typeof name === 'string' && !(name in value)) errors.push(`${path}: missing ${name}`)
      }
    }

    const properties = isObject(schema.properties) ? schema.properties : {}
    const patternProperties = isObject(schema.patternProperties) ? schema.patternProperties : {}
    const patternEntries = Object.entries(patternProperties).map(([pattern, candidate]) => [
      new RegExp(pattern, 'u'),
      candidate,
    ] as const)

    for (const [name, child] of Object.entries(value)) {
      const childPath = `${path}.${name}`
      let evaluated = false
      if (name in properties) {
        errors.push(...validateSchemaValue(child, properties[name], root, childPath))
        evaluated = true
      }
      for (const [pattern, candidate] of patternEntries) {
        if (pattern.test(name)) {
          errors.push(...validateSchemaValue(child, candidate, root, childPath))
          evaluated = true
        }
      }
      if (!evaluated && schema.additionalProperties !== undefined) {
        errors.push(...validateSchemaValue(child, schema.additionalProperties, root, childPath))
      }
      if (schema.propertyNames !== undefined) {
        errors.push(...validateSchemaValue(name, schema.propertyNames, root, `${childPath}<name>`))
      }
    }
  }

  return errors
}

const manifestSchema: SchemaObject = manifestSchemaJson
const regionSchema: SchemaObject = regionSchemaJson
const chunkId = '0123456789abcdef'.repeat(4)

const validManifest = {
  format: 'glyphweave-map',
  version: 3,
  world: { name: 'Schema Test' },
  axisOrder: 'z,x,y',
  chunkShape: [16, 16, 16],
  regionShape: ['infinite', 32, 32],
  blockRegistry: {
    0: 'glyphweave:air',
    1: 'glyphweave:stone',
    4294967295: 'third-party:unknown/block',
  },
  regions: {
    '-1,0': 'regions/-1.0/region.json',
  },
  metadata: { fixture: 'schema-test' },
}

const validRegion = {
  format: 'glyphweave-region',
  version: 1,
  region: [-1, 0],
  sections: {
    '-1,31,0': chunkId,
  },
  chunks: {
    [chunkId]: {
      bits: 2,
      palette: [0, 1, 4294967295],
      data: `chunks/${chunkId}.bin`,
    },
  },
}

describe('.gemap v3 JSON Schemas', () => {
  it('use JSON Schema 2020-12 and accept representative records', () => {
    expect(manifestSchema.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
    expect(regionSchema.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
    expect(validateSchemaValue(validManifest, manifestSchema, manifestSchema)).toEqual([])
    expect(validateSchemaValue(validRegion, regionSchema, regionSchema)).toEqual([])
  })

  it.each([
    ['wrong map version', { ...validManifest, version: 2 }],
    ['wrong axis order', { ...validManifest, axisOrder: 'x,y,z' }],
    ['wrong chunk shape', { ...validManifest, chunkShape: [32, 16, 16] }],
    ['registry ID above u32', {
      ...validManifest,
      blockRegistry: { ...validManifest.blockRegistry, 4294967296: 'test:overflow' },
    }],
    ['uppercase block name', {
      ...validManifest,
      blockRegistry: { ...validManifest.blockRegistry, 2: 'GlyphWeave:Stone' },
    }],
    ['unsafe region path', {
      ...validManifest,
      regions: { '0,0': '../region.json' },
    }],
    ['legacy layer field', { ...validManifest, layers: [] }],
  ])('rejects invalid manifest: %s', (_name, manifest) => {
    expect(validateSchemaValue(manifest, manifestSchema, manifestSchema)).not.toEqual([])
  })

  it.each([
    ['out-of-range local chunk coordinate', {
      ...validRegion,
      sections: { '0,32,0': chunkId },
    }],
    ['short chunk ID', {
      ...validRegion,
      sections: { '0,0,0': 'abc123' },
    }],
    ['region outside i32 voxel address space', {
      ...validRegion,
      region: [4194304, 0],
    }],
    ['non-minimal bits', {
      ...validRegion,
      chunks: {
        [chunkId]: { bits: 1, palette: [0, 1, 2], data: `chunks/${chunkId}.bin` },
      },
    }],
    ['duplicate palette ID', {
      ...validRegion,
      chunks: {
        [chunkId]: { bits: 1, palette: [1, 1], data: `chunks/${chunkId}.bin` },
      },
    }],
    ['persisted air-only chunk', {
      ...validRegion,
      chunks: {
        [chunkId]: { bits: 1, palette: [0], data: `chunks/${chunkId}.bin` },
      },
    }],
    ['legacy refCount', {
      ...validRegion,
      chunks: {
        [chunkId]: {
          bits: 2,
          palette: [0, 1, 2],
          data: `chunks/${chunkId}.bin`,
          refCount: 1,
        },
      },
    }],
    ['unsafe chunk path', {
      ...validRegion,
      chunks: {
        [chunkId]: { bits: 2, palette: [0, 1, 2], data: '../chunk.bin' },
      },
    }],
  ])('rejects invalid region: %s', (_name, region) => {
    expect(validateSchemaValue(region, regionSchema, regionSchema)).not.toEqual([])
  })

  it('pins every minimal bits to palette-length boundary in the schema', () => {
    const defs = regionSchema.$defs
    expect(isObject(defs)).toBe(true)
    if (!isObject(defs) || !isObject(defs.chunkRecord)) return

    const boundaries = defs.chunkRecord.allOf
    expect(Array.isArray(boundaries)).toBe(true)
    expect(boundaries).toHaveLength(12)
  })
})
