# bevy 0.18 API confirmations

Verified via a throwaway `cargo check` spike (Task 2 of the P1 plan) against the
pinned triple **bevy 0.18.1 + bevy_ecs_tilemap 0.18.1 + bevy_egui 0.39.1**.
These override any stale assumptions in later tasks.

| Concern | Confirmed form (bevy 0.18.1) |
|---|---|
| Accumulated mouse scroll | `Res<bevy::input::mouse::AccumulatedMouseScroll>` has fields **`unit: MouseScrollUnit`** and **`delta: Vec2`** (NOT `line`/`pixel`). Zoom uses `scroll.delta.y`. |
| Egui context | `EguiContexts::ctx_mut(&mut self)` requires a `mut` binding; returns `Result<egui::Context>` (use `if let Ok(ctx) = contexts.ctx_mut()`). |
| Egui system set | `bevy_egui::EguiPrimaryContextPass` exists; register overlay systems there. |
| Messages (replaces Events for our intra-frame edit stream) | `#[derive(Message, Clone, Copy, Debug)]` on the event struct; `bevy::ecs::message::{MessageReader<T>, MessageWriter<T>}`; register with `app.add_message::<T>()`. |
| Tilemap bundle | `TilemapBundle { grid_size, map_type, size, spacing, storage, texture, tile_size, transform, anchor, ..default() }` — all fields valid; `TilemapBundle: Default`. |
| Tilemap texture | `TilemapTexture::Single(Handle<Image>)`. |
| Tilemap anchor | `TilemapAnchor::TopLeft` exists (origin at top-left; +x right, +y down). |
| Cursor -> tile | `TilePos::from_world_pos(&Vec2, &TilemapSize, &TilemapGridSize, &TilemapTileSize, &TilemapType, &TilemapAnchor)` resolves. |
| Image type | `bevy::image::Image` (re-exported in prelude); NOT `bevy::render::texture::Image`. |
| Window resolution | `bevy::window::WindowResolution::new(u32, u32)` — no `From<(f32,f32)>`; literals are `u32`. |
| `bevy_ecs_tilemap` feature | `features = ["atlas"]` resolves (avoids array-texture preprocessing). |
