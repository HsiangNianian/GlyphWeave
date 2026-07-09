//! Spawn a bounded composite TilemapBundle with tile entities only for cells
//! near the camera. Empty upper-layer cells are transparent by composition,
//! matching the sparse web renderer while avoiding huge entity counts on large
//! maps.
#![allow(clippy::type_complexity)]

use crate::render::MapBounds;
use crate::render::atlas::{TileAtlas, tile_index};
use crate::resource::{ActiveTheme, CursorTile, EditorViewSettings, WorldModel};
use crate::viewport::world_viewport_bounds_current;
use bevy::prelude::*;
use bevy_ecs_tilemap::prelude::*;
use glyphweave_core::tile::TileKind;
use glyphweave_core::world::World;
use std::collections::{HashMap, HashSet, VecDeque};

/// Tags a tilemap entity; carries its layer index for sync lookups.
/// NOTE: NOT `Copy` (has a String field); `Clone` only.
#[derive(Component, Reflect, Debug, Clone)]
#[reflect(Component)]
pub struct TilemapLayer {
    pub index: usize,
    pub layer_id: String,
    pub chunk: Option<RenderChunkCoord>,
}

pub const COMPOSITE_LAYER_ID: &str = "__composite__";

#[derive(Component, Reflect, Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[reflect(Component)]
pub struct RenderChunkCoord {
    pub x: i32,
    pub y: i32,
}

/// Strong map from (layer_index, tile_x, tile_y) -> tile entity, for fast sync.
#[derive(Resource, Default, Debug)]
pub struct TileEntities {
    pub map: HashMap<(usize, i32, i32), Entity>,
    pub chunks: HashMap<RenderChunkCoord, Entity>,
    preview_chunks: HashMap<RenderChunkCoord, Entity>,
    desired_chunks: HashSet<RenderChunkCoord>,
    queued_chunks: VecDeque<RenderChunkCoord>,
    dirty_preview_chunks: HashSet<RenderChunkCoord>,
    chunk_last_seen: HashMap<RenderChunkCoord, u64>,
    frame_index: u64,
}

impl TileEntities {
    pub fn mark_preview_dirty(&mut self, coord: RenderChunkCoord) {
        self.dirty_preview_chunks.insert(coord);
    }
}

#[derive(Component)]
pub struct FogOverlayTile;

#[derive(Component)]
pub struct ChunkPreviewTile {
    coord: RenderChunkCoord,
}

#[derive(Resource, Default, Debug)]
pub struct FogOverlayEntities {
    entities: Vec<Entity>,
}

/// Set when structural world changes require a full render rebuild.
#[derive(Resource, Default, Debug, Clone, Copy)]
pub struct RenderRefresh(pub bool);

#[derive(Resource, Default, Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum RenderBoundsMode {
    #[default]
    Viewport,
    World,
}

#[derive(Resource, Default, Debug, Clone, Copy, PartialEq, Eq)]
pub enum RenderLodMode {
    #[default]
    Tiles,
    Preview,
}

#[derive(Resource, Default, Debug, Clone, Copy)]
pub struct RenderMetrics {
    pub lod_mode: RenderLodMode,
    pub loaded_tile_chunks: usize,
    pub loaded_preview_chunks: usize,
    pub queued_tile_chunks: usize,
    pub visible_chunks: usize,
    pub tracked_tile_entities: usize,
}

const RENDER_CHUNK_TILES: i32 = 64;
const RENDER_CHUNK_TILES_U32: u32 = RENDER_CHUNK_TILES as u32;
const RENDER_CHUNK_BUILD_BUDGET: usize = 8;
const PREVIEW_CHUNK_BUILD_BUDGET: usize = 64;
const MAX_CACHED_TILE_CHUNKS: usize = 256;
const MAX_CACHED_PREVIEW_CHUNKS: usize = 512;
const RENDER_PADDING_TILES: i32 = 40;
const FULL_WORLD_RENDER_CELL_LIMIT: u64 = 300_000;
const FULL_WORLD_RENDER_AREA_RATIO: f32 = 0.08;
const PREVIEW_LOD_SCALE: f32 = 8.0;
const MIN_GRID_SCREEN_SPACING_PX: f32 = 8.0;
const PREVIEW_Z: f32 = -0.2;
const FOG_Z: f32 = 8.0;
const FOG_HIDDEN_ALPHA: f32 = 0.74;
const FOG_EDGE_ALPHA: f32 = 0.28;

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
                if x < min_x {
                    min_x = x;
                }
                if y < min_y {
                    min_y = y;
                }
                if x > max_x {
                    max_x = x;
                }
                if y > max_y {
                    max_y = y;
                }
            }
        }
    }
    if !any {
        return MapBounds {
            min_x: 0,
            min_y: 0,
            width: 1,
            height: 1,
        };
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
    active_theme: Res<ActiveTheme>,
    camera: Single<(&Transform, &Projection), With<Camera2d>>,
    window: Single<&Window>,
    mut tile_entities: ResMut<TileEntities>,
) {
    let (camera_transform, camera_projection) = *camera;
    let Some(view) = camera_view_bounds(
        camera_transform,
        camera_projection,
        &window,
        world_model.tile_size,
    ) else {
        return;
    };
    let (bounds, bounds_mode) = select_render_bounds(&world_model.0, view);
    let lod_mode = render_lod_mode(world_model.tile_size.max(1) as f32, camera_projection);

    commands.insert_resource(bounds);
    commands.insert_resource(bounds_mode);
    commands.insert_resource(lod_mode);

    queue_missing_chunks(&mut tile_entities, chunk_coords_for_bounds(bounds));
    build_queued_tile_chunks(
        &mut commands,
        &world_model.0,
        &atlas,
        &active_theme,
        &mut tile_entities,
        RENDER_CHUNK_BUILD_BUDGET,
    );
}

pub fn composite_tile_at(world: &World, x: i32, y: i32) -> Option<TileKind> {
    world.layers.iter().rev().find_map(|layer| {
        if !layer.visible {
            return None;
        }
        let kind = world.grid(&layer.id)?.get(x, y)?;
        (!matches!(kind, TileKind::Void)).then_some(kind)
    })
}

