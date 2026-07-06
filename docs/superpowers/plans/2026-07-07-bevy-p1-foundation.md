# GlyphWeave Bevy P1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `cargo run` desktop app that loads `examples/grand-realm-of-aethra.gemap`, renders 3 stacked ANSI-16 tile layers (Terrain / Structures / Details) with bevy_ecs_tilemap, supports brush/erase painting on layer-1, zoom-to-cursor + drag pan, a minimal egui overlay, and round-trip save back to `.gemap` v2 — all backed by a bevy-free, fully unit-tested `glyphweave-core` crate.

**Architecture:** Two crates under `bevy/`: `glyphweave-core` (zero Bevy dependency: `TileKind`, `ChunkGrid`, `World`, `.gemap` serde, `Edit::apply`) is the source of truth and is exhaustively unit-tested with a test-first (RED→PASS) cycle in every module, including a round-trip integration test against the real example map. `glyphweave-app` (Bevy bin) wraps `core::World` in a `WorldModel` Resource, builds a bounded `TilemapBundle` per visible layer (one tile entity for every cell in the union bounds, so every editable coordinate has an entity) from a committed pre-rendered atlas.png (26 cells × 24 px), syncs render state from `EditEvent` messages, and overlays egui read-outs. Render is a pure view of core state; all edits flow core-first. Pure view math (bounds computation, cursor→tile, atlas indexing) is extracted into free functions and unit-tested.

**Tech Stack:** bevy 0.18.1, bevy_ecs_tilemap 0.18 (with the `atlas` feature enabled), bevy_egui 0.39.1, serde/serde_json/thiserror, rustc >=1.89, edition 2024.

**Verified example-map facts (load-bearing):** `examples/grand-realm-of-aethra.gemap` is version 2, `worldName = "Grand Realm of Aethra"`, `tileSize = 24`, has **3 layers** (`layer-1` Terrain / `layer-2` Structures / `layer-3` Details), carries BOTH a flat `tiles` map (9600 entries) and a `layerTiles` map (layer-1: 9600, layer-2: 756, layer-3: 460). All coordinates are in `[0,119] × [0,79]` (no negatives). The loader's `layerTiles` branch takes precedence on load.

## 0. Prerequisites

- [ ] Install rustup stable toolchain >= 1.89.0: `rustup default stable && rustc --version` (must print >= 1.89.0). Edition 2024 requires rustc >= 1.85; the pinned crate graph requires >= 1.89.
- [ ] Install Linux system deps for bevy + bevy_egui (Arch): `sudo pacman -S vulkan-tools libxcb pkgconf` (provides `libxcb-render`, `libxcb-shape`, `libxcb-xfixes` and the `xcb` system library + `.pc` files). Debian/Ubuntu equivalent: `sudo apt install libvulkan1 mesa-vulkan-drivers libxcb-render0-dev libxcb-shape0-dev libxcb-xfixes0-dev pkg-config`.
- [ ] Verify Vulkan: `vulkaninfo --summary` should list a GPU.
- [ ] Clone / position at repo root `/home/hsiangnianian/GITPROJECT/GlyphWeave` on branch `dev`.
- [ ] NOTE: the existing React app under `src/` is KEPT as product/visual reference. Do NOT edit anything under `src/`.
- [ ] NOTE (corrected): the pre-commit hook at `.githooks/pre-commit` runs `scripts/generate-tree.mjs --check`, which validates the directory-tree blocks embedded in `AGENTS.md` against the real working tree — it is NOT scoped to `src/`. Adding any new top-level directory (such as `bevy/`) makes that documented tree stale and the hook will reject the commit with `[FAIL] Directory tree in AGENTS.md is outdated.` Therefore, before the first commit that adds `bevy/`, you MUST regenerate the tree: `pnpm doc-tree` (or `node scripts/generate-tree.mjs`) and stage `AGENTS.md` alongside the scaffold. Re-run `pnpm doc-tree` and stage `AGENTS.md` whenever you add new directories under `bevy/`.
- [ ] All commits use scope `bevy` and Conventional Commits format, lowercase imperative subject <= 50 chars, no trailing period. Example: `feat(bevy): scaffold bevy workspace`.

---

### Task 1: Scaffold `bevy/` workspace + crates + clean compile boundary

**Files:**
- Create `bevy/Cargo.toml`
- Create `bevy/crates/core/Cargo.toml`
- Create `bevy/crates/core/src/lib.rs`
- Create `bevy/crates/app/Cargo.toml`
- Create `bevy/crates/app/src/main.rs`
- Create `bevy/.gitignore`

- [ ] Create `bevy/Cargo.toml` (workspace root, resolver 3, pinned deps; note `bevy_ecs_tilemap` enables the `atlas` feature so no array-texture preprocessing step is needed at runtime):

```toml
[workspace]
resolver = "3"
members = ["crates/core", "crates/app"]

[workspace.package]
version = "0.1.0"
edition = "2024"
rust-version = "1.89.0"
license = "MIT"
repository = "https://github.com/HsiangNianian/GlyphWeave"

[workspace.dependencies]
bevy = "0.18.1"
bevy_ecs_tilemap = { version = "0.18", features = ["atlas"] }
bevy_egui = "0.39.1"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "2"
glyphweave-core = { path = "crates/core" }
```

- [ ] Create `bevy/crates/core/Cargo.toml`:

```toml
[package]
name = "glyphweave-core"
version.workspace = true
edition.workspace = true
rust-version.workspace = true
license.workspace = true

[dependencies]
serde = { workspace = true }
serde_json = { workspace = true }
thiserror = { workspace = true }
```

- [ ] Create `bevy/crates/core/src/lib.rs` (intentionally has NO modules yet — modules are added incrementally in Tasks 3–10 so each task is a clean compile boundary):

```rust
//! GlyphWeave core: pure logic, no Bevy dependency.
//! Modules are added incrementally in subsequent tasks.
```

- [ ] Create `bevy/crates/app/Cargo.toml`:

```toml
[package]
name = "glyphweave-app"
version.workspace = true
edition.workspace = true
rust-version.workspace = true
license.workspace = true

[[bin]]
name = "glyphweave"
path = "src/main.rs"

[dependencies]
bevy = { workspace = true }
bevy_ecs_tilemap = { workspace = true }
bevy_egui = { workspace = true }
glyphweave-core = { workspace = true }
serde_json = { workspace = true }
```

- [ ] Create `bevy/crates/app/src/main.rs` (single, final Task-1 version: opens a window, registers plugins, prints FPS via egui). Uses `if let Ok(ctx)` to avoid depending on the exact `ctx_mut()` return type:

```rust
use bevy::diagnostic::{DiagnosticsStore, FrameTimeDiagnosticsPlugin};
use bevy::prelude::*;
use bevy_ecs_tilemap::prelude::TilemapPlugin;
use bevy_egui::{egui, EguiContexts, EguiPlugin, EguiPrimaryContextPass};

fn main() {
    App::new()
        .add_plugins(
            DefaultPlugins
                .set(WindowPlugin {
                    primary_window: Some(Window {
                        title: "GlyphWeave".into(),
                        resolution: (1280.0, 720.0).into(),
                        ..default()
                    }),
                    ..default()
                })
                .set(ImagePlugin::default_nearest()),
        )
        .add_plugins(FrameTimeDiagnosticsPlugin::default())
        .add_plugins(EguiPlugin::default())
        .add_plugins(TilemapPlugin)
        .add_systems(Startup, setup_camera)
        .add_systems(EguiPrimaryContextPass, fps_overlay)
        .run();
}

fn setup_camera(mut commands: Commands) {
    commands.spawn(Camera2d);
}

fn fps_overlay(mut contexts: EguiContexts, diagnostics: Res<DiagnosticsStore>) {
    let fps = diagnostics
        .get(&bevy::diagnostic::FrameTimeDiagnosticsPlugin::FPS)
        .and_then(|d| d.smoothed())
        .map(|v| format!("{v:.1}"))
        .unwrap_or_else(|| "—".into());
    if let Ok(ctx) = contexts.ctx_mut() {
        egui::TopBottomPanel::top("fps").show(ctx, |ui| {
            ui.label(format!("FPS: {fps}"));
        });
    }
}
```

- [ ] Create `bevy/.gitignore`:

```gitignore
/target
**/*.rs.bk
Cargo.lock
```

- [ ] Run: `cargo check --manifest-path bevy/Cargo.toml` — expect: compiles cleanly (downloads crates; first run is slow).
- [ ] Run smoke: `cargo run --manifest-path bevy/Cargo.toml -p glyphweave-app` — expect: a 1280x720 window titled "GlyphWeave" opens with "FPS: <number>" in a top egui panel. Close the window.
- [ ] Before committing: the new `bevy/` directory makes the documented tree in `AGENTS.md` stale. Regenerate and stage it: run `pnpm doc-tree` (prints the current tree for reference), then edit the tree block(s) in `AGENTS.md` to include the new `bevy/` subtree, then `git add AGENTS.md`. (If you prefer, set `DOC_TREE_WARN=1` for this commit only, but the tree MUST be reconciled by the end of Task 19.)
- [ ] Commit (stage `bevy/` + `AGENTS.md`): `chore(bevy): scaffold bevy workspace`

---

### Task 2: API verification spike (resolve every bevy 0.18 API question up front)

**Why:** Several symbols used later (`add_message`, `MessageReader`/`MessageWriter`, `TilemapBundle { ..default() }`, `EguiPrimaryContextPass` + `ctx_mut()`, `AccumulatedMouseScroll`, `bevy::image::Image`, `TilePos::from_world_pos`) are version-sensitive. This task compiles a throwaway check so every later task can state a confirmed symbol and contain no "verify at docs.rs" hedges.

**Files:** Create `bevy/crates/spike/Cargo.toml`, `bevy/crates/app/src/../spike.rs` is NOT added to the real bin; instead a temporary standalone check. Simplest: add a `spike` member that we delete at the end of the task.

- [ ] Add a temporary member to `bevy/Cargo.toml` workspace `members`: append `"crates/spike"`. Create `bevy/crates/spike/Cargo.toml`:

```toml
[package]
name = "gw-spike"
version.workspace = true
edition.workspace = true
rust-version.workspace = true
license.workspace = true

[dependencies]
bevy = { workspace = true }
bevy_ecs_tilemap = { workspace = true }
bevy_egui = { workspace = true }
```

- [ ] Create `bevy/crates/spike/src/main.rs` — a non-running program whose only job is to compile-reference every uncertain symbol:

```rust
// SPIKE: throwaway. Verifies bevy 0.18 / bevy_ecs_tilemap 0.18 / bevy_egui 0.39 symbols compile.
// Not run, only `cargo check`. Deleted at the end of Task 2.
#![allow(dead_code, unused_imports)]
use bevy::input::mouse::AccumulatedMouseScroll;
use bevy::prelude::*;
use bevy::image::Image;
use bevy_ecs_tilemap::prelude::*;
use bevy_egui::{EguiContexts, EguiPlugin, EguiPrimaryContextPass};

#[derive(Message, Clone, Copy, Debug)]
struct EditEvent { x: i32, y: i32 }

fn msg_writer(w: bevy::ecs::message::MessageWriter<EditEvent>) { let _ = w; }
fn msg_reader(r: bevy::ecs::message::MessageReader<EditEvent>) { let _ = r; }

fn acc_scroll(a: Res<AccumulatedMouseScroll>) {
    let _l = a.line.y;
    let _p = a.pixel.y;
}

fn tilemap_build(atlas: Handle<Image>, commands: Commands) {
    let map_size = TilemapSize { x: 1, y: 1 };
    let storage = TileStorage::empty(map_size);
    let _bundle = TilemapBundle {
        grid_size: TilemapGridSize { x: 24.0, y: 24.0 },
        map_type: TilemapType::default(),
        size: map_size,
        spacing: TilemapSpacing::default(),
        storage,
        texture: TilemapTexture::Single(atlas),
        tile_size: TilemapTileSize { x: 24.0, y: 24.0 },
        transform: Transform::default(),
        anchor: TilemapAnchor::TopLeft,
        ..default()
    };
    let _ = commands;
}

fn projection_check() {
    // TilePos::from_world_pos helper existence + signature.
    let p = Vec2::ZERO;
    let ms = TilemapSize { x: 1, y: 1 };
    let gs = TilemapGridSize { x: 24.0, y: 24.0 };
    let ts = TilemapTileSize { x: 24.0, y: 24.0 };
    let mt = TilemapType::default();
    let an = TilemapAnchor::TopLeft;
    let _ = TilePos::from_world_pos(&p, &ms, &gs, &ts, &mt, &an);
}

fn egui_check(ctx: EguiContexts) {
    let _ = ctx.ctx_mut();
}

fn main() {
    let mut app = App::new();
    app.add_plugins(MinimalPlugins)
        .add_plugins(EguiPlugin::default())
        .add_plugins(TilemapPlugin)
        .add_message::<EditEvent>();
}
```

- [ ] Run: `cargo check --manifest-path bevy/Cargo.toml -p gw-spike` — expect: compiles. If a symbol fails:
  - `AccumulatedMouseScroll` field names (`line`/`pixel`): inspect the compiler error for the actual field names and update Task 15's `zoom_to_cursor` accordingly before proceeding.
  - `TilePos::from_world_pos` signature: if the argument list or return type differs (e.g. returns `Option<TilePos>` vs a tuple), record the confirmed form and update Task 16's `update_cursor_tile` to match.
  - `TilemapAnchor::TopLeft`: if absent, switch to `TilemapAnchor::Center` everywhere and add `+ Vec2::new(width*tpx/2.0, -height*tpx/2.0)` to the tilemap transform origin (documented in Task 13).
  - `EguiPrimaryContextPass`: if bevy_egui 0.39 names the system set differently, use the confirmed name in Tasks 1/17.
  - `ctx_mut()` return: the spike uses `let _ = ctx.ctx_mut();` which accepts both `Option` and `Result`; the app code uses `if let Ok(ctx)` (works if it returns `Result`; if it returns `Option`, change to `if let Some(ctx)`).
  - `add_message` not found: substitute the confirmed registrar (it is `add_message::<T>()` on `App` in 0.18).
- [ ] Record the confirmed symbols in a one-line comment at the top of `bevy/crates/spike/src/main.rs` (e.g. `// CONFIRMED: TilePos::from_world_pos returns Option<TilePos>; ctx_mut() returns Result; AccumulatedMouseScroll{line,pixel}`).
- [ ] Delete the spike: remove `"crates/spike"` from `bevy/Cargo.toml` members and `rm -rf bevy/crates/spike`. Run `cargo check --manifest-path bevy/Cargo.toml` — expect: compiles (workspace back to core+app).
- [ ] Commit: `chore(bevy): verify bevy 0.18 api in throwaway spike`

---

### Task 3: `core/error.rs` — `CoreError` via thiserror (RED → PASS)

**Discipline:** write the test first referencing a `CoreError` that does not exist yet → observe FAIL → implement → PASS.

**Files:** Create `bevy/crates/core/src/error.rs`; Modify `bevy/crates/core/src/lib.rs`.

