# GlyphWeave `.gemap` v3 Voxel Storage Plan

**Goal:** Replace the JSON-only 2D layer format with a ZIP-contained 3D voxel
world format shared by Bevy, the React editor, and server tooling, while
providing an explicit converter for existing v1/v2 maps.

**Migration rule:** Layers are legacy compositing state, not voxel height. The
default converter composites visible legacy layers and writes the result to
`z = 0`. An opt-in archival mode maps layer order to consecutive `z` values,
but that mapping is migration metadata and never part of the v3 world model.

**Transition UI:** Both editors initially expose a 2D slice at `activeZ`. This
lets the storage and state models become truly 3D before a dedicated 3D renderer
is ready.

**Rendering direction:** `.gemap` describes the world, not its final visual
presentation. The editor uses z-slices for precise authoring. The Bevy runtime
uses a player-facing game renderer, with an isometric 2.5D roguelike view as the
default product direction rather than presenting the world as a voxel editor.

## 1. Decisions to freeze before implementation

### 1.1 Container

- `.gemap` is a ZIP container, not a directory and not plain JSON.
- The required root entry is `manifest.json`.
- Entry names use `/`, are relative, and must not contain empty segments, `.`
  segments, `..`, backslashes, drive prefixes, or NUL bytes.
- Duplicate ZIP entry names are invalid.
- JSON is UTF-8. JSON files use DEFLATE; chunk binaries may use STORE or
  DEFLATE.
- Readers must impose limits on entry count, individual uncompressed size,
  total uncompressed size, and compression ratio.
- Parsers must not depend on ZIP entry ordering.

Expanded directories may be used by development tools, but only the ZIP
container is the exchange format.

### 1.2 Manifest

`manifest.json` is the only container entry point:

```json
{
  "format": "glyphweave-map",
  "version": 3,
  "world": {
    "name": "Grand Realm of Aethra"
  },
  "axisOrder": "z,x,y",
  "chunkShape": [16, 16, 16],
  "regionShape": ["infinite", 32, 32],
  "blockRegistry": {
    "0": "glyphweave:air",
    "1": "glyphweave:wall",
    "2": "glyphweave:floor"
  },
  "regions": {
    "0,0": "regions/0.0/region.json"
  }
}
```

Rules:

- `format` and `version` are mandatory and strictly validated.
- Block ID `0` is permanently reserved for `glyphweave:air`.
- Numeric block IDs are unsigned 32-bit integers serialized as decimal object
  keys. They are archive-local palette codes, not stable block identities. An
  ID has one meaning within an archive; a full rewrite may rebuild the numeric
  registry. The namespaced block name is the stable identity.
- Block names are stable, namespaced identifiers matching
  `[a-z0-9_.-]+:[a-z0-9_./-]+`.
- `axisOrder`, `chunkShape`, and `regionShape` are mandatory in v3 even though
  v3 readers only accept the frozen values. This makes incompatible files fail
  explicitly.
- Rendering preferences such as theme and `activeZ` are optional metadata, not
  voxel semantics.
- Pixel `tileSize`, layers, visibility, locking, and active layer are not v3
  world fields.

### 1.3 Coordinates

- Public coordinate order is always `(z, x, y)`.
- Chunk shape is `16 × 16 × 16` voxels.
- A region contains all `cz` values and `32 × 32` horizontal chunks.
- Signed coordinate decomposition uses Euclidean/floor division and modulo.
- Region keys are `"rx,ry"`; section keys are `"cz,rcx,rcy"`.
- Local voxel order is `voxelIndex = ((lz * 16) + ly) * 16 + lx`.

Golden tests must cover `-1`, `-16`, `-17`, `-512`, and `-513` on every axis.

### 1.4 Region and chunk records

```json
{
  "format": "glyphweave-region",
  "version": 1,
  "region": [0, 0],
  "sections": {
    "0,0,0": "5ef1..."
  },
  "chunks": {
    "5ef1...": {
      "bits": 2,
      "palette": [1, 4, 9],
      "data": "chunks/5ef1....bin"
    }
  }
}
```

Rules:

- `palette[index]` returns the global block ID. Do not persist the inverse map.
- Air-only sections are absent.
- `bits = max(1, ceil(log2(palette.length)))` and must be minimal.
- Palette length must be in `1..=2^bits`; decoded indices outside the palette
  are invalid.
- Packed indices are little-endian at the bit level as specified in
  `gemap-storage.md`; unused high bits in the final byte are zero.