pub fn tile_render_state(kind: Option<TileKind>) -> (TileTextureIndex, TileVisible) {
    match kind {
        Some(kind) if !matches!(kind, TileKind::Void) => {
            (TileTextureIndex(tile_index(kind)), TileVisible(true))
        }
        _ => (
            TileTextureIndex(tile_index(TileKind::Void)),
            TileVisible(false),
        ),
    }
}

pub fn render_chunk_coord_for_tile(x: i32, y: i32) -> RenderChunkCoord {
    RenderChunkCoord {
        x: x.div_euclid(RENDER_CHUNK_TILES),
        y: y.div_euclid(RENDER_CHUNK_TILES),
    }
}

pub fn tile_pos_for_chunk(coord: RenderChunkCoord, x: i32, y: i32) -> Option<TilePos> {
    let min_x = coord.x * RENDER_CHUNK_TILES;
    let min_y = coord.y * RENDER_CHUNK_TILES;
    let local_x = x.checked_sub(min_x)?;
    let local_y = y.checked_sub(min_y)?;
    if !(0..RENDER_CHUNK_TILES).contains(&local_x) || !(0..RENDER_CHUNK_TILES).contains(&local_y) {
        return None;
    }
    Some(TilePos {
        x: local_x as u32,
        y: (RENDER_CHUNK_TILES - 1 - local_y) as u32,
    })
}

fn chunk_bounds(coord: RenderChunkCoord) -> MapBounds {
    MapBounds {
        min_x: coord.x * RENDER_CHUNK_TILES,
        min_y: coord.y * RENDER_CHUNK_TILES,
        width: RENDER_CHUNK_TILES_U32,
        height: RENDER_CHUNK_TILES_U32,
    }
}

fn chunk_coords_for_bounds(bounds: MapBounds) -> Vec<RenderChunkCoord> {
    let max_x = bounds.min_x + bounds.width as i32 - 1;
    let max_y = bounds.min_y + bounds.height as i32 - 1;
    let min_cx = bounds.min_x.div_euclid(RENDER_CHUNK_TILES);
    let max_cx = max_x.div_euclid(RENDER_CHUNK_TILES);
    let min_cy = bounds.min_y.div_euclid(RENDER_CHUNK_TILES);
    let max_cy = max_y.div_euclid(RENDER_CHUNK_TILES);

    let mut chunks = Vec::new();
    for cy in min_cy..=max_cy {
        for cx in min_cx..=max_cx {
            chunks.push(RenderChunkCoord { x: cx, y: cy });
        }
    }
    chunks
}

fn queue_missing_chunks(tile_entities: &mut TileEntities, desired_chunks: Vec<RenderChunkCoord>) {
    tile_entities.desired_chunks = desired_chunks.iter().copied().collect();
    tile_entities.frame_index = tile_entities.frame_index.wrapping_add(1);
    for coord in &tile_entities.desired_chunks {
        tile_entities
            .chunk_last_seen
            .insert(*coord, tile_entities.frame_index);
    }
    tile_entities.queued_chunks.retain(|coord| {
        tile_entities.desired_chunks.contains(coord) && !tile_entities.chunks.contains_key(coord)
    });
    for coord in desired_chunks {
        if tile_entities.chunks.contains_key(&coord) || tile_entities.queued_chunks.contains(&coord)
        {
            continue;
        }
        tile_entities.queued_chunks.push_back(coord);
    }
}

fn build_queued_tile_chunks(
    commands: &mut Commands,
    world: &World,
    atlas: &TileAtlas,
    active_theme: &ActiveTheme,
    tile_entities: &mut TileEntities,
    budget: usize,
) {
    for _ in 0..budget {
        let Some(coord) = tile_entities.queued_chunks.pop_front() else {
            return;
        };
        if tile_entities.chunks.contains_key(&coord) {
            continue;
        }
        let entity = spawn_tile_chunk(commands, world, atlas, active_theme, coord, tile_entities);
        tile_entities.chunks.insert(coord, entity);
    }
}

fn spawn_tile_chunk(
    commands: &mut Commands,
    world: &World,
    atlas: &TileAtlas,
    active_theme: &ActiveTheme,
    coord: RenderChunkCoord,
    tile_entities: &mut TileEntities,
) -> Entity {
    let bounds = chunk_bounds(coord);
    let tile_px = world.tile_size.max(1) as f32;
    let map_size = TilemapSize {
        x: RENDER_CHUNK_TILES_U32,
        y: RENDER_CHUNK_TILES_U32,
    };
    let tile_size = TilemapTileSize {
        x: tile_px,
        y: tile_px,
    };
    let grid_size = TilemapGridSize {
        x: tile_px,
        y: tile_px,
    };
    let map_type = TilemapType::default();
    let tilemap_entity = commands.spawn_empty().id();
    let mut tile_storage = TileStorage::empty(map_size);

    for ly in 0..RENDER_CHUNK_TILES_U32 {
        for lx in 0..RENDER_CHUNK_TILES_U32 {
            let tx = bounds.min_x + lx as i32;
            let ty = bounds.min_y + ly as i32;
            if let Some(kind) = composite_tile_at(world, tx, ty) {
                let Some(tile_pos) = tile_pos_for_chunk(coord, tx, ty) else {
                    continue;
                };
                let (texture_index, visible) = tile_render_state(Some(kind));
                let tile_entity = commands
                    .spawn(TileBundle {
                        position: tile_pos,
                        tilemap_id: TilemapId(tilemap_entity),
                        texture_index,
                        visible,
                        ..default()
                    })
                    .id();
                tile_storage.set(&tile_pos, tile_entity);
                tile_entities.map.insert((0, tx, ty), tile_entity);
            }
        }
    }

    commands.entity(tilemap_entity).insert((
        TilemapLayer {
            index: 0,
            layer_id: COMPOSITE_LAYER_ID.into(),
            chunk: Some(coord),
        },
        TilemapBundle {
            grid_size,
            map_type,
            size: map_size,
            spacing: TilemapSpacing::default(),
            storage: tile_storage,
            texture: TilemapTexture::Single(atlas.handle_for(&active_theme.0)),
            tile_size,
            transform: Transform::from_xyz(
                bounds.min_x as f32 * tile_px,
                -bounds.min_y as f32 * tile_px,
                0.0,
            ),
            render_settings: TilemapRenderSettings {
                render_chunk_size: UVec2::splat(RENDER_CHUNK_TILES_U32),
                ..default()
            },
            anchor: TilemapAnchor::TopLeft,
            visibility: Visibility::Visible,
            ..default()
        },
    ));
    tilemap_entity
}