- [ ] Modify `bevy/crates/core/src/lib.rs` to register the module:

```rust
//! GlyphWeave core: pure logic, no Bevy dependency.
pub mod error;
```

- [ ] RED: create `bevy/crates/core/src/error.rs` containing ONLY the test module (the `CoreError` type it references does not exist yet):

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_formats() {
        let e = CoreError::UnknownTileId("xyz".into());
        assert_eq!(e.to_string(), "unknown tile id: xyz");
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "missing");
        let from_io: CoreError = io_err.into();
        assert!(matches!(from_io, CoreError::Io(_)));
    }
}
```

- [ ] Run: `cargo test --manifest-path bevy/Cargo.toml -p glyphweave-core error` — expect FAIL (unresolved `CoreError`).
- [ ] PASS: prepend the implementation to `error.rs` so the file becomes:

```rust
use thiserror::Error;

#[derive(Debug, Error)]
pub enum CoreError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("unknown tile id: {0}")]
    UnknownTileId(String),
    #[error("invalid coordinate key '{0}' (expected \"x,y\" with i32 parts)")]
    InvalidCoordKey(String),
    #[error("unsupported gemap version: {0}")]
    UnsupportedVersion(u32),
    /// Reserved for a future layer-mutation API; not constructed in P1.
    #[allow(dead_code)]
    #[error("layer '{0}' not found")]
    UnknownLayer(String),
}

pub type Result<T> = std::result::Result<T, CoreError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_formats() {
        let e = CoreError::UnknownTileId("xyz".into());
        assert_eq!(e.to_string(), "unknown tile id: xyz");
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "missing");
        let from_io: CoreError = io_err.into();
        assert!(matches!(from_io, CoreError::Io(_)));
    }
}
```

(`UnsupportedVersion` is constructed in Task 10's `load_world`; `UnknownLayer` is reserved for P2 and `#[allow(dead_code)]`-tagged so Task 19's `-D warnings` stays clean.)

- [ ] Run: `cargo test --manifest-path bevy/Cargo.toml -p glyphweave-core error` — expect PASS.
- [ ] Commit: `feat(bevy): add core error type`

---

### Task 4: `core/tile.rs` — `TileKind` enum (RED → PASS)

**Notes:** The derive MUST include `Serialize, Deserialize` (variants carry `#[serde(rename = ...)]` and the tests serialize) AND `PartialOrd, Ord` (Task 10's round-trip test collects tiles into a `BTreeSet<(i32, i32, TileKind)>`).

**Files:** Create `bevy/crates/core/src/tile.rs`; Modify `bevy/crates/core/src/lib.rs`.

- [ ] Modify `bevy/crates/core/src/lib.rs`:

```rust
//! GlyphWeave core: pure logic, no Bevy dependency.
pub mod error;
pub mod tile;
```

- [ ] RED: create `bevy/crates/core/src/tile.rs` containing ONLY the test module:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serde_round_trip_stress_ids() {
        for kind in TileKind::ALL {
            let s = serde_json::to_string(&kind).unwrap();
            let id = s.trim_matches('"');
            assert_eq!(id, kind.id(), "serde id mismatch for {:?}", kind);
            let back: TileKind = serde_json::from_str(&s).unwrap();
            assert_eq!(kind, back);
        }
    }

    #[test]
    fn specific_camel_case_ids() {
        assert_eq!(serde_json::to_string(&TileKind::FloorAlt).unwrap(), "\"floorAlt\"");
        assert_eq!(serde_json::to_string(&TileKind::StairsDown).unwrap(), "\"stairsDown\"");
        assert_eq!(serde_json::to_string(&TileKind::DeepWater).unwrap(), "\"deepWater\"");
        assert_eq!(serde_json::to_string(&TileKind::DoorOpen).unwrap(), "\"doorOpen\"");
    }

    #[test]
    fn from_id_known_and_unknown() {
        assert_eq!(TileKind::from_id("floorAlt"), Some(TileKind::FloorAlt));
        assert_eq!(TileKind::from_id("nope"), None);
    }

    #[test]
    fn glyph_matches_spec() {
        assert_eq!(TileKind::Wall.glyph(), '#');
        assert_eq!(TileKind::DeepWater.glyph(), '≈');
        assert_eq!(TileKind::Bar.glyph(), '│');
    }

    #[test]
    fn default_is_void() {
        assert_eq!(TileKind::default(), TileKind::Void);
    }

    #[test]
    fn ord_orders_by_atlas_index() {
        assert!(TileKind::Void < TileKind::Wall);
        assert!(TileKind::Wall < TileKind::Bar);
    }
}
```

- [ ] Run: `cargo test --manifest-path bevy/Cargo.toml -p glyphweave-core tile` — expect FAIL (unresolved `TileKind`).
- [ ] PASS: prepend the implementation so `tile.rs` becomes:

```rust
use serde::{Deserialize, Serialize};

/// 26 tile kinds. Discriminant order = atlas index order (0..26).
/// `Ord` orders by atlas index (natural and correct for derived ordering with `#[repr(u8)]`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Default, Serialize, Deserialize)]
#[repr(u8)]
pub enum TileKind {
    #[default]
    #[serde(rename = "void")]
    Void = 0,
    #[serde(rename = "wall")]
    Wall,
    #[serde(rename = "floor")]
    Floor,
    #[serde(rename = "floorAlt")]
    FloorAlt,
    #[serde(rename = "door")]
    Door,
    #[serde(rename = "doorOpen")]
    DoorOpen,
    #[serde(rename = "water")]
    Water,
    #[serde(rename = "deepWater")]
    DeepWater,
    #[serde(rename = "lava")]
    Lava,
    #[serde(rename = "tree")]
    Tree,
    #[serde(rename = "grass")]
    Grass,
    #[serde(rename = "bridge")]
    Bridge,
    #[serde(rename = "stairsDown")]
    StairsDown,
    #[serde(rename = "stairsUp")]
    StairsUp,
    #[serde(rename = "altar")]
    Altar,
    #[serde(rename = "fountain")]
    Fountain,
    #[serde(rename = "grave")]
    Grave,
    #[serde(rename = "trap")]
    Trap,
    #[serde(rename = "pillar")]
    Pillar,
    #[serde(rename = "treasure")]
    Treasure,
    #[serde(rename = "shop")]
    Shop,
    #[serde(rename = "table")]
    Table,
    #[serde(rename = "throne")]
    Throne,
    #[serde(rename = "cage")]
    Cage,
    #[serde(rename = "blood")]
    Blood,
    #[serde(rename = "bar")]
    Bar,
}

/// Single source of truth mapping kind <-> serde id <-> glyph.
const TILE_TABLE: [(TileKind, &str, char); 26] = [
    (TileKind::Void, "void", ' '),
    (TileKind::Wall, "wall", '#'),
    (TileKind::Floor, "floor", '.'),
    (TileKind::FloorAlt, "floorAlt", ','),
    (TileKind::Door, "door", '+'),
    (TileKind::DoorOpen, "doorOpen", '\''),
    (TileKind::Water, "water", '~'),
    (TileKind::DeepWater, "deepWater", '≈'),
    (TileKind::Lava, "lava", '~'),
    (TileKind::Tree, "tree", '♣'),
    (TileKind::Grass, "grass", '"'),
    (TileKind::Bridge, "bridge", '═'),
    (TileKind::StairsDown, "stairsDown", '>'),
    (TileKind::StairsUp, "stairsUp", '<'),
    (TileKind::Altar, "altar", '≡'),
    (TileKind::Fountain, "fountain", '♦'),
    (TileKind::Grave, "grave", '☠'),
    (TileKind::Trap, "trap", '^'),
    (TileKind::Pillar, "pillar", '0'),
    (TileKind::Treasure, "treasure", '$'),
    (TileKind::Shop, "shop", 'Σ'),
    (TileKind::Table, "table", '▤'),
    (TileKind::Throne, "throne", 'Ψ'),
    (TileKind::Cage, "cage", '█'),
    (TileKind::Blood, "blood", ';'),
    (TileKind::Bar, "bar", '│'),
];

impl TileKind {
    /// Atlas index (0..26), matching `TILE_TABLE` order and discriminant value.
    pub fn index(self) -> usize {
        TILE_TABLE.iter().position(|(k, _, _)| *k == self).unwrap()
    }

    pub fn glyph(self) -> char {
        TILE_TABLE
            .iter()
            .find(|(k, _, _)| *k == self)
            .map(|(_, _, c)| *c)
            .unwrap_or(' ')
    }

    /// `Some(kind)` if the id is known, else `None`.
    pub fn from_id(id: &str) -> Option<TileKind> {
        TILE_TABLE.iter().find(|(_, i, _)| *i == id).map(|(k, _, _)| *k)
    }

    /// Canonical id string used in `.gemap` files.
    pub fn id(self) -> &'static str {
        TILE_TABLE
            .iter()
            .find(|(k, _, _)| *k == self)
            .map(|(_, i, _)| *i)
            .unwrap()
    }

    pub const ALL: [TileKind; 26] = [
        TileKind::Void, TileKind::Wall, TileKind::Floor, TileKind::FloorAlt,
        TileKind::Door, TileKind::DoorOpen, TileKind::Water, TileKind::DeepWater,
        TileKind::Lava, TileKind::Tree, TileKind::Grass, TileKind::Bridge,
        TileKind::StairsDown, TileKind::StairsUp, TileKind::Altar, TileKind::Fountain,
        TileKind::Grave, TileKind::Trap, TileKind::Pillar, TileKind::Treasure,
        TileKind::Shop, TileKind::Table, TileKind::Throne, TileKind::Cage,
        TileKind::Blood, TileKind::Bar,
    ];
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serde_round_trip_stress_ids() {
        for kind in TileKind::ALL {
            let s = serde_json::to_string(&kind).unwrap();
            let id = s.trim_matches('"');
            assert_eq!(id, kind.id(), "serde id mismatch for {:?}", kind);
            let back: TileKind = serde_json::from_str(&s).unwrap();
            assert_eq!(kind, back);
        }
    }

    #[test]
    fn specific_camel_case_ids() {
        assert_eq!(serde_json::to_string(&TileKind::FloorAlt).unwrap(), "\"floorAlt\"");
        assert_eq!(serde_json::to_string(&TileKind::StairsDown).unwrap(), "\"stairsDown\"");
        assert_eq!(serde_json::to_string(&TileKind::DeepWater).unwrap(), "\"deepWater\"");
        assert_eq!(serde_json::to_string(&TileKind::DoorOpen).unwrap(), "\"doorOpen\"");
    }

    #[test]
    fn from_id_known_and_unknown() {
        assert_eq!(TileKind::from_id("floorAlt"), Some(TileKind::FloorAlt));
        assert_eq!(TileKind::from_id("nope"), None);
    }

    #[test]
    fn glyph_matches_spec() {
        assert_eq!(TileKind::Wall.glyph(), '#');
        assert_eq!(TileKind::DeepWater.glyph(), '≈');
        assert_eq!(TileKind::Bar.glyph(), '│');
    }

    #[test]
    fn default_is_void() {
        assert_eq!(TileKind::default(), TileKind::Void);
    }

    #[test]
    fn ord_orders_by_atlas_index() {
        assert!(TileKind::Void < TileKind::Wall);
        assert!(TileKind::Wall < TileKind::Bar);
    }
}
```

- [ ] Run: `cargo test --manifest-path bevy/Cargo.toml -p glyphweave-core tile` — expect PASS (6 tests).
- [ ] Commit: `feat(bevy): add tilekind enum with serde ids`

---

### Task 5: `core/coords.rs` — signed tile coordinate math (RED → PASS)

**Files:** Create `bevy/crates/core/src/coords.rs`; Modify `bevy/crates/core/src/lib.rs`.

- [ ] Modify `bevy/crates/core/src/lib.rs`:

```rust
//! GlyphWeave core: pure logic, no Bevy dependency.
pub mod coords;
pub mod error;
pub mod tile;
```

- [ ] RED: create `bevy/crates/core/src/coords.rs` containing ONLY the test module:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn origin_chunk() {
        assert_eq!(chunk_of(0, 0), (0, 0));
        assert_eq!(local_of(0, 0), (0, 0));
        assert_eq!(local_index(0, 0), 0);
    }

    #[test]
    fn positive_within_first_chunk() {
        assert_eq!(chunk_of(31, 31), (0, 0));
        assert_eq!(local_of(31, 31), (31, 31));
        assert_eq!(local_index(31, 31), 31 * 32 + 31);
    }

    #[test]
    fn crosses_positive_boundary() {
        assert_eq!(chunk_of(32, 0), (1, 0));
        assert_eq!(local_of(32, 0), (0, 0));
    }

    #[test]
    fn negative_one_wraps_to_last_cell() {
        assert_eq!(chunk_of(-1, -1), (-1, -1));
        assert_eq!(local_of(-1, -1), (31, 31));
        assert_eq!(local_index(-1, -1), 31 * 32 + 31);
    }

    #[test]
    fn negative_32_is_chunk_origin_minus_one() {
        assert_eq!(chunk_of(-32, -32), (-1, -1));
        assert_eq!(local_of(-32, -32), (0, 0));
    }

    #[test]
    fn negative_33_is_one_deeper() {
        assert_eq!(chunk_of(-33, -33), (-2, -2));
        assert_eq!(local_of(-33, -33), (31, 31));
    }

    #[test]
    fn round_trip_via_tile_from_chunk_local() {
        for (x, y) in [(0i32, 0i32), (5, 7), (31, 31), (32, 0), (-1, -1), (-32, -33), (-100, 250)] {
            let (cx, cy) = chunk_of(x, y);
            let (lx, ly) = local_of(x, y);
            assert_eq!(tile_from_chunk_local(cx, cy, lx, ly), (x, y), "round-trip ({},{})", x, y);
        }
    }

    #[test]
    fn local_index_in_bounds() {
        for x in -50..50 {
            for y in -50..50 {
                let idx = local_index(x, y);
                assert!(idx < CHUNK_AREA);
            }
        }
    }
}
```

- [ ] Run: `cargo test --manifest-path bevy/Cargo.toml -p glyphweave-core coords` — expect FAIL.
- [ ] PASS: prepend the implementation so `coords.rs` becomes:

```rust
/// Chunk edge length in tiles. CHUNK_AREA = 1024.
pub const CHUNK_SIZE: i32 = 32;
pub const CHUNK_AREA: usize = (CHUNK_SIZE as usize) * (CHUNK_SIZE as usize);

/// Chunk-grid coordinate containing the signed tile (x, y).
#[inline]
pub fn chunk_of(x: i32, y: i32) -> (i32, i32) {
    (x.div_euclid(CHUNK_SIZE), y.div_euclid(CHUNK_SIZE))
}

/// Local (in-chunk) coordinate in `[0, CHUNK_SIZE)` for both axes.
#[inline]
pub fn local_of(x: i32, y: i32) -> (usize, usize) {
    let lx = x.rem_euclid(CHUNK_SIZE) as usize;
    let ly = y.rem_euclid(CHUNK_SIZE) as usize;
    (lx, ly)
}

/// Flat index `[0, CHUNK_AREA)` for (x, y)'s cell within its chunk.
#[inline]
pub fn local_index(x: i32, y: i32) -> usize {
    let (lx, ly) = local_of(x, y);
    ly * CHUNK_SIZE as usize + lx
}

/// Reconstruct the signed tile coordinate from chunk + local parts.
#[inline]
pub fn tile_from_chunk_local(cx: i32, cy: i32, lx: usize, ly: usize) -> (i32, i32) {
    (cx * CHUNK_SIZE + lx as i32, cy * CHUNK_SIZE + ly as i32)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn origin_chunk() {
        assert_eq!(chunk_of(0, 0), (0, 0));
        assert_eq!(local_of(0, 0), (0, 0));
        assert_eq!(local_index(0, 0), 0);
    }

    #[test]
    fn positive_within_first_chunk() {
        assert_eq!(chunk_of(31, 31), (0, 0));
        assert_eq!(local_of(31, 31), (31, 31));
        assert_eq!(local_index(31, 31), 31 * 32 + 31);
    }

    #[test]
    fn crosses_positive_boundary() {
        assert_eq!(chunk_of(32, 0), (1, 0));
        assert_eq!(local_of(32, 0), (0, 0));
    }

    #[test]
    fn negative_one_wraps_to_last_cell() {
        assert_eq!(chunk_of(-1, -1), (-1, -1));
        assert_eq!(local_of(-1, -1), (31, 31));
        assert_eq!(local_index(-1, -1), 31 * 32 + 31);
    }

    #[test]
    fn negative_32_is_chunk_origin_minus_one() {
        assert_eq!(chunk_of(-32, -32), (-1, -1));
        assert_eq!(local_of(-32, -32), (0, 0));
    }

    #[test]
    fn negative_33_is_one_deeper() {
        assert_eq!(chunk_of(-33, -33), (-2, -2));
        assert_eq!(local_of(-33, -33), (31, 31));
    }

    #[test]
    fn round_trip_via_tile_from_chunk_local() {
        for (x, y) in [(0i32, 0i32), (5, 7), (31, 31), (32, 0), (-1, -1), (-32, -33), (-100, 250)] {
            let (cx, cy) = chunk_of(x, y);
            let (lx, ly) = local_of(x, y);
            assert_eq!(tile_from_chunk_local(cx, cy, lx, ly), (x, y), "round-trip ({},{})", x, y);
        }
    }

    #[test]
    fn local_index_in_bounds() {
        for x in -50..50 {
            for y in -50..50 {
                let idx = local_index(x, y);
                assert!(idx < CHUNK_AREA);
            }
        }
    }
}
```

- [ ] Run: `cargo test --manifest-path bevy/Cargo.toml -p glyphweave-core coords` — expect PASS (8 tests).
- [ ] Commit: `feat(bevy): add euclidean chunk coordinate math`

---

### Task 6: `core/chunk.rs` — `Chunk` + `ChunkGrid` (RED → PASS)

**Files:** Create `bevy/crates/core/src/chunk.rs`; Modify `bevy/crates/core/src/lib.rs`.

- [ ] Modify `bevy/crates/core/src/lib.rs`:

```rust
//! GlyphWeave core: pure logic, no Bevy dependency.
pub mod chunk;
pub mod coords;
pub mod error;
pub mod tile;
```

- [ ] RED: create `bevy/crates/core/src/chunk.rs` containing ONLY the test module:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn set_then_get() {
        let mut g = ChunkGrid::new();
        g.set(1, 2, TileKind::Wall);
        assert_eq!(g.get(1, 2), Some(TileKind::Wall));
        assert_eq!(g.get(1, 3), None);
        assert_eq!(g.len(), 1);
    }

    #[test]
    fn erase_deallocates_empty_chunk() {
        let mut g = ChunkGrid::new();
        g.set(0, 0, TileKind::Floor);
        assert_eq!(g.chunks.len(), 1);
        g.erase(0, 0);
        assert!(g.chunks.is_empty(), "empty chunk should be deallocated");
        assert_eq!(g.get(0, 0), None);
    }

    #[test]
    fn cross_chunk_boundary_positive() {
        let mut g = ChunkGrid::new();
        g.set(31, 0, TileKind::Floor);
        g.set(32, 0, TileKind::Wall);
        assert_eq!(g.chunks.len(), 2);
        assert_eq!(g.get(31, 0), Some(TileKind::Floor));
        assert_eq!(g.get(32, 0), Some(TileKind::Wall));
    }

    #[test]
    fn negative_coordinates() {
        let mut g = ChunkGrid::new();
        g.set(-1, -1, TileKind::Tree);
        g.set(-32, -32, TileKind::Grass);
        assert_eq!(g.get(-1, -1), Some(TileKind::Tree));
        assert_eq!(g.get(-32, -32), Some(TileKind::Grass));
        assert_eq!(g.chunks.len(), 2);
    }

    #[test]
    fn iter_tiles_round_trip() {
        let mut g = ChunkGrid::new();
        let pts = [(0i32, 0i32), (5, 9), (40, -3), (-7, -50), (33, 33)];
        for &(x, y) in &pts {
            g.set(x, y, TileKind::FloorAlt);
        }
        let mut collected: Vec<(i32, i32)> = g.iter_tiles().map(|(p, _)| p).collect();
        collected.sort();
        let mut expected = pts.to_vec();
        expected.sort();
        assert_eq!(collected, expected);
    }

    #[test]
    fn overwrite_same_cell() {
        let mut g = ChunkGrid::new();
        g.set(2, 2, TileKind::Floor);
        g.set(2, 2, TileKind::Wall);
        assert_eq!(g.get(2, 2), Some(TileKind::Wall));
        assert_eq!(g.len(), 1);
    }
}
```

- [ ] Run: `cargo test --manifest-path bevy/Cargo.toml -p glyphweave-core chunk` — expect FAIL.
- [ ] PASS: prepend the implementation so `chunk.rs` becomes:

```rust
use crate::coords::{chunk_of, local_index, CHUNK_AREA, CHUNK_SIZE};
use crate::tile::TileKind;
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct Chunk {
    pub tiles: Box<[Option<TileKind>; CHUNK_AREA]>,
}

impl Default for Chunk {
    fn default() -> Self {
        // `Box::new([None; N])` needs Copy; Option<TileKind> is Copy.
        Self { tiles: Box::new([None; CHUNK_AREA]) }
    }
}

impl Chunk {
    pub fn new() -> Self { Self::default() }

    pub fn get(&self, x: i32, y: i32) -> Option<TileKind> {
        self.tiles[local_index(x, y)]
    }

    pub fn set(&mut self, x: i32, y: i32, kind: TileKind) {
        self.tiles[local_index(x, y)] = Some(kind);
    }

    pub fn erase(&mut self, x: i32, y: i32) {
        self.tiles[local_index(x, y)] = None;
    }

    pub fn is_empty(&self) -> bool {
        self.tiles.iter().all(|t| t.is_none())
    }
}

/// Sparse grid of chunks. Empty chunks are never allocated.
#[derive(Debug, Clone, Default)]
pub struct ChunkGrid {
    pub chunks: HashMap<(i32, i32), Chunk>,
}

impl ChunkGrid {
    pub fn new() -> Self { Self::default() }

    pub fn get(&self, x: i32, y: i32) -> Option<TileKind> {
        let key = chunk_of(x, y);
        self.chunks.get(&key).and_then(|c| c.get(x, y))
    }

    pub fn set(&mut self, x: i32, y: i32, kind: TileKind) {
        let key = chunk_of(x, y);
        let chunk = self.chunks.entry(key).or_default();
        chunk.set(x, y, kind);
    }

    pub fn erase(&mut self, x: i32, y: i32) {
        let key = chunk_of(x, y);
        if let Some(chunk) = self.chunks.get_mut(&key) {
            chunk.erase(x, y);
            if chunk.is_empty() {
                self.chunks.remove(&key);
            }
        }
    }

    /// Iterates `((tile_x, tile_y), kind)` for every non-empty cell.
    pub fn iter_tiles(&self) -> impl Iterator<Item = ((i32, i32), TileKind)> + '_ {
        self.chunks.iter().flat_map(|((cx, cy), chunk)| {
            let cx = *cx;
            let cy = *cy;
            chunk.tiles.iter().enumerate().filter_map(move |(i, t)| {
                t.map(|k| {
                    let lx = (i % CHUNK_SIZE as usize) as i32;
                    let ly = (i / CHUNK_SIZE as usize) as i32;
                    ((cx * CHUNK_SIZE + lx, cy * CHUNK_SIZE + ly), k)
                })
            })
        })
    }

    pub fn len(&self) -> usize {
        self.chunks.values().map(|c| c.tiles.iter().filter(|t| t.is_some()).count()).sum()
    }

    pub fn is_empty(&self) -> bool { self.len() == 0 }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn set_then_get() {
        let mut g = ChunkGrid::new();
        g.set(1, 2, TileKind::Wall);
        assert_eq!(g.get(1, 2), Some(TileKind::Wall));
        assert_eq!(g.get(1, 3), None);
        assert_eq!(g.len(), 1);
    }

    #[test]
    fn erase_deallocates_empty_chunk() {
        let mut g = ChunkGrid::new();
        g.set(0, 0, TileKind::Floor);
        assert_eq!(g.chunks.len(), 1);
        g.erase(0, 0);
        assert!(g.chunks.is_empty(), "empty chunk should be deallocated");
        assert_eq!(g.get(0, 0), None);
    }

    #[test]
    fn cross_chunk_boundary_positive() {
        let mut g = ChunkGrid::new();
        g.set(31, 0, TileKind::Floor);
        g.set(32, 0, TileKind::Wall);
        assert_eq!(g.chunks.len(), 2);
        assert_eq!(g.get(31, 0), Some(TileKind::Floor));
        assert_eq!(g.get(32, 0), Some(TileKind::Wall));
    }

    #[test]
    fn negative_coordinates() {
        let mut g = ChunkGrid::new();
        g.set(-1, -1, TileKind::Tree);
        g.set(-32, -32, TileKind::Grass);
        assert_eq!(g.get(-1, -1), Some(TileKind::Tree));
        assert_eq!(g.get(-32, -32), Some(TileKind::Grass));
        assert_eq!(g.chunks.len(), 2);
    }

    #[test]
    fn iter_tiles_round_trip() {
        let mut g = ChunkGrid::new();
        let pts = [(0i32, 0i32), (5, 9), (40, -3), (-7, -50), (33, 33)];
        for &(x, y) in &pts {
            g.set(x, y, TileKind::FloorAlt);
        }
        let mut collected: Vec<(i32, i32)> = g.iter_tiles().map(|(p, _)| p).collect();
        collected.sort();
        let mut expected = pts.to_vec();
        expected.sort();
        assert_eq!(collected, expected);
    }

    #[test]
    fn overwrite_same_cell() {
        let mut g = ChunkGrid::new();
        g.set(2, 2, TileKind::Floor);
        g.set(2, 2, TileKind::Wall);
        assert_eq!(g.get(2, 2), Some(TileKind::Wall));
        assert_eq!(g.len(), 1);
    }
}
```

- [ ] Run: `cargo test --manifest-path bevy/Cargo.toml -p glyphweave-core chunk` — expect PASS (6 tests).
- [ ] Commit: `feat(bevy): add chunk and chunkgrid storage`

---

### Task 7: `core/layer.rs` — `Layer` with serde (RED → PASS)

**Files:** Create `bevy/crates/core/src/layer.rs`; Modify `bevy/crates/core/src/lib.rs`.

- [ ] Modify `bevy/crates/core/src/lib.rs`:

```rust
//! GlyphWeave core: pure logic, no Bevy dependency.
pub mod chunk;
pub mod coords;
pub mod error;
pub mod layer;
pub mod tile;
```

- [ ] RED: create `bevy/crates/core/src/layer.rs` containing ONLY the test module:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serde_round_trip() {
        let layer = Layer { id: "layer-2".into(), name: "Terrain".into(), visible: false, locked: true };
        let s = serde_json::to_string(&layer).unwrap();
        let back: Layer = serde_json::from_str(&s).unwrap();
        assert_eq!(layer, back);
    }

    #[test]
    fn defaults_when_missing_flags() {
        let json = r#"{"id":"layer-1","name":"X"}"#;
        let l: Layer = serde_json::from_str(json).unwrap();
        assert!(l.visible);
        assert!(!l.locked);
    }
}
```

- [ ] Run: `cargo test --manifest-path bevy/Cargo.toml -p glyphweave-core layer` — expect FAIL.
- [ ] PASS: prepend the implementation so `layer.rs` becomes:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Layer {
    pub id: String,
    pub name: String,
    #[serde(default = "default_true")]
    pub visible: bool,
    #[serde(default)]
    pub locked: bool,
}

fn default_true() -> bool { true }