- `refCount` is derived from `sections` and is never persisted.
- Chunk references and deduplication are region-local.

### 1.5 Canonical chunk identity

Use BLAKE3 over exactly:

```text
ASCII "GEMAP-CHUNK-V1\0"
palette length: u32 little-endian
palette entries: repeated u32 little-endian
bits: u8
packed data: exact bytes
```

Before hashing:

1. Decode every voxel to its global block ID.
2. Remove unused palette entries.
3. Sort used global block IDs ascending.
4. Re-index and repack with minimal `bits`.

The chunk ID is the full lowercase 64-character BLAKE3 hex digest. A reader
must verify that referenced content hashes to its declared ID.

### 1.6 Error policy

- Missing region: the whole region is air.
- Missing section: that section is air.
- A referenced but missing region file, chunk record, or chunk binary is file
  corruption and must return an error; it must not silently become air.
- Unknown optional JSON fields are ignored and preserved only when a future
  extension mechanism explicitly requires round-tripping.
- Unsupported versions fail without guessing.
- Unknown registered block names remain valid data. Rendering may use a missing
  block placeholder, but saving must not rewrite them to air.

## 2. Legacy conversion contract

Legacy detection happens before v3 parsing:

- ZIP magic plus `manifest.json` means v3.
- A JSON object containing `tiles` or `layerTiles` means legacy v1/v2.
- Other input is rejected.

### 2.1 Default `flatten` mode

For every `(x, y)`:

1. Traverse legacy layers in their stored bottom-to-top order.
2. Ignore hidden layers to match the legacy rendered result.
3. Let each non-null, non-`void` tile replace the current value.
4. Map the winning tile ID to a namespaced block name.
5. Write it at `(z = 0, x, y)`.

If a hidden layer contains data, the converter emits a warning with its layer
name and tile count. The conversion report records overwritten tile counts,
unknown tile IDs, skipped hidden layers, source version, and mode.

### 2.2 Opt-in `preserve-layers` mode

- Stored layer index `i` maps to `z = i`.
- Hidden layers are included.
- Null and `void` cells become air.
- The layer-to-z table is written to migration metadata.
- The converter warns that the result preserves data but does not infer valid
  3D spatial semantics.

### 2.3 Block mapping

- Known legacy tile `id` becomes `glyphweave:<normalized-id>` through an
  explicit checked mapping table, not an unchecked string transform.
- Unknown IDs become stable `legacy:<normalized-id>` blocks and are reported;
  they are never discarded.
- Legacy `theme`, `themeId`, `tileSize`, layer names, and source filename may be
  retained under `metadata/migration.json`, but are not core world fields.

## 3. Repository architecture

The Rust implementation is the normative codec and conversion implementation.
TypeScript must implement the same format from the schema and golden fixtures;
neither runtime imports the other's internal state model.

Planned additions:

```text
schemas/
├── gemap-v3-manifest.schema.json
└── gemap-v3-region.schema.json
fixtures/gemap/
├── v2/
├── v3-valid/
└── v3-invalid/
bevy/crates/core/src/
├── voxel/
│   ├── coords.rs
│   ├── chunk.rs
│   ├── region.rs
│   └── world.rs
├── storage/
│   ├── bitpack.rs
│   ├── canonical.rs
│   ├── manifest.rs
│   ├── reader.rs
│   └── writer.rs
└── migration/
    └── v2.rs
src/lib/gemap/
├── types.ts
├── bitpack.ts
├── reader.ts
├── writer.ts
└── migrate-v2.ts
```

Exact module boundaries may be adjusted during implementation, but codec code
must stay independent of Bevy ECS, React, Zustand, Konva, and server rendering.

## 4. Implementation phases

### Phase 0 — Freeze specification and fixtures

1. Rewrite `gemap-storage.md` as the normative v3 specification using the
   decisions in section 1.
2. Add JSON Schemas for manifest and region JSON.
3. Commit hand-auditable golden fixtures:
   - empty world;
   - one block at the origin;
   - negative coordinates across every boundary;
   - multi-palette chunk with indices crossing byte boundaries;
   - two identical sections sharing one region-local chunk;
   - identical chunks in two regions stored independently;
   - unknown namespaced block;
   - corrupt hash, truncated binary, bad path, duplicate entry, and ZIP bomb
     limit cases.
4. Record exact SHA-256 checksums for fixture containers so accidental binary
   changes are visible in review.