fn sync_tile_chunk_visibility(
    tile_entities: &TileEntities,
    lod_mode: RenderLodMode,
    tilemaps: &mut Query<
        (Entity, &TilemapLayer, &mut TileStorage, &mut Visibility),
        (With<TilemapLayer>, Without<ChunkPreviewTile>),
    >,
) {
    for (_, layer, _, mut visibility) in tilemaps.iter_mut() {
        let Some(coord) = layer.chunk else {
            continue;
        };
        let visible =
            lod_mode == RenderLodMode::Tiles && tile_entities.desired_chunks.contains(&coord);
        *visibility = if visible {
            Visibility::Visible
        } else {
            Visibility::Hidden
        };
    }
}

fn sync_preview_chunks(
    commands: &mut Commands,
    world: &World,
    lod_mode: RenderLodMode,
    tile_entities: &mut TileEntities,
    preview_tiles: &mut Query<
        (
            Entity,
            &ChunkPreviewTile,
            &mut Sprite,
            &mut Transform,
            &mut Visibility,
        ),
        (
            With<ChunkPreviewTile>,
            Without<TilemapLayer>,
            Without<Camera2d>,
        ),
    >,
    budget: usize,
) {
    if lod_mode != RenderLodMode::Preview {
        for (_, _, _, _, mut visibility) in preview_tiles.iter_mut() {
            *visibility = Visibility::Hidden;
        }
        return;
    }

    for (_, preview, mut sprite, mut transform, mut visibility) in preview_tiles.iter_mut() {
        let desired = tile_entities.desired_chunks.contains(&preview.coord);
        if desired {
            if tile_entities.dirty_preview_chunks.remove(&preview.coord)
                && let Some(color) = chunk_preview_color(world, preview.coord)
            {
                sprite.color = color;
            }
            let bounds = chunk_bounds(preview.coord);
            let tile_px = world.tile_size.max(1) as f32;
            transform.translation = chunk_preview_center(bounds, tile_px);
            *visibility = Visibility::Visible;
        } else {
            *visibility = Visibility::Hidden;
        }
    }

    let missing: Vec<RenderChunkCoord> = tile_entities
        .desired_chunks
        .iter()
        .copied()
        .filter(|coord| !tile_entities.preview_chunks.contains_key(coord))
        .take(budget)
        .collect();
    for coord in missing {
        if let Some(entity) = spawn_preview_chunk(commands, world, coord) {
            tile_entities.preview_chunks.insert(coord, entity);
        }
    }
}

fn spawn_preview_chunk(
    commands: &mut Commands,
    world: &World,
    coord: RenderChunkCoord,
) -> Option<Entity> {
    let color = chunk_preview_color(world, coord)?;
    let bounds = chunk_bounds(coord);
    let tile_px = world.tile_size.max(1) as f32;
    Some(
        commands
            .spawn((
                ChunkPreviewTile { coord },
                Sprite {
                    color,
                    custom_size: Some(Vec2::splat(RENDER_CHUNK_TILES as f32 * tile_px)),
                    ..default()
                },
                Transform::from_translation(chunk_preview_center(bounds, tile_px)),
            ))
            .id(),
    )
}

fn chunk_preview_center(bounds: MapBounds, tile_px: f32) -> Vec3 {
    let size = RENDER_CHUNK_TILES as f32 * tile_px;
    Vec3::new(
        bounds.min_x as f32 * tile_px + size * 0.5,
        -(bounds.min_y as f32 * tile_px + size * 0.5),
        PREVIEW_Z,
    )
}

fn chunk_preview_color(world: &World, coord: RenderChunkCoord) -> Option<Color> {
    let bounds = chunk_bounds(coord);
    let mut counts: HashMap<TileKind, usize> = HashMap::new();
    for y in bounds.min_y..bounds.min_y + bounds.height as i32 {
        for x in bounds.min_x..bounds.min_x + bounds.width as i32 {
            let Some(kind) = composite_tile_at(world, x, y) else {
                continue;
            };
            *counts.entry(kind).or_default() += 1;
        }
    }
    let (dominant, count) = counts.into_iter().max_by_key(|(_, count)| *count)?;
    let coverage =
        (count as f32 / (RENDER_CHUNK_TILES * RENDER_CHUNK_TILES) as f32).clamp(0.16, 1.0);
    Some(tile_preview_color(dominant, coverage))
}

fn tile_preview_color(kind: TileKind, coverage: f32) -> Color {
    let alpha = 0.34 + coverage * 0.5;
    match kind {
        TileKind::Water | TileKind::DeepWater => Color::srgba(0.12, 0.36, 0.64, alpha),
        TileKind::Lava | TileKind::Blood => Color::srgba(0.7, 0.13, 0.08, alpha),
        TileKind::Tree | TileKind::Grass => Color::srgba(0.16, 0.48, 0.24, alpha),
        TileKind::Wall | TileKind::Pillar => Color::srgba(0.47, 0.47, 0.52, alpha),
        TileKind::Floor | TileKind::FloorAlt | TileKind::Bridge => {
            Color::srgba(0.43, 0.39, 0.31, alpha)
        }
        TileKind::Treasure | TileKind::Shop | TileKind::Throne => {
            Color::srgba(0.72, 0.54, 0.16, alpha)
        }
        _ => Color::srgba(0.34, 0.34, 0.39, alpha),
    }
}

