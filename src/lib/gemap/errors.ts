export type GemapErrorCategory =
  | 'container.duplicate_entry'
  | 'container.invalid_zip'
  | 'container.missing_entry'
  | 'container.resource_limit'
  | 'container.unsafe_path'
  | 'container.unsupported_feature'
  | 'encoding.invalid_json'
  | 'encoding.invalid_utf8'
  | 'integrity.chunk_binary_length'
  | 'integrity.chunk_hash_mismatch'
  | 'integrity.palette_index'
  | 'migration.duplicate_layer'
  | 'migration.invalid_coordinate'
  | 'migration.invalid_json'
  | 'migration.invalid_legacy'
  | 'migration.unsupported_version'
  | 'schema.invalid_manifest'
  | 'schema.invalid_region'
  | 'semantic.invalid_chunk'
  | 'semantic.invalid_manifest'
  | 'semantic.invalid_region'

export class GemapError extends Error {
  readonly category: GemapErrorCategory

  readonly location?: string

  constructor(
    category: GemapErrorCategory,
    message: string,
    options?: { cause?: unknown; location?: string },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'GemapError'
    this.category = category
    this.location = options?.location
  }
}

export function gemapFail(
  category: GemapErrorCategory,
  message: string,
  options?: { cause?: unknown; location?: string },
): never {
  throw new GemapError(category, message, options)
}