**Exit:** The spec determines every output byte needed for canonical chunks,
and valid/invalid fixtures have expected outcomes documented.

### Phase 1 — Rust 3D core model

1. Introduce `VoxelCoord`, `ChunkCoord`, `RegionCoord`, and local coordinate
   types rather than passing ambiguous `(i32, i32, i32)` tuples broadly.
2. Replace the 2D `ChunkGrid` source of truth with sparse 3D chunks of 4096
   global block IDs or stable runtime block keys.
3. Add a block registry that preserves unknown names and separates runtime keys
   from serialized numeric IDs.
4. Implement `get`, `set`, `erase`, sparse chunk removal, iteration, and bounds.
5. Keep the old 2D world types temporarily under a legacy/migration module.

**Tests:** Every action, negative-coordinate boundary, chunk allocation/removal,
registry round-trip, and unknown block preservation.

**Exit:** `glyphweave-core` can represent an unbounded sparse voxel world with
no Bevy dependency.

### Phase 2 — Rust v3 codec

1. Implement bit packing/unpacking with validation.
2. Implement palette canonicalization and BLAKE3 identity.
3. Implement region serialization and region-local deduplication.
4. Implement safe ZIP reading with resource limits and path validation.
5. Implement deterministic ZIP writing. Determinism includes sorted manifest
   keys/entries and fixed ZIP timestamps/metadata where supported.
6. Write to a temporary destination and atomically replace the target on native
   platforms.

Dependencies should be narrowly scoped: a maintained ZIP crate and `blake3` in
`glyphweave-core`; no Bevy dependency enters the codec.

**Tests:** Golden-byte tests, property tests for bit packing, semantic
round-trips, corruption tests, and deterministic output tests.

**Exit:** Rust reads every valid fixture, rejects every invalid fixture, and
produces canonical files matching the fixtures.

### Phase 3 — Legacy converter and CLI

1. Move the current `GemapFile` v2 parser into `migration/v2`.
2. Implement `flatten` and `preserve-layers` as pure conversions.
3. Return a structured `MigrationReport`; do not print warnings inside core.
4. Add a small CLI with:

```text
glyphweave convert old.gemap new.gemap
glyphweave convert --mode flatten old.gemap new.gemap
glyphweave convert --mode preserve-layers old.gemap new.gemap
glyphweave inspect world.gemap
glyphweave validate world.gemap
glyphweave compact world.gemap
```

5. Test against all committed example maps and record tile/block counts before
   and after conversion.

**Exit:** Every repository v1/v2 example converts deterministically, reloads as
v3, and produces a report explaining all loss or ambiguity.

### Phase 4 — Bevy integration using z slices

1. Replace `WorldModel(pub core::World)` with the voxel world model.
2. Add `active_z: i32` as editor state, not serialized world data.
3. Adapt brush, erase, fill, undo/redo, cursor mapping, and render sync to edit
   `(activeZ, x, y)`.
4. Render the active z slice through the existing 2D tilemap pipeline first.
5. Add commands/UI to increment, decrement, and directly enter `activeZ`.
6. Replace native load/save with v3 ZIP load/save; keep legacy import routed
   through the converter.
7. Ensure WASM file I/O loads and downloads one `.gemap` Blob.

**Exit:** Native and WASM Bevy builds edit arbitrary z slices, save v3, reload
without loss, and import v2 via an explicit migration dialog/report.

### Phase 4A — Bevy game rendering architecture

The editor viewport and the final game viewport are separate consumers of the
same voxel world:

```text
VoxelWorld
├── SliceEditorRenderer
├── AsciiGameRenderer
├── PixelGameRenderer
└── Voxel3dGameRenderer
```

The default game direction is an isometric 2.5D roguelike: Dwarf Fortress-like
vertical world structure, Project Zomboid-like floor/roof occlusion, and the
high information density of Cogmind or Caves of Qud. These references describe
rendering and interaction goals only; they do not add fields to `.gemap`.

Implementation order:

1. Keep `SliceEditorRenderer` on the existing tilemap path for authoring.
2. Add a game-view extraction pass that derives visible floors, walls, cliffs,
   roofs, and water surfaces from nearby voxels.
3. Render static terrain as chunk-level meshes or batched instances, never one
   Bevy entity per voxel.
4. Render actors, items, effects, and gameplay indicators separately from the
   static voxel surface.
5. Hide roofs when the player enters an interior and fade or cut away foreground
   walls that obscure the player.