fn render_lod_mode(tile_px: f32, camera_projection: &Projection) -> RenderLodMode {
    let screen_px = tile_px / orthographic_scale(camera_projection).max(f32::EPSILON);
    if screen_px < PREVIEW_LOD_SCALE {
        RenderLodMode::Preview
    } else {
        RenderLodMode::Tiles
    }
}

fn clear_render_cache(
    commands: &mut Commands,
    tile_entities: &mut TileEntities,
    tilemaps: &mut Query<
        (Entity, &TilemapLayer, &mut TileStorage, &mut Visibility),
        (With<TilemapLayer>, Without<ChunkPreviewTile>),
    >,
    preview_tiles: &mut Query<
        (
            Entity,
            &ChunkPreviewTile,
            &mut Sprite,
            &mut Transform,
            &mut Visibility,
        ),
        (
            With<ChunkPreviewTile>,
            Without<TilemapLayer>,
            Without<Camera2d>,
        ),
    >,
) {
    for (entity, _, mut storage, _) in tilemaps.iter_mut() {
        for tile in storage.drain() {
            commands.entity(tile).despawn();
        }
        commands.entity(entity).despawn();
    }
    for (entity, _, _, _, _) in preview_tiles.iter_mut() {
        commands.entity(entity).despawn();
    }
    tile_entities.map.clear();
    tile_entities.chunks.clear();
    tile_entities.preview_chunks.clear();
    tile_entities.desired_chunks.clear();
    tile_entities.queued_chunks.clear();
    tile_entities.dirty_preview_chunks.clear();
    tile_entities.chunk_last_seen.clear();
}

fn evict_cached_chunks(
    commands: &mut Commands,
    tile_entities: &mut TileEntities,
    tilemaps: &mut Query<
        (Entity, &TilemapLayer, &mut TileStorage, &mut Visibility),
        (With<TilemapLayer>, Without<ChunkPreviewTile>),
    >,
    preview_tiles: &mut Query<
        (
            Entity,
            &ChunkPreviewTile,
            &mut Sprite,
            &mut Transform,
            &mut Visibility,
        ),
        (
            With<ChunkPreviewTile>,
            Without<TilemapLayer>,
            Without<Camera2d>,
        ),
    >,
) {
    evict_tile_chunks(commands, tile_entities, tilemaps);
    evict_preview_chunks(commands, tile_entities, preview_tiles);
}

fn evict_tile_chunks(
    commands: &mut Commands,
    tile_entities: &mut TileEntities,
    tilemaps: &mut Query<
        (Entity, &TilemapLayer, &mut TileStorage, &mut Visibility),
        (With<TilemapLayer>, Without<ChunkPreviewTile>),
    >,
) {
    if tile_entities.chunks.len() <= MAX_CACHED_TILE_CHUNKS {
        return;
    }
    let mut candidates: Vec<_> = tile_entities
        .chunks
        .keys()
        .filter(|coord| !tile_entities.desired_chunks.contains(coord))
        .map(|coord| {
            (
                *coord,
                tile_entities
                    .chunk_last_seen
                    .get(coord)
                    .copied()
                    .unwrap_or_default(),
            )
        })
        .collect();
    candidates.sort_by_key(|(_, seen)| *seen);

    let mut over_budget = tile_entities
        .chunks
        .len()
        .saturating_sub(MAX_CACHED_TILE_CHUNKS);
    for (coord, _) in candidates {
        if over_budget == 0 {
            break;
        }
        let Some(entity) = tile_entities.chunks.remove(&coord) else {
            continue;
        };
        if let Ok((_, _, mut storage, _)) = tilemaps.get_mut(entity) {
            for tile in storage.drain() {
                commands.entity(tile).despawn();
            }
        }
        commands.entity(entity).despawn();
        tile_entities
            .map
            .retain(|(_, x, y), _| render_chunk_coord_for_tile(*x, *y) != coord);
        tile_entities.chunk_last_seen.remove(&coord);
        over_budget -= 1;
    }
}

fn evict_preview_chunks(
    commands: &mut Commands,
    tile_entities: &mut TileEntities,
    preview_tiles: &mut Query<
        (
            Entity,
            &ChunkPreviewTile,
            &mut Sprite,
            &mut Transform,
            &mut Visibility,
        ),
        (
            With<ChunkPreviewTile>,
            Without<TilemapLayer>,
            Without<Camera2d>,
        ),
    >,
) {
    if tile_entities.preview_chunks.len() <= MAX_CACHED_PREVIEW_CHUNKS {
        return;
    }
    let mut candidates: Vec<_> = tile_entities
        .preview_chunks
        .keys()
        .filter(|coord| !tile_entities.desired_chunks.contains(coord))
        .map(|coord| {
            (
                *coord,
                tile_entities
                    .chunk_last_seen
                    .get(coord)
                    .copied()
                    .unwrap_or_default(),
            )
        })
        .collect();
    candidates.sort_by_key(|(_, seen)| *seen);

    let mut over_budget = tile_entities
        .preview_chunks
        .len()
        .saturating_sub(MAX_CACHED_PREVIEW_CHUNKS);
    for (coord, _) in candidates {
        if over_budget == 0 {
            break;
        }
        let Some(entity) = tile_entities.preview_chunks.remove(&coord) else {
            continue;
        };
        if preview_tiles.get_mut(entity).is_ok() {
            commands.entity(entity).despawn();
        }
        over_budget -= 1;
    }
}