impl Layer {
    pub fn new(id: impl Into<String>, name: impl Into<String>) -> Self {
        Self { id: id.into(), name: name.into(), visible: true, locked: false }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serde_round_trip() {
        let layer = Layer { id: "layer-2".into(), name: "Terrain".into(), visible: false, locked: true };
        let s = serde_json::to_string(&layer).unwrap();
        let back: Layer = serde_json::from_str(&s).unwrap();
        assert_eq!(layer, back);
    }

    #[test]
    fn defaults_when_missing_flags() {
        let json = r#"{"id":"layer-1","name":"X"}"#;
        let l: Layer = serde_json::from_str(json).unwrap();
        assert!(l.visible);
        assert!(!l.locked);
    }
}
```

- [ ] Run: `cargo test --manifest-path bevy/Cargo.toml -p glyphweave-core layer` — expect PASS (2 tests).
- [ ] Commit: `feat(bevy): add layer struct with serde`

---

### Task 8: `core/world.rs` — `World` aggregating layers + grids (RED → PASS)

**Files:** Create `bevy/crates/core/src/world.rs`; Modify `bevy/crates/core/src/lib.rs`.

- [ ] Modify `bevy/crates/core/src/lib.rs`:

```rust
//! GlyphWeave core: pure logic, no Bevy dependency.
pub mod chunk;
pub mod coords;
pub mod error;
pub mod layer;
pub mod tile;
pub mod world;
```

- [ ] RED: create `bevy/crates/core/src/world.rs` containing ONLY the test module:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_has_one_layer_with_empty_grid() {
        let w = World::default();
        assert_eq!(w.layers.len(), 1);
        assert!(w.active_grid().unwrap().is_empty());
        assert_eq!(w.version, 2);
        assert_eq!(w.tile_size, 24);
    }

    #[test]
    fn set_get_erase_round_trip() {
        let mut w = World::default();
        let layer = w.active_layer.clone();
        w.set(&layer, 3, -4, TileKind::Wall);
        assert_eq!(w.get(&layer, 3, -4), Some(TileKind::Wall));
        w.erase(&layer, 3, -4);
        assert_eq!(w.get(&layer, 3, -4), None);
    }

    #[test]
    fn set_on_unknown_layer_is_noop() {
        let mut w = World::default();
        w.set("nope", 0, 0, TileKind::Floor);
        assert!(w.grids.contains_key("layer-1"));
        assert!(!w.grids.contains_key("nope"));
    }
}
```

- [ ] Run: `cargo test --manifest-path bevy/Cargo.toml -p glyphweave-core world` — expect FAIL.
- [ ] PASS: prepend the implementation so `world.rs` becomes:

```rust
use crate::chunk::ChunkGrid;
use crate::layer::Layer;
use crate::tile::TileKind;
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct World {
    pub version: u32,
    pub world_name: String,
    pub tile_size: u32,
    pub theme_id: String,
    pub layers: Vec<Layer>,
    /// One grid per layer id.
    pub grids: HashMap<String, ChunkGrid>,
    pub active_layer: String,
}

impl Default for World {
    fn default() -> Self {
        let layer = Layer::new("layer-1", "Layer 1");
        let mut grids = HashMap::new();
        grids.insert(layer.id.clone(), ChunkGrid::new());
        Self {
            version: 2,
            world_name: "Untitled".into(),
            tile_size: 24,
            theme_id: "ansi-16".into(),
            layers: vec![layer],
            grids,
            active_layer: "layer-1".into(),
        }
    }
}

impl World {
    pub fn new() -> Self { Self::default() }

    pub fn layer(&self, id: &str) -> Option<&Layer> {
        self.layers.iter().find(|l| l.id == id)
    }

    pub fn grid(&self, layer_id: &str) -> Option<&ChunkGrid> { self.grids.get(layer_id) }
    pub fn grid_mut(&mut self, layer_id: &str) -> Option<&mut ChunkGrid> { self.grids.get_mut(layer_id) }

    pub fn active_grid(&self) -> Option<&ChunkGrid> { self.grid(&self.active_layer) }

    pub fn get(&self, layer_id: &str, x: i32, y: i32) -> Option<TileKind> {
        self.grid(layer_id).and_then(|g| g.get(x, y))
    }

    pub fn set(&mut self, layer_id: &str, x: i32, y: i32, kind: TileKind) {
        if let Some(g) = self.grid_mut(layer_id) {
            g.set(x, y, kind);
        }
    }

    pub fn erase(&mut self, layer_id: &str, x: i32, y: i32) {
        if let Some(g) = self.grid_mut(layer_id) {
            g.erase(x, y);
        }
    }

    pub fn ensure_grid(&mut self, layer_id: &str) {
        self.grids.entry(layer_id.to_string()).or_default();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_has_one_layer_with_empty_grid() {
        let w = World::default();
        assert_eq!(w.layers.len(), 1);
        assert!(w.active_grid().unwrap().is_empty());
        assert_eq!(w.version, 2);
        assert_eq!(w.tile_size, 24);
    }

    #[test]
    fn set_get_erase_round_trip() {
        let mut w = World::default();
        let layer = w.active_layer.clone();
        w.set(&layer, 3, -4, TileKind::Wall);
        assert_eq!(w.get(&layer, 3, -4), Some(TileKind::Wall));
        w.erase(&layer, 3, -4);
        assert_eq!(w.get(&layer, 3, -4), None);
    }

    #[test]
    fn set_on_unknown_layer_is_noop() {
        let mut w = World::default();
        w.set("nope", 0, 0, TileKind::Floor);
        assert!(w.grids.contains_key("layer-1"));
        assert!(!w.grids.contains_key("nope"));
    }
}
```

- [ ] Run: `cargo test --manifest-path bevy/Cargo.toml -p glyphweave-core world` — expect PASS (3 tests).
- [ ] Commit: `feat(bevy): add world aggregate over layers`

---

### Task 9: `core/edit.rs` — `Edit` enum + `apply` (RED → PASS)

**Files:** Create `bevy/crates/core/src/edit.rs`; Modify `bevy/crates/core/src/lib.rs`.

- [ ] Modify `bevy/crates/core/src/lib.rs`:

```rust
//! GlyphWeave core: pure logic, no Bevy dependency.
pub mod chunk;
pub mod coords;
pub mod edit;
pub mod error;
pub mod layer;
pub mod tile;
pub mod world;
```

- [ ] RED: create `bevy/crates/core/src/edit.rs` containing ONLY the test module:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn set_creates_chunk() {
        let mut w = World::default();
        let layer = w.active_layer.clone();
        Edit::Set(TileKind::Wall).apply(&mut w, &layer, 100, -200);
        assert_eq!(w.get(&layer, 100, -200), Some(TileKind::Wall));
        assert!(!w.active_grid().unwrap().is_empty());
    }

    #[test]
    fn erase_clears_cell() {
        let mut w = World::default();
        let layer = w.active_layer.clone();
        Edit::Set(TileKind::Floor).apply(&mut w, &layer, 0, 0);
        Edit::Erase.apply(&mut w, &layer, 0, 0);
        assert_eq!(w.get(&layer, 0, 0), None);
    }
}
```

- [ ] Run: `cargo test --manifest-path bevy/Cargo.toml -p glyphweave-core edit` — expect FAIL.
- [ ] PASS: prepend the implementation so `edit.rs` becomes:

```rust
use crate::tile::TileKind;
use crate::world::World;

/// A single-tile mutation. The layer is supplied at apply time.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Edit {
    Set(TileKind),
    Erase,
}