6. Apply fog of war and line-of-sight after surface extraction so hidden voxel
   data does not leak through rendering.
7. Keep ASCII, pixel, and full voxel 3D presentations replaceable behind a
   renderer boundary; block identity and gameplay state remain unchanged.

Protocol coordinates map into Bevy at the adapter boundary:

```text
protocol (z, x, y) -> Bevy Vec3(x, z, y)
```

The protocol's height axis is therefore Bevy's Y axis. Camera orientation and
screen-space conventions must not alter stored coordinates.

**Exit:** Gameplay uses a dedicated isometric view with correct floor, roof,
wall-occlusion, actor, and fog behavior, while editor slice rendering remains
available as an authoring/debug mode.

### Phase 5 — React integration using z slices

1. Replace layer-indexed tiles in Zustand with a voxel/slice-aware store.
2. Replace layer UI with elevation controls; do not relabel layers as height.
3. Add a browser ZIP codec using a small audited dependency or platform ZIP
   support if sufficiently portable.
4. Implement v3 import/export and v2 detection/conversion.
5. Keep rendering on the current Konva canvas for `activeZ`.
6. Update history transactions to include `z`.
7. Preserve unknown block names in state even when the palette renders a
   placeholder.

**Exit:** React and Bevy can alternately edit and save the same golden world
without semantic changes.

### Phase 6 — Server and public API migration

1. Update upload parsing to accept ZIP `.gemap` safely.
2. Decide API behavior explicitly:
   - rendering requires an explicit `z` query parameter;
   - conversion endpoints return v3 ZIP for `format=gemap`;
   - legacy JSON remains input-only for a documented deprecation window.
3. Stream or bound archive extraction; never extract untrusted paths to disk.
4. Update API documentation and examples.

**Exit:** Development server, Node production server, and Worker behavior agree
on v3 detection, validation, z-slice rendering, and limits.

### Phase 7 — Remove v2 runtime model

1. Remove 2D layers from normal editor state and Bevy core.
2. Retain only the isolated v2 reader/converter.
3. Convert repository examples to v3 and keep a minimal v2 fixture set.
4. Update README files, API docs, generators, benchmarks, and deployment tests.
5. Re-run `pnpm doc-tree:check` after all file additions/removals and update
   `AGENTS.md` when required.

**Exit:** All normal writes are v3; legacy code cannot be reached except through
the explicit import/conversion path.

## 5. Cross-language conformance gate

CI must run both implementations over the same fixture corpus:

1. Rust and TypeScript accept the same valid fixtures.
2. Rust and TypeScript reject the same invalid fixtures by error category.
3. Both decode to the same logical `(z, x, y, blockName)` records.
4. Both canonicalize every region to the same palettes, packed bytes, and chunk
   hashes.
5. `Rust write → TS read → TS write → Rust read` is semantically identical.
6. Unknown blocks survive every round trip.
7. v2 flatten conversion produces identical output records and migration
   reports in both languages.

The Rust writer is normative when byte-identical ZIP output is impractical
across ZIP libraries; chunk canonical bytes and hashes remain byte-identical.

## 6. Delivery and commit sequence

Keep changes reviewable with conventional commits:

1. `docs(types): define gemap v3 storage format`
2. `test(types): add gemap conformance fixtures`
3. `feat(types): add voxel world model`
4. `feat(types): add gemap v3 codec`
5. `feat(types): add legacy map converter`
6. `refactor(canvas): edit voxel z slices`
7. `refactor(bevy): adopt voxel world storage`
8. `feat(server): support gemap v3 archives`
9. `docs: document gemap v3 migration`

Each implementation commit must pass the relevant subset of:

```bash
pnpm lint
pnpm typecheck
pnpm test
cargo fmt --manifest-path bevy/Cargo.toml --check
cargo clippy --manifest-path bevy/Cargo.toml --workspace --all-targets -- -D warnings
cargo test --manifest-path bevy/Cargo.toml --workspace
pnpm doc-tree:check
```

## 7. Deliberately deferred work

The following must not block v3 storage:

- full 3D voxel rendering;
- final game art direction and renderer selection;
- lighting, meshing, physics, and simulation persistence;
- entities, decals, inventories, and block component data;
- network streaming and collaborative editing;
- cross-region chunk deduplication;
- incremental in-place mutation of ZIP containers.

These features require extension designs after the core voxel identity and
container rules are stable. They must not be smuggled into unspecified fields
in the initial v3 format.