#[allow(clippy::too_many_arguments)]
pub fn sync_render_chunks(
    mut commands: Commands,
    mut refresh: ResMut<RenderRefresh>,
    world_model: Res<WorldModel>,
    atlas: Res<TileAtlas>,
    active_theme: Res<ActiveTheme>,
    camera: Single<(&Transform, &Projection), With<Camera2d>>,
    window: Single<&Window>,
    mut tile_entities: ResMut<TileEntities>,
    mut metrics: ResMut<RenderMetrics>,
    mut tilemaps: Query<
        (Entity, &TilemapLayer, &mut TileStorage, &mut Visibility),
        (With<TilemapLayer>, Without<ChunkPreviewTile>),
    >,
    mut preview_tiles: Query<
        (
            Entity,
            &ChunkPreviewTile,
            &mut Sprite,
            &mut Transform,
            &mut Visibility,
        ),
        (
            With<ChunkPreviewTile>,
            Without<TilemapLayer>,
            Without<Camera2d>,
        ),
    >,
) {
    let (camera_transform, camera_projection) = *camera;
    let Some(view) = camera_view_bounds(
        camera_transform,
        camera_projection,
        &window,
        world_model.tile_size,
    ) else {
        return;
    };
    let (bounds, bounds_mode) = select_render_bounds(&world_model.0, view);
    let lod_mode = render_lod_mode(world_model.tile_size.max(1) as f32, camera_projection);

    commands.insert_resource(bounds);
    commands.insert_resource(bounds_mode);
    commands.insert_resource(lod_mode);

    if refresh.0 {
        clear_render_cache(
            &mut commands,
            &mut tile_entities,
            &mut tilemaps,
            &mut preview_tiles,
        );
        refresh.0 = false;
    }

    let desired_chunks = chunk_coords_for_bounds(bounds);
    let visible_chunks = desired_chunks.len();
    queue_missing_chunks(&mut tile_entities, desired_chunks);

    sync_tile_chunk_visibility(&tile_entities, lod_mode, &mut tilemaps);
    sync_preview_chunks(
        &mut commands,
        &world_model.0,
        lod_mode,
        &mut tile_entities,
        &mut preview_tiles,
        PREVIEW_CHUNK_BUILD_BUDGET,
    );
    if lod_mode == RenderLodMode::Tiles {
        build_queued_tile_chunks(
            &mut commands,
            &world_model.0,
            &atlas,
            &active_theme,
            &mut tile_entities,
            RENDER_CHUNK_BUILD_BUDGET,
        );
    }
    evict_cached_chunks(
        &mut commands,
        &mut tile_entities,
        &mut tilemaps,
        &mut preview_tiles,
    );

    *metrics = RenderMetrics {
        lod_mode,
        loaded_tile_chunks: tile_entities.chunks.len(),
        loaded_preview_chunks: tile_entities.preview_chunks.len(),
        queued_tile_chunks: tile_entities.queued_chunks.len(),
        visible_chunks,
        tracked_tile_entities: tile_entities.map.len(),
    };
}

fn camera_view_bounds(
    camera_transform: &Transform,
    camera_projection: &Projection,
    window: &Window,
    tile_size: u32,
) -> Option<MapBounds> {
    let view_bounds = world_viewport_bounds_current(camera_transform, camera_projection, window)?;
    let tile_px = tile_size.max(1) as f32;
    let min_tile_x = (view_bounds.min_x / tile_px).floor() as i32;
    let max_tile_x = (view_bounds.max_x / tile_px).ceil() as i32;
    let min_tile_y = (-view_bounds.max_y / tile_px).floor() as i32;
    let max_tile_y = (-view_bounds.min_y / tile_px).ceil() as i32;

    Some(MapBounds {
        min_x: min_tile_x,
        min_y: min_tile_y,
        width: (max_tile_x - min_tile_x + 1).max(1) as u32,
        height: (max_tile_y - min_tile_y + 1).max(1) as u32,
    })
}

fn render_bounds_for_view(view: MapBounds) -> MapBounds {
    MapBounds {
        min_x: view.min_x - RENDER_PADDING_TILES,
        min_y: view.min_y - RENDER_PADDING_TILES,
        width: view.width + (RENDER_PADDING_TILES * 2) as u32,
        height: view.height + (RENDER_PADDING_TILES * 2) as u32,
    }
}

fn select_render_bounds(world: &World, view: MapBounds) -> (MapBounds, RenderBoundsMode) {
    let viewport_bounds = render_bounds_for_view(view);
    let world_bounds = compute_bounds(world);
    if should_use_world_bounds(world_bounds, viewport_bounds) {
        (world_bounds, RenderBoundsMode::World)
    } else {
        (viewport_bounds, RenderBoundsMode::Viewport)
    }
}

fn should_use_world_bounds(world: MapBounds, viewport: MapBounds) -> bool {
    let world_area = bounds_area(world);
    let viewport_area = bounds_area(viewport);
    world_area <= FULL_WORLD_RENDER_CELL_LIMIT
        && viewport_area as f32 >= world_area as f32 * FULL_WORLD_RENDER_AREA_RATIO
}

fn bounds_area(bounds: MapBounds) -> u64 {
    u64::from(bounds.width) * u64::from(bounds.height)
}

/// Swap every tilemap's texture to the atlas for `ActiveTheme` when it changes.
/// Runs every Update; cheap no-op when the theme hasn't changed (Local memo).
pub fn set_theme(
    active: Res<ActiveTheme>,
    atlas: Res<TileAtlas>,
    mut tilemaps: Query<&mut TilemapTexture, With<TilemapLayer>>,
    mut last: Local<String>,
) {
    if *last == active.0 {
        return;
    }
    let handle = atlas.handle_for(&active.0);
    for mut tex in tilemaps.iter_mut() {
        *tex = TilemapTexture::Single(handle.clone());
    }
    *last = active.0.clone();
}

/// Mirror `World.layers[i].visible` onto each tilemap's Visibility component.
pub fn sync_layer_visibility(
    world_model: Res<WorldModel>,
    mut tilemaps: Query<(&TilemapLayer, &mut Visibility)>,
) {
    for (tm_layer, mut vis) in tilemaps.iter_mut() {
        if tm_layer.layer_id == COMPOSITE_LAYER_ID {
            continue;
        }
        let on = world_model
            .layers
            .get(tm_layer.index)
            .map(|l| l.visible)
            .unwrap_or(true);
        *vis = if on {
            Visibility::Visible
        } else {
            Visibility::Hidden
        };
    }
}