impl Edit {
    pub fn apply(self, world: &mut World, layer_id: &str, x: i32, y: i32) {
        match self {
            Edit::Set(kind) => world.set(layer_id, x, y, kind),
            Edit::Erase => world.erase(layer_id, x, y),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn set_creates_chunk() {
        let mut w = World::default();
        let layer = w.active_layer.clone();
        Edit::Set(TileKind::Wall).apply(&mut w, &layer, 100, -200);
        assert_eq!(w.get(&layer, 100, -200), Some(TileKind::Wall));
        assert!(!w.active_grid().unwrap().is_empty());
    }

    #[test]
    fn erase_clears_cell() {
        let mut w = World::default();
        let layer = w.active_layer.clone();
        Edit::Set(TileKind::Floor).apply(&mut w, &layer, 0, 0);
        Edit::Erase.apply(&mut w, &layer, 0, 0);
        assert_eq!(w.get(&layer, 0, 0), None);
    }
}
```

- [ ] Run: `cargo test --manifest-path bevy/Cargo.toml -p glyphweave-core edit` — expect PASS (2 tests).
- [ ] Commit: `feat(bevy): add edit enum and apply`

---

### Task 10: `core/gemap.rs` — `.gemap` v2 load/save (test-first, sub-tasked)

**Discipline:** this single file is built incrementally as 7 sub-tasks (10.1–10.7). Each sub-task appends to the SAME `bevy/crates/core/src/gemap.rs`; the union is the final file (shown in full at 10.7). Each sub-task has a genuine RED step (test fails to compile or asserts false) before its PASS step. The two real-map integration tests hard-`assert!` the example path exists (no silent skip), so a missing/misplaced map fails loudly.

**Files:** Create `bevy/crates/core/src/gemap.rs`; Modify `bevy/crates/core/src/lib.rs`.

- [ ] Modify `bevy/crates/core/src/lib.rs`:

```rust
//! GlyphWeave core: pure logic, no Bevy dependency.
pub mod chunk;
pub mod coords;
pub mod edit;
pub mod error;
pub mod gemap;
pub mod layer;
pub mod tile;
pub mod world;
```

#### 10.1 `parse_coord_key` (RED → PASS)

- [ ] RED: create `bevy/crates/core/src/gemap.rs` with only the test module:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn coord_key_parse_and_format() {
        assert_eq!(parse_coord_key("3,-4").unwrap(), (3, -4));
        assert!(parse_coord_key("nope").is_err());
        assert!(parse_coord_key("1,a").is_err());
    }
}
```

- [ ] Run: `cargo test --manifest-path bevy/Cargo.toml -p glyphweave-core gemap` — expect FAIL.
- [ ] PASS: prepend the implementation skeleton (parse_coord_key + the GemapFile struct + defaults, which the later sub-tasks flesh out). `gemap.rs` becomes:

```rust
use crate::error::{CoreError, Result};
use crate::layer::Layer;
use crate::tile::TileKind;
use crate::world::World;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

/// `.gemap` file v2 on-disk shape (camelCase JSON).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GemapFile {
    #[serde(default)]
    pub version: u32,
    /// Legacy flat: `"x,y" -> "tileId"`. Used as layer-1 on load when `layerTiles` is absent/empty.
    #[serde(default)]
    pub tiles: HashMap<String, String>,
    /// Authoritative: `layerId -> ("x,y" -> "tileId")`. Takes precedence over `tiles` on load.
    #[serde(default)]
    pub layer_tiles: HashMap<String, HashMap<String, String>>,
    #[serde(default)]
    pub layers: Vec<Layer>,
    #[serde(default = "default_world_name")]
    pub world_name: String,
    #[serde(default = "default_tile_size")]
    pub tile_size: u32,
    #[serde(default = "default_theme_id")]
    pub theme_id: String,
}

fn default_world_name() -> String { "Untitled".into() }
fn default_tile_size() -> u32 { 24 }
fn default_theme_id() -> String { "ansi-16".into() }

pub fn parse_coord_key(key: &str) -> Result<(i32, i32)> {
    let (a, b) = key
        .split_once(',')
        .ok_or_else(|| CoreError::InvalidCoordKey(key.into()))?;
    let x: i32 = a.trim().parse().map_err(|_| CoreError::InvalidCoordKey(key.into()))?;
    let y: i32 = b.trim().parse().map_err(|_| CoreError::InvalidCoordKey(key.into()))?;
    Ok((x, y))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn coord_key_parse_and_format() {
        assert_eq!(parse_coord_key("3,-4").unwrap(), (3, -4));
        assert!(parse_coord_key("nope").is_err());
        assert!(parse_coord_key("1,a").is_err());
    }
}
```

- [ ] Run: `cargo test --manifest-path bevy/Cargo.toml -p glyphweave-core gemap` — expect PASS.

#### 10.2 `from_world` + `into_world` (layerTiles-only) + tiny round trip (RED → PASS)

- [ ] RED: append this test to the `tests` module in `gemap.rs` (place before the closing `}`):

```rust
    #[test]
    fn tiny_round_trip() {
        let mut w = World::default();
        w.world_name = "Tiny".into();
        let layer = w.active_layer.clone();
        w.set(&layer, 0, 0, TileKind::Wall);
        w.set(&layer, -1, 5, TileKind::FloorAlt);

        let tmp = std::env::temp_dir().join("glyphweave_tiny_roundtrip.gemap");
        save_world(&w, &tmp).unwrap();
        let w2 = load_world(&tmp).unwrap();
        let _ = std::fs::remove_file(&tmp);

        assert_eq!(w2.world_name, "Tiny");
        let l2 = w2.active_layer.clone();
        assert_eq!(w2.get(&l2, 0, 0), Some(TileKind::Wall));
        assert_eq!(w2.get(&l2, -1, 5), Some(TileKind::FloorAlt));
        assert_eq!(w2.active_grid().unwrap().len(), 2);
    }
```

- [ ] Run — expect FAIL (`from_world` / `into_world` / `save_world` / `load_world` unresolved).
- [ ] PASS: append the implementation to `gemap.rs` (after `parse_coord_key`, before the test module). `into_world` here handles ONLY the `layerTiles` branch (legacy `tiles` branch is added in 10.3). Append:

```rust
impl GemapFile {
    pub fn from_world(world: &World) -> Self {
        let first_layer = world
            .layers
            .first()
            .map(|l| l.id.clone())
            .unwrap_or_else(|| "layer-1".into());

        let mut layer_tiles: HashMap<String, HashMap<String, String>> = HashMap::new();
        let mut flat: HashMap<String, String> = HashMap::new();

        for layer in &world.layers {
            let mut map = HashMap::new();
            if let Some(grid) = world.grids.get(&layer.id) {
                for ((x, y), k) in grid.iter_tiles() {
                    let id = k.id().to_string();
                    let key = format!("{x},{y}");
                    if layer.id == first_layer {
                        flat.insert(key.clone(), id.clone());
                    }
                    map.insert(key, id);
                }
            }
            layer_tiles.insert(layer.id.clone(), map);
        }

        GemapFile {
            version: world.version,
            tiles: flat,
            layer_tiles,
            layers: world.layers.clone(),
            world_name: world.world_name.clone(),
            tile_size: world.tile_size,
            theme_id: world.theme_id.clone(),
        }
    }

    pub fn into_world(self) -> World {
        let mut world = World {
            version: if self.version > 0 { self.version } else { 2 },
            world_name: self.world_name,
            tile_size: self.tile_size,
            theme_id: self.theme_id,
            ..World::default()
        };

        if !self.layers.is_empty() {
            world.layers = self.layers;
        }
        world.grids.clear();
        for layer in &world.layers {
            world.grids.entry(layer.id.clone()).or_default();
        }
        if world.layers.is_empty() {
            let l = Layer::new("layer-1", "Layer 1");
            world.grids.insert(l.id.clone(), Default::default());
            world.layers.push(l);
        }
        world.active_layer = world.layers[0].id.clone();

        // layerTiles is authoritative; the legacy flat branch is added in 10.3.
        for (layer_id, map) in self.layer_tiles {
            let grid = world.grids.entry(layer_id).or_default();
            ingest(grid, map);
        }
        world
    }
}

fn ingest(grid: &mut crate::chunk::ChunkGrid, map: HashMap<String, String>) {
    for (key, id) in map {
        let Ok((x, y)) = parse_coord_key(&key) else { continue };
        match TileKind::from_id(&id) {
            Some(kind) => {
                if !matches!(kind, TileKind::Void) {
                    grid.set(x, y, kind);
                }
            }
            None => {
                eprintln!("warn: unknown tile id '{id}' at ({x},{y}); mapping to Void");
            }
        }
    }
}

pub fn load_world(path: &Path) -> Result<World> {
    let text = std::fs::read_to_string(path)?;
    let file: GemapFile = serde_json::from_str(&text)?;
    if file.version != 0 && file.version != 2 {
        return Err(CoreError::UnsupportedVersion(file.version));
    }
    Ok(file.into_world())
}

pub fn save_world(world: &World, path: &Path) -> Result<()> {
    let file = GemapFile::from_world(world);
    let text = serde_json::to_string_pretty(&file)?;
    std::fs::write(path, text)?;
    Ok(())
}
```

- [ ] Run: `cargo test --manifest-path bevy/Cargo.toml -p glyphweave-core gemap` — expect PASS (2 tests). Note `tiny_round_trip` passes because `save_world` writes a populated `layerTiles`, which `into_world` reads.

#### 10.3 legacy flat-tiles support (RED → PASS)

- [ ] RED: append this test (a `tiles`-only file has no `layerTiles`, so the current `into_world` produces an empty grid):

```rust
    #[test]
    fn legacy_flat_loads_into_layer_1() {
        let json = r#"{
            "version": 2,
            "tiles": { "1,2": "wall", "-3,-4": "floorAlt" },
            "worldName": "L",
            "tileSize": 24,
            "themeId": "ansi-16"
        }"#;
        let file: GemapFile = serde_json::from_str(json).unwrap();
        let world = file.into_world();
        assert_eq!(world.world_name, "L");
        assert_eq!(world.get("layer-1", 1, 2), Some(TileKind::Wall));
        assert_eq!(world.get("layer-1", -3, -4), Some(TileKind::FloorAlt));
    }
```

- [ ] Run — expect FAIL (`into_world` ignores `self.tiles`, so both gets return `None`).
- [ ] PASS: in `into_world`, replace the layerTiles-loading block with a branch that falls back to legacy flat. Replace:

```rust
        // layerTiles is authoritative; the legacy flat branch is added in 10.3.
        for (layer_id, map) in self.layer_tiles {
            let grid = world.grids.entry(layer_id).or_default();
            ingest(grid, map);
        }
```

with:

```rust
        if !self.layer_tiles.is_empty() {
            // layerTiles is authoritative when present; the flat `tiles` map is ignored on load.
            for (layer_id, map) in self.layer_tiles {
                let grid = world.grids.entry(layer_id).or_default();
                ingest(grid, map);
            }
        } else {
            // Legacy flat -> active (first) layer.
            let active = world.active_layer.clone();
            let grid = world.grids.entry(active).or_default();
            ingest(grid, self.tiles);
        }
```

- [ ] Run: `cargo test --manifest-path bevy/Cargo.toml -p glyphweave-core gemap` — expect PASS (3 tests).

#### 10.4 `layerTiles` precedence + multi-layer round trip (PASS guard)

- [ ] Append this test (confirms `layerTiles` wins when both keys are present — matches the precedence rule; this is a guard test that passes immediately given 10.3):

```rust
    #[test]
    fn layertiles_round_trip_preserves_three_layers() {
        let json = r#"{
            "version": 2,
            "layerTiles": {
                "layer-1": { "0,0": "floor" },
                "layer-2": { "0,0": "wall" },
                "layer-3": { "0,0": "tree" }
            },
            "tiles": { "0,0": "lava" },
            "layers": [
                {"id":"layer-1","name":"A","visible":true,"locked":false},
                {"id":"layer-2","name":"B","visible":true,"locked":false},
                {"id":"layer-3","name":"C","visible":true,"locked":false}
            ],
            "worldName": "X",
            "tileSize": 24,
            "themeId": "ansi-16"
        }"#;
        let file: GemapFile = serde_json::from_str(json).unwrap();
        let world = file.into_world();
        assert_eq!(world.layers.len(), 3);
        // layerTiles wins over the flat `tiles` "lava" entry.
        assert_eq!(world.get("layer-1", 0, 0), Some(TileKind::Floor));
        assert_eq!(world.get("layer-2", 0, 0), Some(TileKind::Wall));
        assert_eq!(world.get("layer-3", 0, 0), Some(TileKind::Tree));

        let tmp = std::env::temp_dir().join("glyphweave_3layer_roundtrip.gemap");
        save_world(&world, &tmp).unwrap();
        let world2 = load_world(&tmp).unwrap();
        let _ = std::fs::remove_file(&tmp);
        assert_eq!(world2.layers, world.layers);
        for layer in &world.layers {
            assert_eq!(world.grid(&layer.id).unwrap().len(), world2.grid(&layer.id).unwrap().len());
            assert_eq!(world2.get(&layer.id, 0, 0), world.get(&layer.id, 0, 0));
        }
    }
```

- [ ] Run — expect PASS. (If it fails, the precedence branch from 10.3 is wrong.)

#### 10.5 unknown-id policy (PASS guard)

- [ ] Append this test (unknown id warns and maps to Void, which is not stored; guard test, passes immediately):

```rust
    #[test]
    fn unknown_id_becomes_void_with_warning() {
        let json = r#"{
            "version": 2,
            "tiles": { "0,0": "madeUpTileKind" },
            "worldName": "U",
            "tileSize": 24,
            "themeId": "ansi-16"
        }"#;
        let file: GemapFile = serde_json::from_str(json).unwrap();
        let world = file.into_world();
        assert!(world.active_grid().unwrap().is_empty());
    }
```

- [ ] Run — expect PASS.

#### 10.6 back-compat writer (PASS guard)

- [ ] Append this test (verifies `save_world` writes BOTH `layerTiles` and a flat `tiles` mirror for back-compat with older readers):

```rust
    #[test]
    fn save_writes_both_layer_tiles_and_flat_for_back_compat() {
        let mut w = World::default();
        let layer = w.active_layer.clone();
        w.set(&layer, 2, 3, TileKind::Door);
        let tmp = std::env::temp_dir().join("glyphweave_backcompat.gemap");
        save_world(&w, &tmp).unwrap();
        let raw = std::fs::read_to_string(&tmp).unwrap();
        let _ = std::fs::remove_file(&tmp);
        assert!(raw.contains("\"layerTiles\""), "must write layerTiles");
        assert!(raw.contains("\"tiles\""), "must write flat tiles for back-compat");
        let parsed: serde_json::Value = serde_json::from_str(&raw).unwrap();
        assert_eq!(parsed["tiles"]["2,3"], "door");
        assert_eq!(parsed["layerTiles"]["layer-1"]["2,3"], "door");
    }
```

- [ ] Run — expect PASS.

#### 10.7 real-map integration tests + final full file (RED → PASS)

- [ ] Append these two integration tests. They HARD-assert the example path exists (no silent skip):

```rust
    fn example_path() -> std::path::PathBuf {
        // CARGO_MANIFEST_DIR = .../bevy/crates/core -> repo root is 3 levels up.
        let mut p = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        p.pop(); p.pop(); p.pop();
        p.push("examples");
        p.push("grand-realm-of-aethra.gemap");
        p
    }

    #[test]
    fn integration_loads_real_aethra_map() {
        let path = example_path();
        assert!(path.exists(), "missing example map at {}", path.display());
        let world = load_world(&path).expect("load real gemap");
        assert_eq!(world.world_name, "Grand Realm of Aethra");
        assert_eq!(world.tile_size, 24);
        assert_eq!(world.layers.len(), 3, "real map has 3 layers (Terrain/Structures/Details)");
        assert!(!world.active_grid().unwrap().is_empty(), "active layer should have tiles");
    }

    #[test]
    fn integration_round_trip_real_aethra_map() {
        let path = example_path();
        assert!(path.exists(), "missing example map at {}", path.display());
        let world = load_world(&path).expect("load");
        let tmp = std::env::temp_dir().join("glyphweave_aethra_roundtrip.gemap");
        save_world(&world, &tmp).expect("save");
        let world2 = load_world(&tmp).expect("reload");
        let _ = std::fs::remove_file(&tmp);

        assert_eq!(world.world_name, world2.world_name);
        assert_eq!(world.tile_size, world2.tile_size);
        assert_eq!(world.theme_id, world2.theme_id);
        assert_eq!(world.layers, world2.layers);
        for layer in &world.layers {
            let a: std::collections::BTreeSet<_> = world
                .grid(&layer.id)
                .unwrap()
                .iter_tiles()
                .map(|(p, k)| (p, k))
                .collect();
            let b: std::collections::BTreeSet<_> = world2
                .grid(&layer.id)
                .unwrap()
                .iter_tiles()
                .map(|(p, k)| (p, k))
                .collect();
            assert_eq!(a, b, "layer {} differs after round-trip", layer.id);
        }
    }
```

(`BTreeSet<(i32,i32), TileKind>` requires `TileKind: Ord`, provided in Task 4.)

- [ ] Run: `cargo test --manifest-path bevy/Cargo.toml -p glyphweave-core gemap` — expect PASS (8 tests). The two integration tests exercise the real example map (3 layers, [0,119]×[0,79]).
- [ ] Run the whole core suite: `cargo test --manifest-path bevy/Cargo.toml -p glyphweave-core` — expect all green.
- [ ] Commit: `feat(bevy): add gemap v2 loader and saver`

---

### Task 11: `app/resource.rs` — `WorldModel` newtype + cursor + edit message

**Files:** Create `bevy/crates/app/src/resource.rs`; Modify `bevy/crates/app/src/main.rs`.

- [ ] Create `bevy/crates/app/src/resource.rs`:

```rust
//! Bevy resources wrapping the core world model and shared editor state.
use bevy::ecs::message::Message;
use bevy::prelude::Resource;
use glyphweave_core::edit::Edit;
use glyphweave_core::world::World;

/// Newtype around `core::World` to avoid a name clash with `bevy::prelude::World`.
#[derive(Resource)]
pub struct WorldModel(pub World);

impl std::ops::Deref for WorldModel {
    type Target = World;
    fn deref(&self) -> &World { &self.0 }
}
impl std::ops::DerefMut for WorldModel {
    fn deref_mut(&mut self) -> &mut World { &mut self.0 }
}

/// Buffered edit request produced by the tool system, consumed by render-sync.
/// Always applied to the world's `active_layer` in P1.
#[derive(Message, Clone, Copy, Debug)]
pub struct EditEvent {
    pub x: i32,
    pub y: i32,
    pub edit: Edit,
}

/// Last-known tile coordinate under the OS cursor (for UI read-out).
#[derive(Resource, Default, Debug, Clone, Copy)]
pub struct CursorTile {
    pub x: i32,
    pub y: i32,
    pub valid: bool,
}
```

- [ ] Replace `bevy/crates/app/src/main.rs` with the Task-11 version (registers the module, `WorldModel`, `CursorTile`, `EditEvent` message, `ActiveBrush`, loads the example world on Startup; configures `AssetPlugin` so `assets/textures/atlas.png` resolves to `bevy/assets/...` when run from the repo root):

```rust
mod resource;

use bevy::asset::AssetPlugin;
use bevy::diagnostic::FrameTimeDiagnosticsPlugin;
use bevy::prelude::*;
use bevy_ecs_tilemap::prelude::TilemapPlugin;
use bevy_egui::{EguiPlugin, EguiPrimaryContextPass};
use glyphweave_core::gemap::load_world;
use glyphweave_core::tile::TileKind;
use resource::{CursorTile, EditEvent, WorldModel};
use std::path::PathBuf;

/// Which kind the Brush tool paints. B = Floor, E = Void (erase semantics).
#[derive(Resource, Debug, Clone, Copy)]
pub struct ActiveBrush(pub TileKind);

fn main() {
    App::new()
        .add_plugins(
            DefaultPlugins
                .set(WindowPlugin {
                    primary_window: Some(Window {
                        title: "GlyphWeave".into(),
                        resolution: (1280.0, 720.0).into(),
                        ..default()
                    }),
                    ..default()
                })
                .set(ImagePlugin::default_nearest())
                .set(AssetPlugin {
                    // All smoke commands run from the repo root via --manifest-path,
                    // so the atlas at bevy/assets/textures/atlas.png resolves correctly.
                    file_path: "bevy/assets".to_string(),
                    ..default()
                }),
        )
        .add_plugins(FrameTimeDiagnosticsPlugin::default())
        .add_plugins(EguiPlugin::default())
        .add_plugins(TilemapPlugin)
        .add_message::<EditEvent>()
        .init_resource::<CursorTile>()
        .insert_resource(ActiveBrush(TileKind::Floor))
        .add_systems(Startup, (spawn_camera, load_initial_world).chain())
        .add_systems(EguiPrimaryContextPass, fps_overlay)
        .run();
}

fn spawn_camera(mut commands: Commands) {
    commands.spawn(Camera2d);
}

fn load_initial_world(mut commands: Commands) {
    let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.pop(); p.pop(); p.pop(); // repo root
    p.push("examples");
    p.push("grand-realm-of-aethra.gemap");
    let world = match load_world(&p) {
        Ok(w) => {
            println!("[glyphweave] loaded {} ({} layers)", p.display(), w.layers.len());
            w
        }
        Err(e) => {
            eprintln!("[glyphweave] failed to load {}: {e}; starting empty", p.display());
            glyphweave_core::world::World::default()
        }
    };
    commands.insert_resource(WorldModel(world));
}

fn fps_overlay(mut contexts: bevy_egui::EguiContexts, diagnostics: Res<bevy::diagnostic::DiagnosticsStore>) {
    let fps = diagnostics
        .get(&bevy::diagnostic::FrameTimeDiagnosticsPlugin::FPS)
        .and_then(|d| d.smoothed())
        .map(|v| format!("{v:.1}"))
        .unwrap_or_else(|| "—".into());
    if let Ok(ctx) = contexts.ctx_mut() {
        bevy_egui::egui::TopBottomPanel::top("fps").show(ctx, |ui| {
            ui.label(format!("FPS: {fps}"));
        });
    }
}
```

- [ ] Run: `cargo check --manifest-path bevy/Cargo.toml -p glyphweave-app` — expect: compiles.
- [ ] Run headless load check (machine-verifiable; verifies the real 3-layer load path without opening a window — see Task 18 for the `--check-load` implementation; until then this smoke opens the window): `cargo run --manifest-path bevy/Cargo.toml -p glyphweave-app` — expect the console prints `[glyphweave] loaded .../grand-realm-of-aethra.gemap (3 layers)`. Close the window.
- [ ] Commit: `feat(bevy): add worldmodel resource and edit message`

---

### Task 12: `app/render/` — atlas.png generation + `tile_index` (RED → PASS) + loader

**Decision (committed):** Pre-render a `26 × 24px = 624px wide, 24px tall` PNG atlas (one-shot, committed) by rasterizing each tile glyph from a committed monospace TTF onto its ANSI-16 fg/bg. The Bevy app loads the PNG via `asset_server`. Runtime glyph rasterization is deferred past P1.

**Files:**
- Create `bevy/assets/fonts/generate_atlas.py`
- Create `bevy/assets/textures/atlas.png` (generated)
- Create `bevy/crates/app/src/render/mod.rs`
- Create `bevy/crates/app/src/render/atlas.rs`
- Create `bevy/crates/app/src/render/tilemap.rs` (placeholder; filled in Task 13)
- Modify `bevy/crates/app/src/main.rs`

- [ ] Acquire a monospace TTF: `cp /usr/share/fonts/TTF/DejaVuSansMono.ttf bevy/assets/fonts/DejaVuSansMono.ttf` (Arch path; Debian: `/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf`; or install `ttf-dejavu`). Verify: `ls -l bevy/assets/fonts/DejaVuSansMono.ttf`.
- [ ] Create `bevy/assets/fonts/generate_atlas.py`:

```python
#!/usr/bin/env python3
# Generate atlas.png: 26 cells of 24x24 px laid out horizontally.
# Cell i = TileKind index i. Glyph rendered in its ANSI-16 fg on its bg.
# Run:  python3 generate_atlas.py  (requires Pillow: pip install Pillow)
import sys
from PIL import Image, ImageDraw, ImageFont

TILE = 24
N = 26
FONT_PATH = "DejaVuSansMono.ttf"

# (fg_rgb, bg_rgb) per TileKind index, in the same order as core::TILE_TABLE.
PALETTE = [
    ((200,200,200),( 17, 17, 17)),  # 0  void
    ((180,180,180),( 17, 17, 17)),  # 1  wall
    ((220,220,220),( 30, 30, 30)),  # 2  floor
    ((160,160,160),( 30, 30, 30)),  # 3  floorAlt
    ((120, 80, 40),( 30, 30, 30)),  # 4  door
    ((200,160, 80),( 30, 30, 30)),  # 5  doorOpen
    (( 80,140,220),( 20, 30, 50)),  # 6  water
    (( 40, 80,180),( 15, 25, 45)),  # 7  deepWater
    ((240, 90, 30),( 60, 20, 10)),  # 8  lava
    (( 60,180, 70),( 15, 35, 20)),  # 9  tree
    ((120,200, 90),( 15, 35, 20)),  # 10 grass
    ((170,130, 80),( 30, 30, 30)),  # 11 bridge
    ((230,230,230),( 30, 30, 30)),  # 12 stairsDown
    ((230,230,230),( 30, 30, 30)),  # 13 stairsUp
    ((200,200, 80),( 30, 30, 30)),  # 14 altar
    (( 80,200,220),( 20, 35, 45)),  # 15 fountain
    ((200,200,200),( 30, 30, 30)),  # 16 grave
    ((220, 60, 60),( 40, 15, 15)),  # 17 trap
    ((190,190,190),( 30, 30, 30)),  # 18 pillar
    ((240,210, 80),( 40, 35, 10)),  # 19 treasure
    ((240,180, 60),( 40, 30, 10)),  # 20 shop
    ((160,110, 70),( 30, 30, 30)),  # 21 table
    ((240,210, 80),( 60, 30, 10)),  # 22 throne
    ((170,170,170),( 30, 30, 30)),  # 23 cage
    ((220, 40, 40),( 40, 10, 10)),  # 24 blood
    ((190,190,190),( 30, 30, 30)),  # 25 bar
]

# TileKind index -> glyph char (must match core::TileKind::glyph()).
GLYPHS = [
    ' ', '#', '.', ',', '+', "'", '~', '≈', '~', '♣', '"', '═',
    '>', '<', '≡', '♦', '☠', '^', '0', '$', 'Σ', '▤', 'Ψ', '█', ';', '│',
]

assert len(PALETTE) == N and len(GLYPHS) == N, "table size mismatch"

img = Image.new("RGB", (N * TILE, TILE), (0, 0, 0))
draw = ImageDraw.Draw(img)
try:
    font = ImageFont.truetype(FONT_PATH, 18)
except Exception as e:
    sys.exit(f"could not load {FONT_PATH}: {e}")

for i, (glyph, (fg, bg)) in enumerate(zip(GLYPHS, PALETTE)):
    x0 = i * TILE
    draw.rectangle([x0, 0, x0 + TILE - 1, TILE - 1], fill=bg)
    try:
        draw.text((x0 + TILE // 2, TILE // 2 + 1), glyph, fill=fg, font=font, anchor="mm")
    except TypeError:
        bbox = draw.textbbox((0, 0), glyph, font=font)
        w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
        draw.text((x0 + (TILE - w) // 2 - bbox[0], (TILE - h) // 2 - bbox[1]), glyph, fill=fg, font=font)

out = "../textures/atlas.png"
img.save(out)
print(f"wrote {out} ({img.size[0]}x{img.size[1]})")
```

- [ ] Run: `cd bevy/assets/fonts && python3 generate_atlas.py` (install Pillow first if missing: `python3 -m pip install --user Pillow`). Expect: `wrote ../textures/atlas.png (624x24)`.
- [ ] Verify: `file bevy/assets/textures/atlas.png` shows a PNG, 624x24.
- [ ] Create `bevy/crates/app/src/render/mod.rs`:

```rust
//! Tilemap rendering: atlas loader, bounded tilemap spawn, and world<->tile sync.
pub mod atlas;
pub mod tilemap;

use bevy::prelude::*;

/// Bounded map origin + size, derived from the loaded world's tile extents.
/// A tile at signed world coord `(tx, ty)` maps to bevy_ecs_tilemap `TilePos`
/// `(tx - min_x, ty - min_y)`.
#[derive(Resource, Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct MapBounds {
    pub min_x: i32,
    pub min_y: i32,
    pub width: u32,
    pub height: u32,
}
```

- [ ] RED: create `bevy/crates/app/src/render/atlas.rs` containing only the test for `tile_index`:

```rust
#[cfg(test)]
mod tests {
    use super::super::atlas::tile_index;
    use glyphweave_core::tile::TileKind;

    #[test]
    fn tile_index_matches_atlas_order() {
        assert_eq!(tile_index(TileKind::Void), 0);
        assert_eq!(tile_index(TileKind::Wall), 1);
        assert_eq!(tile_index(TileKind::Bar), 25);
    }
}
```

- [ ] Run: `cargo test --manifest-path bevy/Cargo.toml -p glyphweave-app atlas` — expect FAIL.
- [ ] PASS: prepend the implementation so `atlas.rs` becomes:

```rust
//! Atlas loading. atlas.png is 26 cells x 24px, sliced by bevy_ecs_tilemap.
use bevy::asset::AssetServer;
use bevy::image::Image;
use bevy::prelude::*;
use glyphweave_core::tile::TileKind;

pub fn tile_index(kind: TileKind) -> u32 {
    kind.index() as u32
}

/// Strong handle to the atlas image, kept on a resource so it never unloads.
#[derive(Resource)]
pub struct TileAtlas {
    pub image: Handle<Image>,
}

pub fn load_atlas(mut commands: Commands, asset_server: Res<AssetServer>) {
    let image: Handle<Image> = asset_server.load("textures/atlas.png");
    commands.insert_resource(TileAtlas { image });
}

#[cfg(test)]
mod tests {
    use super::tile_index;
    use glyphweave_core::tile::TileKind;

    #[test]
    fn tile_index_matches_atlas_order() {
        assert_eq!(tile_index(TileKind::Void), 0);
        assert_eq!(tile_index(TileKind::Wall), 1);
        assert_eq!(tile_index(TileKind::Bar), 25);
    }
}
```

- [ ] Create `bevy/crates/app/src/render/tilemap.rs` (placeholder so `mod.rs` compiles; filled in Task 13):

```rust
//! Bounded tilemap spawn. Filled in Task 13.
```

- [ ] Modify `bevy/crates/app/src/main.rs`: add `mod render;` after `mod resource;`, and insert `render::atlas::load_atlas` into the Startup chain BEFORE `load_initial_world` so the atlas handle exists when tilemaps spawn. Replace the Startup line with:

```rust
        .add_systems(Startup, (spawn_camera, render::atlas::load_atlas, load_initial_world).chain())
```

- [ ] Run: `cargo check --manifest-path bevy/Cargo.toml -p glyphweave-app` — expect: compiles.
- [ ] Before commit: `bevy/assets/` is a new directory — regenerate the AGENTS.md tree (`pnpm doc-tree`), update the tree block, and stage `AGENTS.md` + `bevy/assets/` so the pre-commit hook passes.
- [ ] Commit: `feat(bevy): bake ansi-16 tile atlas and loader`

---

### Task 13: `app/render/tilemap.rs` — spawn one z-stacked `TilemapBundle` per layer (RED → PASS)

**Key fixes baked in vs. draft:** (a) `TilemapLayer` derives `Clone` but NOT `Copy` (it has a `String` field); (b) no `is_added()` early-return guard; (c) `TilemapBundle { ...specific..., ..default() }` (alias, implements `Default`) — `material`/`sync`/`global_transform` etc. come from `default()`; (d) `bevy::image::Image` import; (e) spawn a `TileBundle` for EVERY cell in the union bounds (not just non-empty cells) so every editable coordinate has a tile entity — absent cells get the Void texture index; (f) `compute_bounds` is a pure free function, unit-tested.

**Files:** Modify `bevy/crates/app/src/render/tilemap.rs`; Modify `bevy/crates/app/src/main.rs`.

- [ ] RED: replace `bevy/crates/app/src/render/tilemap.rs` with only the pure-fn tests:

```rust
use crate::render::MapBounds;
use glyphweave_core::tile::TileKind;
use glyphweave_core::world::World;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_world_degenerate_bounds() {
        let w = World::default();
        let b = compute_bounds(&w);
        assert_eq!(b, MapBounds { min_x: 0, min_y: 0, width: 1, height: 1 });
    }

    #[test]
    fn single_layer_bounds() {
        let mut w = World::default();
        let l = w.active_layer.clone();
        w.set(&l, 0, 0, TileKind::Floor);
        w.set(&l, 4, 6, TileKind::Wall);
        let b = compute_bounds(&w);
        assert_eq!(b.min_x, 0);
        assert_eq!(b.min_y, 0);
        assert_eq!(b.width, 5);
        assert_eq!(b.height, 7);
    }

    #[test]
    fn bounds_with_negative_origin() {
        let mut w = World::default();
        let l = w.active_layer.clone();
        w.set(&l, -3, -2, TileKind::Floor);
        w.set(&l, 1, 1, TileKind::Wall);
        let b = compute_bounds(&w);
        assert_eq!(b.min_x, -3);
        assert_eq!(b.min_y, -2);
        assert_eq!(b.width, 5);
        assert_eq!(b.height, 4);
    }
}
```

- [ ] Run: `cargo test --manifest-path bevy/Cargo.toml -p glyphweave-app tilemap` — expect FAIL (`compute_bounds` unresolved).
- [ ] PASS: prepend `compute_bounds` + the spawn system + components so `tilemap.rs` becomes:

```rust
//! Spawn one bounded TilemapBundle per visible layer, z-stacked, with a tile
//! entity for EVERY cell in the union bounds (so any editable coord has an entity).
use crate::render::atlas::{tile_index, TileAtlas};
use crate::render::MapBounds;
use crate::resource::WorldModel;
use bevy::prelude::*;
use bevy_ecs_tilemap::prelude::*;
use glyphweave_core::world::World;

/// Tags a tilemap entity; carries its layer index for sync lookups.
/// NOTE: NOT `Copy` (has a String field); `Clone` only.
#[derive(Component, Reflect, Debug, Clone)]
#[reflect(Component)]
pub struct TilemapLayer {
    pub index: usize,
    pub layer_id: String,
}

/// Strong map from (layer_index, tile_x, tile_y) -> tile entity, for fast sync.
#[derive(Resource, Default, Debug)]
pub struct TileEntities {
    pub map: std::collections::HashMap<(usize, i32, i32), Entity>,
}

/// Pure: compute union bounds over all layers that have any tiles.
/// Empty world -> 1x1 degenerate bounds so the tilemap still exists.
pub fn compute_bounds(world: &World) -> MapBounds {
    let mut min_x = i32::MAX;
    let mut min_y = i32::MAX;
    let mut max_x = i32::MIN;
    let mut max_y = i32::MIN;
    let mut any = false;
    for layer in &world.layers {
        if let Some(grid) = world.grid(&layer.id) {
            for ((x, y), _) in grid.iter_tiles() {
                any = true;
                if x < min_x { min_x = x; }
                if y < min_y { min_y = y; }
                if x > max_x { max_x = x; }
                if y > max_y { max_y = y; }
            }
        }
    }
    if !any {
        return MapBounds { min_x: 0, min_y: 0, width: 1, height: 1 };
    }
    MapBounds {
        min_x,
        min_y,
        width: (max_x - min_x + 1).max(1) as u32,
        height: (max_y - min_y + 1).max(1) as u32,
    }
}

/// Run once on Startup, ordered after `load_initial_world`.
pub fn spawn_tilemaps(
    mut commands: Commands,
    world_model: Res<WorldModel>,
    atlas: Res<TileAtlas>,
    mut tile_entities: ResMut<TileEntities>,
) {
    let world = &world_model.0;
    let tile_px = world.tile_size.max(1) as f32;
    let bounds = compute_bounds(world);
    commands.insert_resource(bounds);

    let map_size = TilemapSize { x: bounds.width, y: bounds.height };
    let tile_size = TilemapTileSize { x: tile_px, y: tile_px };
    let grid_size = TilemapGridSize { x: tile_px, y: tile_px };
    let map_type = TilemapType::default();

    // With TopLeft anchor: tile TilePos(0,0) sits at the tilemap's local origin.
    // Translate the tilemap so signed tile (min_x, min_y) is the top-left cell.
    // (If the spike found `TilemapAnchor::Center` is the only option, add
    //  + Vec2::new(bounds.width as f32 * tile_px / 2.0,
    //              -(bounds.height as f32 * tile_px / 2.0)) to origin below.)
    let origin_world_x = bounds.min_x as f32 * tile_px;
    let origin_world_y = -bounds.min_y as f32 * tile_px;

    tile_entities.map.clear();

    for (i, layer) in world.layers.iter().enumerate() {
        if !layer.visible {
            continue;
        }
        let tilemap_entity = commands.spawn_empty().id();
        let mut tile_storage = TileStorage::empty(map_size);
        let grid = world.grid(&layer.id);

        // Spawn a tile entity for EVERY cell in bounds; absent cells -> Void index.
        for ly in 0..bounds.height {
            for lx in 0..bounds.width {
                let tx = bounds.min_x + lx as i32;
                let ty = bounds.min_y + ly as i32;
                let kind = grid.and_then(|g| g.get(tx, ty)).unwrap_or(glyphweave_core::tile::TileKind::Void);
                let tile_pos = TilePos { x: lx, y: ly };
                let tile_entity = commands
                    .spawn(TileBundle {
                        position: tile_pos,
                        tilemap_id: TilemapId(tilemap_entity),
                        texture_index: TileTextureIndex(tile_index(kind)),
                        ..default()
                    })
                    .id();
                tile_storage.set(&tile_pos, tile_entity);
                tile_entities.map.insert((i, tx, ty), tile_entity);
            }
        }

        let z = i as f32;
        commands.entity(tilemap_entity).insert((
            TilemapLayer { index: i, layer_id: layer.id.clone() },
            TilemapBundle {
                grid_size,
                map_type,
                size: map_size,
                spacing: TilemapSpacing::default(),
                storage: tile_storage,
                texture: TilemapTexture::Single(atlas.image.clone()),
                tile_size,
                transform: Transform::from_xyz(origin_world_x, origin_world_y, z),
                anchor: TilemapAnchor::TopLeft,
                ..default()
            },
        ));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_world_degenerate_bounds() {
        let w = World::default();
        let b = compute_bounds(&w);
        assert_eq!(b, MapBounds { min_x: 0, min_y: 0, width: 1, height: 1 });
    }

    #[test]
    fn single_layer_bounds() {
        let mut w = World::default();
        let l = w.active_layer.clone();
        w.set(&l, 0, 0, TileKind::Floor);
        w.set(&l, 4, 6, TileKind::Wall);
        let b = compute_bounds(&w);
        assert_eq!(b.min_x, 0);
        assert_eq!(b.min_y, 0);
        assert_eq!(b.width, 5);
        assert_eq!(b.height, 7);
    }

    #[test]
    fn bounds_with_negative_origin() {
        let mut w = World::default();
        let l = w.active_layer.clone();
        w.set(&l, -3, -2, TileKind::Floor);
        w.set(&l, 1, 1, TileKind::Wall);
        let b = compute_bounds(&w);
        assert_eq!(b.min_x, -3);
        assert_eq!(b.min_y, -2);
        assert_eq!(b.width, 5);
        assert_eq!(b.height, 4);
    }
}
```

- [ ] Modify `bevy/crates/app/src/main.rs`: register `TileEntities`, register the `TilemapLayer` type, and add the spawn system after `load_initial_world` in the Startup chain. Replace the Startup `.add_systems(...)` with:

```rust
        .add_systems(
            Startup,
            (spawn_camera, render::atlas::load_atlas, load_initial_world, render::tilemap::spawn_tilemaps)
                .chain(),
        )
```

and add after `.insert_resource(ActiveBrush(TileKind::Floor))`:

```rust
        .init_resource::<render::tilemap::TileEntities>()
        .register_type::<render::tilemap::TilemapLayer>()
```

- [ ] Run: `cargo test --manifest-path bevy/Cargo.toml -p glyphweave-app tilemap` — expect PASS (3 bounds tests).
- [ ] Run: `cargo check --manifest-path bevy/Cargo.toml -p glyphweave-app` — expect: compiles.
- [ ] Run smoke (window): `cargo run --manifest-path bevy/Cargo.toml -p glyphweave-app` — expect: the Aethra map renders as a colored tile grid, top-left anchored, 3 layers stacked. Close window.
- [ ] Commit: `feat(bevy): spawn z-stacked tilemaps per layer`

---

### Task 14: `app/render_sync.rs` — apply `EditEvent`s to the render view

**Key fix vs. draft:** queries ONLY `&mut TileTextureIndex` (no `TileVisible` — that component is never inserted anywhere and is not part of `TileBundle`); because Task 13 spawns an entity for every in-bounds cell, the `(layer_index, x, y)` lookup always hits, so painting an empty cell works. Erase / Set-to-Void maps the cell to the Void texture index (renders near-empty).

**Files:** Create `bevy/crates/app/src/render_sync.rs`; Modify `bevy/crates/app/src/main.rs`.

- [ ] Create `bevy/crates/app/src/render_sync.rs`:

```rust
//! Consume EditEvent messages and update the touched tile's texture index.
//! In P1 the tool system applies the edit to the core World (source of truth)
//! AND emits the event; this system only mirrors the change into the render view.
use crate::render::atlas::tile_index;
use crate::render::tilemap::TileEntities;
use crate::resource::{EditEvent, WorldModel};
use bevy::ecs::message::MessageReader;
use bevy::prelude::*;
use bevy_ecs_tilemap::prelude::*;
use glyphweave_core::tile::TileKind;

pub fn sync_edits(
    mut reader: MessageReader<EditEvent>,
    world_model: Res<WorldModel>,
    tile_entities: Res<TileEntities>,
    mut tiles: Query<&mut TileTextureIndex>,
) {
    // P1 edits the active layer; find its index in the spawn order.
    let active_index = world_model
        .layers
        .iter()
        .position(|l| l.id == world_model.active_layer)
        .unwrap_or(0);

    for ev in reader.read() {
        let Some(&entity) = tile_entities.map.get(&(active_index, ev.x, ev.y)) else {
            continue;
        };
        let Ok(mut tex) = tiles.get_mut(entity) else {
            continue;
        };
        match ev.edit {
            glyphweave_core::edit::Edit::Set(kind) => {
                tex.0 = tile_index(kind);
            }
            glyphweave_core::edit::Edit::Erase => {
                tex.0 = tile_index(TileKind::Void);
            }
        }
    }
}
```

- [ ] Modify `bevy/crates/app/src/main.rs`: add `mod render_sync;` and register it in `Update`, ordered after the tool system (wired fully in Task 16). For now:

```rust
        .add_systems(Update, render_sync::sync_edits)
```

- [ ] Run: `cargo check --manifest-path bevy/Cargo.toml -p glyphweave-app` — expect: compiles.
- [ ] Commit: `feat(bevy): sync tile render state from edit events`

---

### Task 15: `app/camera.rs` — `Camera2d`, wheel zoom-to-cursor, drag pan

**Key fixes vs. draft:** wheel scroll reads the `AccumulatedMouseScroll` RESOURCE (no `MessageReader<MouseWheel>` / no `add_message::<MouseWheel>` ambiguity); `PanState` is a `Local` (no unused `Resource` derive); the dead `camera_plugin` fn is removed; `spawn_camera` injects an explicit `OrthographicProjection` we can scale.

**Files:** Create `bevy/crates/app/src/camera.rs`; Modify `bevy/crates/app/src/main.rs`.

- [ ] Create `bevy/crates/app/src/camera.rs`:

```rust
//! 2D camera with wheel zoom-to-cursor and middle/right-drag pan.
//! Pan/zoom are suppressed while egui wants pointer input.
use bevy::input::mouse::AccumulatedMouseScroll;
use bevy::prelude::*;
use bevy_egui::input::egui_wants_any_pointer_input;

/// Spawn a Camera2d with an explicit OrthographicProjection we can mutate.
pub fn spawn_camera(mut commands: Commands) {
    commands.spawn((
        Camera2d,
        Projection::from(OrthographicProjection {
            scale: 1.0,
            ..OrthographicProjection::default_2d()
        }),
    ));
}

#[derive(Default, Debug, Clone, Copy)]
pub struct PanState {
    pub last_cursor: Option<Vec2>,
}

pub fn zoom_to_cursor(
    cam: Single<(&Camera, &GlobalTransform, &mut Transform, &mut Projection)>,
    window: Single<&Window>,
    scroll: Res<AccumulatedMouseScroll>,
) {
    let (camera, cam_gtf, mut cam_tf, mut projection) = cam.into_inner();
    let Projection::Orthographic(ref mut ortho) = *projection else { return; };

    // Prefer line units; fall back to clamped pixel units.
    let dy = if scroll.line.y.abs() > 1e-3 {
        scroll.line.y
    } else {
        scroll.pixel.y.clamp(-1.0, 1.0)
    };
    if dy.abs() < 1e-3 { return; }

    let Some(cursor) = window.cursor_position() else { return; };
    let Ok(world_before) = camera.viewport_to_world_2d(cam_gtf, cursor) else { return; };

    // Scroll up (dy>0) -> zoom in (smaller scale).
    let factor = 1.0 - dy.signum() * 0.1;
    ortho.scale = (ortho.scale * factor).clamp(0.05, 50.0);

    if let Ok(world_after) = camera.viewport_to_world_2d(cam_gtf, cursor) {
        cam_tf.translation.x += world_before.x - world_after.x;
        cam_tf.translation.y += world_before.y - world_after.y;
    }
}

pub fn pan_camera(
    mut cam_tf: Single<&mut Transform, With<Camera2d>>,
    buttons: Res<ButtonInput<MouseButton>>,
    window: Single<&Window>,
    camera: Single<(&Camera, &GlobalTransform)>,
    mut state: Local<PanState>,
) {
    let dragging = buttons.pressed(MouseButton::Middle) || buttons.pressed(MouseButton::Right);
    let (cam, gtf) = *camera;
    let Some(p) = window.cursor_position() else {
        state.last_cursor = None;
        return;
    };

    if !dragging {
        state.last_cursor = Some(p);
        return;
    }

    let Some(prev) = state.last_cursor else {
        state.last_cursor = Some(p);
        return;
    };

    if let (Ok(w_prev), Ok(w_now)) = (
        cam.viewport_to_world_2d(gtf, prev),
        cam.viewport_to_world_2d(gtf, p),
    ) {
        let delta = w_prev - w_now;
        cam_tf.translation.x += delta.x;
        cam_tf.translation.y += delta.y;
    }
    state.last_cursor = Some(p);
}
```

- [ ] Modify `bevy/crates/app/src/main.rs`:
  - add `mod camera;`
  - REMOVE the Task-11 `spawn_camera` fn and replace its use in the Startup chain with `camera::spawn_camera`. The Startup chain (post-Task-13) is `(camera::spawn_camera, render::atlas::load_atlas, load_initial_world, render::tilemap::spawn_tilemaps).chain()`.
  - add the camera update systems, gated on egui not wanting pointer input:

```rust
        .add_systems(
            Update,
            (camera::pan_camera, camera::zoom_to_cursor)
                .run_if(not(bevy_egui::input::egui_wants_any_pointer_input)),
        )
```

- [ ] Run: `cargo check --manifest-path bevy/Cargo.toml -p glyphweave-app` — expect: compiles.
- [ ] Run smoke: `cargo run --manifest-path bevy/Cargo.toml -p glyphweave-app` — expect: wheel zooms toward the cursor; middle/right-drag pans. Close window.
- [ ] Commit: `feat(bevy): add zoom-to-cursor and drag pan camera`

---

### Task 16: `app/input.rs` + `app/tool.rs` — paint/erase via `EditEvent` (pure fns RED → PASS)

**Key fixes vs. draft:** cursor→tile uses the tilemap crate's own projection helper `TilePos::from_world_pos` (confirmed by the Task 2 spike) instead of hand-rolled floor division, so the read-out and painting match the renderer's convention exactly; the signed conversion + bounds check are pure free functions, unit-tested; `tool_system` honors `Layer.locked`; no `ApplyDeferred` in the chain (MessageWriter writes are immediate to the resource; `.chain()` ordering suffices); dead helpers (`set_brush`, `_world_link`) removed.

**Files:** Create `bevy/crates/app/src/input.rs`; Create `bevy/crates/app/src/tool.rs`; Modify `bevy/crates/app/src/main.rs`.

- [ ] RED: create `bevy/crates/app/src/input.rs` with only the pure-fn tests:

```rust
use crate::render::MapBounds;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn signed_from_local_origin() {
        assert_eq!(signed_from_local(0, 0, -5, -3), (-5, -3));
    }

    #[test]
    fn signed_from_local_offset() {
        assert_eq!(signed_from_local(2, 4, -5, -3), (-3, 1));
    }

    #[test]
    fn in_bounds_true_inside() {
        let b = MapBounds { min_x: -5, min_y: -3, width: 5, height: 4 };
        assert!(in_bounds(-5, -3, &b));
        assert!(in_bounds(-1, 0, &b));
    }

    #[test]
    fn in_bounds_false_outside() {
        let b = MapBounds { min_x: -5, min_y: -3, width: 5, height: 4 };
        assert!(!in_bounds(-6, -3, &b));
        assert!(!in_bounds(-5, 1, &b)); // y = min_y + height is out
    }
}
```

- [ ] Run: `cargo test --manifest-path bevy/Cargo.toml -p glyphweave-app input` — expect FAIL.
- [ ] PASS: prepend the pure fns + the Bevy system so `input.rs` becomes:

```rust
//! Cursor -> tile coordinate. Updates CursorTile for UI and tool use.
use crate::render::MapBounds;
use crate::resource::CursorTile;
use bevy::prelude::*;

/// Pure: convert a local (in-bounds) tile pos to a signed tile coord.
pub fn signed_from_local(lx: u32, ly: u32, min_x: i32, min_y: i32) -> (i32, i32) {
    (min_x + lx as i32, min_y + ly as i32)
}

/// Pure: is a signed tile coord within the bounded map?
pub fn in_bounds(tx: i32, ty: i32, b: &MapBounds) -> bool {
    let lx = tx - b.min_x;
    let ly = ty - b.min_y;
    lx >= 0 && ly >= 0 && (lx as u32) < b.width && (ly as u32) < b.height
}

pub fn update_cursor_tile(
    camera_q: Single<(&Camera, &GlobalTransform)>,
    tilemap_q: Single<(&GlobalTransform, &TilemapSize, &TilemapGridSize, &TilemapTileSize, &TilemapType, &TilemapAnchor), With<crate::render::tilemap::TilemapLayer>>,
    window: Single<&Window>,
    bounds: Option<Res<MapBounds>>,
    mut cursor: ResMut<CursorTile>,
) {
    use bevy_ecs_tilemap::prelude::*;
    let (cam, gtf) = *camera_q;
    let Some(p) = window.cursor_position() else {
        cursor.valid = false;
        return;
    };
    let Ok(world) = cam.viewport_to_world_2d(gtf, p) else {
        cursor.valid = false;
        return;
    };
    let (tm_gtf, map_size, grid_size, tile_size, map_type, anchor) = tilemap_q.into_inner();
    // Transform world point into the tilemap's local space.
    let local = tm_gtf.to_matrix().inverse().transform_point3(world.extend(0.0)).truncate();
    match TilePos::from_world_pos(&local, map_size, grid_size, tile_size, map_type, anchor) {
        Some(tp) => {
            let b = bounds.map(|b| *b).unwrap_or_default();
            let (tx, ty) = signed_from_local(tp.x, tp.y, b.min_x, b.min_y);
            cursor.x = tx;
            cursor.y = ty;
            cursor.valid = in_bounds(tx, ty, &b);
        }
        None => {
            cursor.valid = false;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn signed_from_local_origin() {
        assert_eq!(signed_from_local(0, 0, -5, -3), (-5, -3));
    }

    #[test]
    fn signed_from_local_offset() {
        assert_eq!(signed_from_local(2, 4, -5, -3), (-3, 1));
    }

    #[test]
    fn in_bounds_true_inside() {
        let b = MapBounds { min_x: -5, min_y: -3, width: 5, height: 4 };
        assert!(in_bounds(-5, -3, &b));
        assert!(in_bounds(-1, 0, &b));
    }

    #[test]
    fn in_bounds_false_outside() {
        let b = MapBounds { min_x: -5, min_y: -3, width: 5, height: 4 };
        assert!(!in_bounds(-6, -3, &b));
        assert!(!in_bounds(-5, 1, &b));
    }
}
```

- [ ] Create `bevy/crates/app/src/tool.rs` (locked-flag enforced; no dead helpers):

```rust
//! Tool system: left-drag paints, B selects brush, E selects erase.
//! Produces EditEvents + applies edits to the core World (single source of truth).
use crate::ActiveBrush;
use crate::resource::{EditEvent, WorldModel};
use bevy::ecs::message::MessageWriter;
use bevy::prelude::*;
use glyphweave_core::edit::Edit;
use glyphweave_core::tile::TileKind;

pub fn tool_system(
    buttons: Res<ButtonInput<MouseButton>>,
    keys: Res<ButtonInput<KeyCode>>,
    mut writer: MessageWriter<EditEvent>,
    mut world: ResMut<WorldModel>,
    mut active_brush: ResMut<ActiveBrush>,
    cursor: Res<crate::resource::CursorTile>,
) {
    if keys.just_pressed(KeyCode::KeyB) {
        active_brush.0 = TileKind::Floor;
    }
    if keys.just_pressed(KeyCode::KeyE) {
        active_brush.0 = TileKind::Void;
    }

    if !buttons.pressed(MouseButton::Left) || !cursor.valid {
        return;
    }

    // Honor the locked flag on the active layer.
    let active_locked = world
        .layer(&world.active_layer)
        .map(|l| l.locked)
        .unwrap_or(false);
    if active_locked {
        return;
    }

    let active_layer = world.active_layer.clone();
    let edit = if matches!(active_brush.0, TileKind::Void) {
        Edit::Erase
    } else {
        Edit::Set(active_brush.0)
    };

    edit.apply(&mut world.0, &active_layer, cursor.x, cursor.y);
    writer.write(EditEvent { x: cursor.x, y: cursor.y, edit });
}
```

- [ ] Modify `bevy/crates/app/src/main.rs`: add `mod input;` and `mod tool;`, and replace the Task-14 `render_sync` Update registration with an ordered chain (NO `ApplyDeferred` — MessageWriter writes are immediate; `.chain()` ordering suffices) gated on egui:

```rust
        .add_systems(
            Update,
            (
                input::update_cursor_tile,
                tool::tool_system,
                render_sync::sync_edits,
            )
                .chain()
                .run_if(not(bevy_egui::input::egui_wants_any_pointer_input)),
        )
```

- [ ] Run: `cargo test --manifest-path bevy/Cargo.toml -p glyphweave-app input` — expect PASS (4 pure tests).
- [ ] Run: `cargo check --manifest-path bevy/Cargo.toml -p glyphweave-app` — expect: compiles.
- [ ] Run smoke: `cargo run --manifest-path bevy/Cargo.toml -p glyphweave-app` — expect: hold Left Mouse and drag over the map; tiles change to Floor. Press `E`, drag: tiles clear to Void. Press `B` to revert. Close window.
- [ ] Commit: `feat(bevy): brush and erase tools via edit events`

---

### Task 17: `app/ui.rs` — egui overlay (FPS, cursor tile, world info, Save)

**Key fixes vs. draft:** removed the unused `MessageWriter<EditEvent>` parameter; removed the lying "Reload (discard edits)" button (reload-while-running is a declared Non-Goal for P1); Save writes next to the loaded path.

**Files:** Create `bevy/crates/app/src/ui.rs`; Modify `bevy/crates/app/src/main.rs`.

- [ ] Create `bevy/crates/app/src/ui.rs`:

```rust
//! egui overlay: FPS, cursor tile coords, world info, Save button.
use crate::render::MapBounds;
use crate::resource::{CursorTile, WorldModel};
use bevy::diagnostic::DiagnosticsStore;
use bevy::prelude::*;
use bevy_egui::{egui, EguiContexts};
use glyphweave_core::gemap::save_world;
use std::path::PathBuf;

/// Where the most recent load came from / where Save writes.
#[derive(Resource, Debug, Clone, Default)]
pub struct CurrentMapPath(pub Option<PathBuf>);

pub fn ui_overlay(
    mut contexts: EguiContexts,
    diagnostics: Res<DiagnosticsStore>,
    cursor: Res<CursorTile>,
    world_model: Res<WorldModel>,
    bounds: Option<Res<MapBounds>>,
    path: Res<CurrentMapPath>,
) {
    let fps = diagnostics
        .get(&bevy::diagnostic::FrameTimeDiagnosticsPlugin::FPS)
        .and_then(|d| d.smoothed())
        .map(|v| format!("{v:.1}"))
        .unwrap_or_else(|| "—".into());

    let Some(ctx) = contexts.ctx_mut().ok() else { return };

    egui::TopBottomPanel::top("overlay").show(ctx, |ui| {
        ui.horizontal(|ui| {
            ui.label(format!("FPS: {fps}"));
            ui.separator();
            if cursor.valid {
                ui.label(format!("tile: ({}, {})", cursor.x, cursor.y));
            } else {
                ui.label("tile: —");
            }
            if let Some(b) = bounds.as_deref() {
                ui.separator();
                ui.label(format!("map: {}x{}", b.width, b.height));
            }
        });
    });

    egui::SidePanel::left("info").show(ctx, |ui| {
        ui.heading(&world_model.world_name);
        ui.label(format!("theme: {}", world_model.theme_id));
        ui.label(format!("tile size: {}px", world_model.tile_size));
        ui.add_space(8.0);
        ui.label(format!("layers: {}", world_model.layers.len()));
        for (i, l) in world_model.layers.iter().enumerate() {
            ui.label(format!(
                "{}: {} {}{}",
                i,
                l.name,
                if l.visible { "[vis]" } else { "[hid]" },
                if l.id == world_model.active_layer { " *" } else { "" },
            ));
        }
        ui.add_space(12.0);
        ui.label("[B] brush  [E] erase  [L-drag] paint");
        ui.label("[wheel] zoom  [mid/right-drag] pan");

        ui.add_space(12.0);
        if ui.button("Save .gemap").clicked() {
            let target = path
                .0
                .clone()
                .unwrap_or_else(|| PathBuf::from("glyphweave_save.gemap"));
            match save_world(&world_model.0, &target) {
                Ok(()) => println!("[glyphweave] saved {}", target.display()),
                Err(e) => eprintln!("[glyphweave] save failed: {e}"),
            }
        }
    });
}
```

- [ ] Modify `bevy/crates/app/src/main.rs`:
  - add `mod ui;`
  - REMOVE the `fps_overlay` fn and its `EguiPrimaryContextPass` registration; replace with `ui::ui_overlay`.
  - add `.init_resource::<ui::CurrentMapPath>()` and `.add_systems(EguiPrimaryContextPass, ui::ui_overlay)`.
  - update `load_initial_world` to remember the loaded path. Replace the body of `load_initial_world` with:

```rust
fn load_initial_world(mut commands: Commands) {
    let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.pop(); p.pop(); p.pop(); // repo root
    p.push("examples");
    p.push("grand-realm-of-aethra.gemap");
    let world = match load_world(&p) {
        Ok(w) => {
            println!("[glyphweave] loaded {} ({} layers)", p.display(), w.layers.len());
            commands.insert_resource(ui::CurrentMapPath(Some(p.clone())));
            w
        }
        Err(e) => {
            eprintln!("[glyphweave] failed to load {}: {e}; starting empty", p.display());
            commands.insert_resource(ui::CurrentMapPath(Some(p.clone())));
            glyphweave_core::world::World::default()
        }
    };
    commands.insert_resource(WorldModel(world));
}
```

- [ ] Run: `cargo check --manifest-path bevy/Cargo.toml -p glyphweave-app` — expect: compiles.
- [ ] Run smoke: `cargo run --manifest-path bevy/Cargo.toml -p glyphweave-app` — expect: top bar shows FPS + live tile coord; left panel shows world name, theme, tile size, the 3 layers, hotkey help, and a Save button. Close window.
- [ ] Commit: `feat(bevy): egui overlay with save button`

---

### Task 18: `app/main.rs` — final assembly + `--check-load` headless verification

**Key fixes vs. draft:** single, internally-consistent cumulative `main.rs`; an explicit `--check-load` mode that loads the example world and exits with a greppable line (machine-verifiable, no window); the Update chain has NO `ApplyDeferred` (`.chain()` ordering suffices for MessageWriter→MessageReader).

**Files:** Modify `bevy/crates/app/src/main.rs` (final cumulative version).

- [ ] Replace `bevy/crates/app/src/main.rs` with:

```rust
//! GlyphWeave desktop app (Bevy 0.18 + bevy_ecs_tilemap 0.18 + bevy_egui 0.39).
mod camera;
mod input;
mod render;
mod render_sync;
mod resource;
mod tool;
mod ui;

use bevy::asset::AssetPlugin;
use bevy::diagnostic::FrameTimeDiagnosticsPlugin;
use bevy::prelude::*;
use bevy_ecs_tilemap::prelude::TilemapPlugin;
use bevy_egui::{EguiPlugin, EguiPrimaryContextPass};
use glyphweave_core::gemap::load_world;
use glyphweave_core::tile::TileKind;
use resource::{CursorTile, EditEvent, WorldModel};
use std::path::PathBuf;

#[derive(Resource, Debug, Clone, Copy)]
pub struct ActiveBrush(pub TileKind);

fn main() {
    // Headless load check: load the example world and exit. Machine-verifiable,
    // no window. Used by smoke steps: `cargo run ... -- --check-load`.
    if std::env::args().any(|a| a == "--check-load") {
        let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        p.pop(); p.pop(); p.pop();
        p.push("examples");
        p.push("grand-realm-of-aethra.gemap");
        match load_world(&p) {
            Ok(w) => {
                println!("[glyphweave-check] OK layers={}", w.layers.len());
                std::process::exit(0);
            }
            Err(e) => {
                eprintln!("[glyphweave-check] FAIL {e}");
                std::process::exit(2);
            }
        }
    }

    App::new()
        .add_plugins(
            DefaultPlugins
                .set(WindowPlugin {
                    primary_window: Some(Window {
                        title: "GlyphWeave".into(),
                        resolution: (1280.0, 720.0).into(),
                        ..default()
                    }),
                    ..default()
                })
                .set(ImagePlugin::default_nearest())
                .set(AssetPlugin {
                    file_path: "bevy/assets".to_string(),
                    ..default()
                }),
        )
        .add_plugins(FrameTimeDiagnosticsPlugin::default())
        .add_plugins(EguiPlugin::default())
        .add_plugins(TilemapPlugin)
        .register_type::<render::tilemap::TilemapLayer>()
        .add_message::<EditEvent>()
        .init_resource::<CursorTile>()
        .init_resource::<render::tilemap::TileEntities>()
        .init_resource::<ui::CurrentMapPath>()
        .insert_resource(ActiveBrush(TileKind::Floor))
        .add_systems(
            Startup,
            (
                camera::spawn_camera,
                render::atlas::load_atlas,
                load_initial_world,
                render::tilemap::spawn_tilemaps,
            )
                .chain(),
        )
        .add_systems(
            Update,
            (
                input::update_cursor_tile,
                tool::tool_system,
                render_sync::sync_edits,
            )
                .chain()
                .run_if(not(bevy_egui::input::egui_wants_any_pointer_input)),
        )
        .add_systems(
            Update,
            (camera::pan_camera, camera::zoom_to_cursor)
                .run_if(not(bevy_egui::input::egui_wants_any_pointer_input)),
        )
        .add_systems(EguiPrimaryContextPass, ui::ui_overlay)
        .run();
}

fn load_initial_world(mut commands: Commands) {
    let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.pop(); p.pop(); p.pop(); // repo root
    p.push("examples");
    p.push("grand-realm-of-aethra.gemap");
    let world = match load_world(&p) {
        Ok(w) => {
            println!("[glyphweave] loaded {} ({} layers)", p.display(), w.layers.len());
            commands.insert_resource(ui::CurrentMapPath(Some(p.clone())));
            w
        }
        Err(e) => {
            eprintln!("[glyphweave] failed to load {}: {e}; starting empty", p.display());
            commands.insert_resource(ui::CurrentMapPath(Some(p.clone())));
            glyphweave_core::world::World::default()
        }
    };
    commands.insert_resource(WorldModel(world));
}
```

- [ ] Run: `cargo check --manifest-path bevy/Cargo.toml -p glyphweave-app` — expect: compiles.
- [ ] Run headless load check (machine-verifiable, terminates): `cargo run --manifest-path bevy/Cargo.toml -p glyphweave-app -- --check-load 2>&1 | grep -q '\[glyphweave-check\] OK layers=3'` — expect: grep matches (exit 0). This confirms the real 3-layer load path works headlessly.
- [ ] Run window smoke: `cargo run --manifest-path bevy/Cargo.toml -p glyphweave-app` — expect: Aethra map renders, 3 layers listed in the left panel, FPS top bar, paint/erase/zoom/pan all work, Save writes a `.gemap`. Close window.
- [ ] Commit: `feat(bevy): assemble final app schedule`

---

### Task 19: Integration verification — full DoD sweep + clippy + tree reconciliation

**Files:** No new code files. Verification only (AGENTS.md may be edited if the tree drifted).

- [ ] Run core tests: `cargo test --manifest-path bevy/Cargo.toml -p glyphweave-core` — expect: all green, including `gemap::tests::integration_round_trip_real_aethra_map` (which hard-asserts the example path exists — no silent skip).
- [ ] Run app unit tests: `cargo test --manifest-path bevy/Cargo.toml -p glyphweave-app` — expect: green (atlas `tile_index`, tilemap `compute_bounds`, input `signed_from_local`/`in_bounds`).
- [ ] Run clippy on the whole workspace: `cargo clippy --manifest-path bevy/Cargo.toml --workspace --all-targets -- -D warnings` — expect: no warnings. If any appear (common: an unused import after wiring), fix them and commit as `chore(bevy): clippy cleanup`.
- [ ] Reconcile the AGENTS.md directory tree: run `node scripts/generate-tree.mjs --check` — it must PASS (exit 0). If it prints `[FAIL] Directory tree in AGENTS.md is outdated.`, run `pnpm doc-tree`, update the tree block(s) in `AGENTS.md` to include the full `bevy/` subtree, stage `AGENTS.md`, and commit as `docs(bevy): reconcile directory tree`.
- [ ] Run the app and verify the manual checklist:
  - [ ] `cargo run --manifest-path bevy/Cargo.toml -p glyphweave-app -- --check-load 2>&1 | grep -q 'layers=3'` matches.
  - [ ] Window opens 1280x720 titled "GlyphWeave".
  - [ ] The Grand Realm of Aethra map is visible as a colored tile grid (3 layers stacked; higher layer index renders on top).
  - [ ] Layers panel lists the 3 layers (Terrain / Structures / Details).
  - [ ] Moving the mouse updates the `tile: (x, y)` read-out.
  - [ ] Mouse wheel zooms toward the cursor (map point under cursor stays fixed).
  - [ ] Middle- or right-drag pans the view.
  - [ ] Left-drag paints Floor tiles (press `B` first); painting on a previously-empty cell works (every in-bounds cell has a tile entity).
  - [ ] Pressing `E` then Left-drag erases tiles (cell becomes Void).
  - [ ] Clicking `Save .gemap` writes a file; the console prints `[glyphweave] saved <path>`; round-tripping that file is covered by `gemap::tests::integration_round_trip_real_aethra_map`.
- [ ] Confirm `git status` is clean on the `dev` branch after all commits.

---

## Acceptance criteria

- [ ] `cargo run -p glyphweave-app -- --check-load 2>&1 | grep -q 'layers=3'` matches (headless load of the real 3-layer map).
- [ ] `cargo run -p glyphweave-app` opens a desktop window titled "GlyphWeave".
- [ ] The app loads `examples/grand-realm-of-aethra.gemap` and renders the map's 3 ansi-16 layers stacked (z-order: higher layer index on top).
- [ ] Brush (`B`) paints Floor and Erase (`E`) clears on layer-1 / active layer via left-mouse drag, including on cells that were empty at load time.
- [ ] Mouse wheel zooms toward the cursor; middle/right-drag pans.
- [ ] `Save .gemap` writes a `.gemap` v2 file with both `layerTiles` (authoritative) and `tiles` (layer-1 flatten) for back-compat.
- [ ] A round-trip integration test (`integration_round_trip_real_aethra_map`) loads -> saves -> reloads the example map and asserts per-layer semantic equality; it hard-asserts the example path exists (no silent skip) and passes.
- [ ] A minimal egui overlay shows FPS, cursor tile coords, world name, theme, and tile size.
- [ ] `cargo test -p glyphweave-core` and `cargo test -p glyphweave-app` are fully green; `cargo clippy --workspace --all-targets -- -D warnings` is clean; `node scripts/generate-tree.mjs --check` passes.
