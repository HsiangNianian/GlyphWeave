# `.gemap` conformance corpus

This directory is the shared, language-neutral test corpus for the v2-to-v3
migration and the v3 ZIP codec. Rust and TypeScript implementations must use
the same files and the same error categories from `expectations.json`.

## Layout

```text
fixtures/gemap/
├── definitions.json          # Hand-auditable v3 logical source cases
├── expectations.json         # Exact logical results, hashes, and errors
├── generate.py               # Deterministic expanded/ZIP fixture builder
├── SHA256SUMS                 # SHA-256 of every v3 fixture container
├── v2/                       # Legacy JSON inputs (despite .gemap suffix)
├── v3-valid/                 # Exchange-format ZIP containers
├── v3-invalid/               # Deliberately malformed ZIP containers
└── expanded/                 # Reviewable JSON/bin contents and recipes
```

The ZIP files are the actual conformance inputs. Expanded directories are
review aids and are not valid exchange-format `.gemap` files. Duplicate-entry
and compression-limit cases cannot be represented by a normal directory, so
their expanded directories contain a generation recipe instead.

## Golden valid cases

| Case | Contract covered |
|---|---|
| `empty-world` | No region means the entire world is air |
| `one-block-origin` | Origin mapping, 1-bit packing, canonical hash |
| `negative-boundaries` | `-1`, `-16`, `-17`, `-512`, `-513` on z, x, and y |
| `multi-palette-cross-byte` | Five-entry palette and 3-bit indices spanning bytes |
| `shared-sections` | Two sections in one region reference one chunk record |
| `independent-regions` | Equal content is stored independently in two regions |
| `unknown-namespaced-block` | Unknown block identity survives without becoming air |

`expectations.json` records the exact non-air `(z,x,y,blockName)` values,
section-to-hash mappings, canonical palettes, bit widths, packed byte prefixes,
binary SHA-256 values, reference counts, and archive SHA-256 values.

## Legacy conversion cases

- `flat-v1.gemap` has no explicit version or layers. Missing version is treated
  as v1. `void` is air and `mysteryTile` must survive as
  `legacy:mystery-tile`.
- `layered-v2.gemap` pins bottom-to-top composition, hidden-layer skipping,
  `layerTiles` precedence over `tiles`, null/void handling, overwrite counts,
  preserve-layer z assignment, and unknown ID reporting.

Both `flatten` and `preserve-layers` outcomes are fully listed in
`expectations.json`. Logical coordinate arrays are always `[z, x, y]`.

## Invalid cases and error categories

| Case | Required error category |
|---|---|
| `corrupt-hash` | `integrity.chunk_hash_mismatch` |
| `truncated-binary` | `integrity.chunk_binary_length` |
| `bad-path` | `container.unsafe_path` |
| `duplicate-entry` | `container.duplicate_entry` |
| `zip-bomb-limit` | `container.resource_limit` |

The compression-limit case is intentionally bounded: it expands to 1 MiB of
zero bytes. Conformance tests use the limits recorded in `expectations.json`:
128 entries, 256 KiB per entry, 512 KiB total, and a 100:1 maximum compression
ratio. Readers must inspect and bound every entry, including unreferenced
entries, before accepting a container. Do not extract invalid fixtures with a
general-purpose archive command as part of a test.

## Regeneration and verification

Verify the committed containers from the repository root:

```bash
sha256sum --check fixtures/gemap/SHA256SUMS
cd fixtures/gemap/v2 && sha256sum --check SHA256SUMS
```

Regenerate only after changing `definitions.json`, a legacy input, or the
generator, then review every checksum change:

```bash
python3 fixtures/gemap/generate.py
git diff -- fixtures/gemap
```

The generator uses sorted JSON keys and ZIP entries, fixed 1980 timestamps,
fixed Unix file modes, DEFLATE for JSON, and STORE for normal chunk binaries.
It contains a small standard-library-only BLAKE3 implementation and refuses to
run unless it matches the official empty-string and `abc` vectors.

Committed ZIP files and their checksums are normative. Deflate output may vary
between zlib implementations, so regenerate the binary corpus only as an
intentional protocol-fixture change. Canonical chunk bytes and BLAKE3 IDs must
remain identical across implementations even when a different ZIP library
cannot reproduce the complete archive byte-for-byte.