pub fn draw_grid(
    settings: Res<EditorViewSettings>,
    world_model: Res<WorldModel>,
    camera: Single<(&Transform, &Projection), With<Camera2d>>,
    window: Single<&Window>,
    mut gizmos: Gizmos,
) {
    if !settings.show_grid {
        return;
    }
    let (camera_transform, camera_projection) = *camera;
    let Some(view_bounds) =
        world_viewport_bounds_current(camera_transform, camera_projection, &window)
    else {
        return;
    };

    let tile_px = world_model.tile_size.max(1) as f32;
    let padding = settings.view_distance as i32;
    let step = grid_line_step_tiles(tile_px, camera_projection);
    let min_tile_x = (view_bounds.min_x / tile_px).floor() as i32 - padding;
    let max_tile_x = (view_bounds.max_x / tile_px).ceil() as i32 + padding;
    let min_tile_y = (-view_bounds.max_y / tile_px).floor() as i32 - padding;
    let max_tile_y = (-view_bounds.min_y / tile_px).ceil() as i32 + padding;

    let min_x = min_tile_x as f32 * tile_px;
    let max_x = (max_tile_x + 1) as f32 * tile_px;
    let top_y = -(min_tile_y as f32) * tile_px;
    let bottom_y = -((max_tile_y + 1) as f32) * tile_px;
    let color = Color::srgba(0.18, 0.18, 0.2, 0.45);

    let first_x = floor_to_step(min_tile_x, step);
    let last_x = ceil_to_step(max_tile_x + 1, step);
    let first_y = floor_to_step(min_tile_y, step);
    let last_y = ceil_to_step(max_tile_y + 1, step);
    let step_by = step as usize;

    for tx in (first_x..=last_x).step_by(step_by) {
        let x = tx as f32 * tile_px;
        gizmos.line_2d(Vec2::new(x, top_y), Vec2::new(x, bottom_y), color);
    }
    for ty in (first_y..=last_y).step_by(step_by) {
        let y = -(ty as f32) * tile_px;
        gizmos.line_2d(Vec2::new(min_x, y), Vec2::new(max_x, y), color);
    }
}

fn grid_line_step_tiles(tile_px: f32, camera_projection: &Projection) -> i32 {
    let screen_px = tile_px / orthographic_scale(camera_projection).max(f32::EPSILON);
    let minimum_step = (MIN_GRID_SCREEN_SPACING_PX / screen_px.max(f32::EPSILON))
        .ceil()
        .max(1.0) as i32;
    nice_grid_step_tiles(minimum_step)
}

fn orthographic_scale(camera_projection: &Projection) -> f32 {
    match camera_projection {
        Projection::Orthographic(ortho) => ortho.scale,
        _ => 1.0,
    }
}

fn nice_grid_step_tiles(minimum_step: i32) -> i32 {
    let minimum_step = minimum_step.max(1);
    let mut magnitude = 1;
    loop {
        for multiplier in [1, 2, 5] {
            let step = magnitude * multiplier;
            if step >= minimum_step {
                return step;
            }
        }
        magnitude *= 10;
    }
}

fn floor_to_step(value: i32, step: i32) -> i32 {
    value.div_euclid(step) * step
}

fn ceil_to_step(value: i32, step: i32) -> i32 {
    -((-value).div_euclid(step)) * step
}

#[allow(clippy::too_many_arguments)]
pub fn draw_fog_of_war(
    mut commands: Commands,
    settings: Res<EditorViewSettings>,
    world_model: Res<WorldModel>,
    cursor: Res<CursorTile>,
    camera: Single<(&Transform, &Projection), With<Camera2d>>,
    window: Single<&Window>,
    mut fog_entities: ResMut<FogOverlayEntities>,
    mut fog_tiles: Query<
        (&mut Sprite, &mut Transform, &mut Visibility),
        (With<FogOverlayTile>, Without<Camera2d>),
    >,
) {
    if !settings.show_fog_of_war || !cursor.valid {
        hide_fog_entities(&mut fog_entities, &mut fog_tiles);
        return;
    }

    let (camera_transform, camera_projection) = *camera;
    let Some(view_bounds) =
        world_viewport_bounds_current(camera_transform, camera_projection, &window)
    else {
        hide_fog_entities(&mut fog_entities, &mut fog_tiles);
        return;
    };

    let tile_px = world_model.tile_size.max(1) as f32;
    let min_tile_x = (view_bounds.min_x / tile_px).floor() as i32 - 1;
    let max_tile_x = (view_bounds.max_x / tile_px).ceil() as i32 + 1;
    let min_tile_y = (-view_bounds.max_y / tile_px).floor() as i32 - 1;
    let max_tile_y = (-view_bounds.min_y / tile_px).ceil() as i32 + 1;
    let radius = settings.fog_radius.max(1) as i32;
    let softness = settings.fog_softness as i32;
    let outer_radius = radius + softness;
    let fog_min_x = cursor.x - outer_radius;
    let fog_max_x = cursor.x + outer_radius;
    let fog_min_y = cursor.y - outer_radius;
    let fog_max_y = cursor.y + outer_radius;

    let mut rects = Vec::new();
    push_fog_tile_rect(
        &mut rects,
        min_tile_x,
        fog_min_x - 1,
        min_tile_y,
        max_tile_y,
        tile_px,
        FOG_HIDDEN_ALPHA,
    );
    push_fog_tile_rect(
        &mut rects,
        fog_max_x + 1,
        max_tile_x,
        min_tile_y,
        max_tile_y,
        tile_px,
        FOG_HIDDEN_ALPHA,
    );
    push_fog_tile_rect(
        &mut rects,
        fog_min_x,
        fog_max_x,
        min_tile_y,
        fog_min_y - 1,
        tile_px,
        FOG_HIDDEN_ALPHA,
    );
    push_fog_tile_rect(
        &mut rects,
        fog_min_x,
        fog_max_x,
        fog_max_y + 1,
        max_tile_y,
        tile_px,
        FOG_HIDDEN_ALPHA,
    );

    for ty in fog_min_y.max(min_tile_y)..=fog_max_y.min(max_tile_y) {
        for tx in fog_min_x.max(min_tile_x)..=fog_max_x.min(max_tile_x) {
            if let Some(alpha) = fog_alpha_for_tile(cursor.x, cursor.y, tx, ty, radius, softness) {
                push_fog_tile_rect(&mut rects, tx, tx, ty, ty, tile_px, alpha);
            }
        }
    }

    sync_fog_rects(&mut commands, &mut fog_entities, &mut fog_tiles, &rects);
}

#[derive(Debug, Clone, Copy)]
struct FogRect {
    center: Vec2,
    size: Vec2,
    alpha: f32,
}

fn push_fog_tile_rect(
    rects: &mut Vec<FogRect>,
    min_x: i32,
    max_x: i32,
    min_y: i32,
    max_y: i32,
    tile_px: f32,
    alpha: f32,
) {
    if min_x > max_x || min_y > max_y {
        return;
    }

    let left = min_x as f32 * tile_px;
    let right = (max_x + 1) as f32 * tile_px;
    let top = -(min_y as f32) * tile_px;
    let bottom = -((max_y + 1) as f32) * tile_px;
    rects.push(FogRect {
        center: Vec2::new((left + right) * 0.5, (top + bottom) * 0.5),
        size: Vec2::new(right - left, top - bottom),
        alpha,
    });
}

fn fog_alpha_for_tile(
    focus_x: i32,
    focus_y: i32,
    tile_x: i32,
    tile_y: i32,
    radius: i32,
    softness: i32,
) -> Option<f32> {
    let dx = (tile_x - focus_x) as f32;
    let dy = (tile_y - focus_y) as f32;
    let distance = (dx * dx + dy * dy).sqrt();
    let radius = radius.max(0) as f32;
    if distance <= radius {
        return None;
    }
    if softness <= 0 {
        return Some(FOG_HIDDEN_ALPHA);
    }

    let softness = softness as f32;
    let t = ((distance - radius) / softness).clamp(0.0, 1.0);
    Some(FOG_EDGE_ALPHA + (FOG_HIDDEN_ALPHA - FOG_EDGE_ALPHA) * t)
}

fn sync_fog_rects(
    commands: &mut Commands,
    fog_entities: &mut FogOverlayEntities,
    fog_tiles: &mut Query<
        (&mut Sprite, &mut Transform, &mut Visibility),
        (With<FogOverlayTile>, Without<Camera2d>),
    >,
    rects: &[FogRect],
) {
    for (index, rect) in rects.iter().enumerate() {
        if let Some(&entity) = fog_entities.entities.get(index)
            && let Ok((mut sprite, mut transform, mut visibility)) = fog_tiles.get_mut(entity)
        {
            sprite.color = Color::srgba(0.0, 0.0, 0.0, rect.alpha);
            sprite.custom_size = Some(rect.size);
            transform.translation = Vec3::new(rect.center.x, rect.center.y, FOG_Z);
            *visibility = Visibility::Visible;
            continue;
        }

        let entity = spawn_fog_rect(commands, *rect);
        if index < fog_entities.entities.len() {
            fog_entities.entities[index] = entity;
        } else {
            fog_entities.entities.push(entity);
        }
    }

    for entity in fog_entities.entities.iter().skip(rects.len()) {
        if let Ok((_, _, mut visibility)) = fog_tiles.get_mut(*entity) {
            *visibility = Visibility::Hidden;
        }
    }
}

fn spawn_fog_rect(commands: &mut Commands, rect: FogRect) -> Entity {
    commands
        .spawn((
            FogOverlayTile,
            Sprite {
                color: Color::srgba(0.0, 0.0, 0.0, rect.alpha),
                custom_size: Some(rect.size),
                ..default()
            },
            Transform::from_xyz(rect.center.x, rect.center.y, FOG_Z),
        ))
        .id()
}

fn hide_fog_entities(
    fog_entities: &mut FogOverlayEntities,
    fog_tiles: &mut Query<
        (&mut Sprite, &mut Transform, &mut Visibility),
        (With<FogOverlayTile>, Without<Camera2d>),
    >,
) {
    for entity in &fog_entities.entities {
        if let Ok((_, _, mut visibility)) = fog_tiles.get_mut(*entity) {
            *visibility = Visibility::Hidden;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_world_degenerate_bounds() {
        let w = World::default();
        let b = compute_bounds(&w);
        assert_eq!(
            b,
            MapBounds {
                min_x: 0,
                min_y: 0,
                width: 1,
                height: 1
            }
        );
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

    #[test]
    fn small_view_uses_viewport_render_bounds() {
        let mut w = World::default();
        let l = w.active_layer.clone();
        w.set(&l, 0, 0, TileKind::Floor);
        w.set(&l, 639, 359, TileKind::Wall);

        let (bounds, mode) = select_render_bounds(
            &w,
            MapBounds {
                min_x: 293,
                min_y: 164,
                width: 54,
                height: 32,
            },
        );

        assert_eq!(mode, RenderBoundsMode::Viewport);
        assert_eq!(bounds.width, 134);
        assert_eq!(bounds.height, 112);
    }

    #[test]
    fn large_view_uses_world_render_bounds() {
        let mut w = World::default();
        let l = w.active_layer.clone();
        w.set(&l, 0, 0, TileKind::Floor);
        w.set(&l, 639, 359, TileKind::Wall);

        let (bounds, mode) = select_render_bounds(
            &w,
            MapBounds {
                min_x: 53,
                min_y: 29,
                width: 534,
                height: 302,
            },
        );

        assert_eq!(mode, RenderBoundsMode::World);
        assert_eq!(
            bounds,
            MapBounds {
                min_x: 0,
                min_y: 0,
                width: 640,
                height: 360
            }
        );
    }

    #[test]
    fn world_render_bounds_release_when_view_is_small_again() {
        let world_bounds = MapBounds {
            min_x: 0,
            min_y: 0,
            width: 640,
            height: 360,
        };
        let small_viewport_bounds = render_bounds_for_view(MapBounds {
            min_x: 293,
            min_y: 164,
            width: 54,
            height: 32,
        });

        assert!(!should_use_world_bounds(
            world_bounds,
            small_viewport_bounds
        ));
    }

    #[test]
    fn grid_step_stays_dense_when_tiles_are_readable() {
        let projection = Projection::Orthographic(OrthographicProjection {
            scale: 1.0,
            ..OrthographicProjection::default_2d()
        });

        assert_eq!(grid_line_step_tiles(24.0, &projection), 1);
    }

    #[test]
    fn grid_step_coarsens_when_zoomed_far_out() {
        let projection = Projection::Orthographic(OrthographicProjection {
            scale: 10.0,
            ..OrthographicProjection::default_2d()
        });

        assert_eq!(grid_line_step_tiles(24.0, &projection), 5);
    }

    #[test]
    fn grid_step_rounding_handles_negative_tile_ranges() {
        assert_eq!(floor_to_step(-3, 5), -5);
        assert_eq!(ceil_to_step(-3, 5), 0);
        assert_eq!(floor_to_step(13, 5), 10);
        assert_eq!(ceil_to_step(13, 5), 15);
    }

    #[test]
    fn render_chunk_coord_uses_euclidean_negative_ranges() {
        assert_eq!(
            render_chunk_coord_for_tile(-1, -1),
            RenderChunkCoord { x: -1, y: -1 }
        );
        assert_eq!(
            render_chunk_coord_for_tile(-64, -64),
            RenderChunkCoord { x: -1, y: -1 }
        );
        assert_eq!(
            render_chunk_coord_for_tile(-65, -65),
            RenderChunkCoord { x: -2, y: -2 }
        );
    }

    #[test]
    fn chunk_coords_cover_bounds_across_zero() {
        let chunks = chunk_coords_for_bounds(MapBounds {
            min_x: -1,
            min_y: -1,
            width: 66,
            height: 66,
        });

        assert_eq!(
            chunks,
            vec![
                RenderChunkCoord { x: -1, y: -1 },
                RenderChunkCoord { x: 0, y: -1 },
                RenderChunkCoord { x: 1, y: -1 },
                RenderChunkCoord { x: -1, y: 0 },
                RenderChunkCoord { x: 0, y: 0 },
                RenderChunkCoord { x: 1, y: 0 },
                RenderChunkCoord { x: -1, y: 1 },
                RenderChunkCoord { x: 0, y: 1 },
                RenderChunkCoord { x: 1, y: 1 },
            ]
        );
    }

    #[test]
    fn render_lod_switches_to_preview_when_tiles_are_tiny() {
        let readable = Projection::Orthographic(OrthographicProjection {
            scale: 2.0,
            ..OrthographicProjection::default_2d()
        });
        let far = Projection::Orthographic(OrthographicProjection {
            scale: 8.0,
            ..OrthographicProjection::default_2d()
        });

        assert_eq!(render_lod_mode(24.0, &readable), RenderLodMode::Tiles);
        assert_eq!(render_lod_mode(24.0, &far), RenderLodMode::Preview);
    }

    #[test]
    fn tile_pos_maps_to_glyphweave_world_center() {
        let tile_px = 24.0;
        let map_size = TilemapSize {
            x: RENDER_CHUNK_TILES_U32,
            y: RENDER_CHUNK_TILES_U32,
        };
        let grid_size = TilemapGridSize {
            x: tile_px,
            y: tile_px,
        };
        let tile_size = TilemapTileSize {
            x: tile_px,
            y: tile_px,
        };
        let map_type = TilemapType::Square;
        let anchor = TilemapAnchor::TopLeft;

        for (x, y) in [(-3, -2), (-2, -1), (1, 1), (65, 64)] {
            let coord = render_chunk_coord_for_tile(x, y);
            let bounds = chunk_bounds(coord);
            let map_origin = Vec2::new(
                bounds.min_x as f32 * tile_px,
                -bounds.min_y as f32 * tile_px,
            );
            let tile_pos = tile_pos_for_chunk(coord, x, y).unwrap();
            let rendered_center = map_origin
                + tile_pos.center_in_world(&map_size, &grid_size, &tile_size, &map_type, &anchor);
            let expected_center =
                Vec2::new((x as f32 + 0.5) * tile_px, -(y as f32 + 0.5) * tile_px);

            assert_eq!(rendered_center, expected_center);
        }
    }

    #[test]
    fn absent_tiles_are_invisible_for_sparse_layer_composition() {
        let (texture, visible) = tile_render_state(None);
        assert_eq!(texture.0, tile_index(TileKind::Void));
        assert!(!visible.0);
    }

    #[test]
    fn present_tiles_are_visible() {
        let (texture, visible) = tile_render_state(Some(TileKind::Wall));
        assert_eq!(texture.0, tile_index(TileKind::Wall));
        assert!(visible.0);
    }

    #[test]
    fn fog_alpha_keeps_radius_clear_and_softens_edges() {
        assert_eq!(fog_alpha_for_tile(10, 10, 10, 10, 3, 2), None);
        assert_eq!(fog_alpha_for_tile(10, 10, 13, 10, 3, 2), None);

        let edge = fog_alpha_for_tile(10, 10, 14, 10, 3, 2).unwrap();
        assert!(edge > FOG_EDGE_ALPHA);
        assert!(edge < FOG_HIDDEN_ALPHA);

        assert_eq!(
            fog_alpha_for_tile(10, 10, 16, 10, 3, 2),
            Some(FOG_HIDDEN_ALPHA)
        );
    }

    #[test]
    fn fog_tile_rect_maps_to_world_space() {
        let mut rects = Vec::new();
        push_fog_tile_rect(&mut rects, 2, 3, 4, 5, 24.0, FOG_HIDDEN_ALPHA);

        assert_eq!(rects.len(), 1);
        assert_eq!(rects[0].center, Vec2::new(72.0, -120.0));
        assert_eq!(rects[0].size, Vec2::new(48.0, 48.0));
    }
}
