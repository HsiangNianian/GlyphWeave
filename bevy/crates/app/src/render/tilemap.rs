//! Spawn a bounded composite TilemapBundle with tile entities only for cells
//! near the camera. Empty upper-layer cells are transparent by composition,
//! matching the sparse web renderer while avoiding huge entity counts on large
//! maps.
use crate::render::MapBounds;
use crate::render::atlas::{TileAtlas, tile_index};
use crate::resource::{ActiveTheme, EditorViewSettings, WorldModel};
use bevy::prelude::*;
use bevy_ecs_tilemap::prelude::*;
use glyphweave_core::tile::TileKind;
use glyphweave_core::world::World;

/// Tags a tilemap entity; carries its layer index for sync lookups.
/// NOTE: NOT `Copy` (has a String field); `Clone` only.
#[derive(Component, Reflect, Debug, Clone)]
#[reflect(Component)]
pub struct TilemapLayer {
    pub index: usize,
    pub layer_id: String,
}

pub const COMPOSITE_LAYER_ID: &str = "__composite__";

/// Strong map from (layer_index, tile_x, tile_y) -> tile entity, for fast sync.
#[derive(Resource, Default, Debug)]
pub struct TileEntities {
    pub map: std::collections::HashMap<(usize, i32, i32), Entity>,
}

/// Set when structural world changes require a full render rebuild.
#[derive(Resource, Default, Debug, Clone, Copy)]
pub struct RenderRefresh(pub bool);

const RENDER_PADDING_TILES: i32 = 40;
const RENDER_REFRESH_MARGIN_TILES: i32 = 8;

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
    camera: Single<(&Camera, &GlobalTransform), With<Camera2d>>,
    window: Single<&Window>,
    mut tile_entities: ResMut<TileEntities>,
) {
    let (camera, camera_transform) = *camera;
    let bounds = camera_view_bounds(camera, camera_transform, &window, world_model.tile_size)
        .map(render_bounds_for_view)
        .unwrap_or_else(|| compute_bounds(&world_model.0));
    spawn_tilemaps_for_world(
        &mut commands,
        &world_model.0,
        &atlas,
        &active_theme,
        bounds,
        &mut tile_entities,
    );
}

fn spawn_tilemaps_for_world(
    commands: &mut Commands,
    world: &World,
    atlas: &TileAtlas,
    active_theme: &ActiveTheme,
    bounds: MapBounds,
    tile_entities: &mut TileEntities,
) {
    let tile_px = world.tile_size.max(1) as f32;
    commands.insert_resource(bounds);

    let map_size = TilemapSize {
        x: bounds.width,
        y: bounds.height,
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

    // With TopLeft anchor: tile TilePos(0,0) sits at the tilemap's local origin.
    // Translate the tilemap so signed tile (min_x, min_y) is the top-left cell.
    let origin_world_x = bounds.min_x as f32 * tile_px;
    let origin_world_y = -bounds.min_y as f32 * tile_px;

    tile_entities.map.clear();

    let tilemap_entity = commands.spawn_empty().id();
    let mut tile_storage = TileStorage::empty(map_size);

    for ly in 0..bounds.height {
        for lx in 0..bounds.width {
            let tx = bounds.min_x + lx as i32;
            let ty = bounds.min_y + ly as i32;
            if let Some(kind) = composite_tile_at(world, tx, ty) {
                let tile_pos = TilePos { x: lx, y: ly };
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
        },
        TilemapBundle {
            grid_size,
            map_type,
            size: map_size,
            spacing: TilemapSpacing::default(),
            storage: tile_storage,
            texture: TilemapTexture::Single(atlas.handle_for(&active_theme.0)),
            tile_size,
            transform: Transform::from_xyz(origin_world_x, origin_world_y, 0.0),
            render_settings: TilemapRenderSettings {
                render_chunk_size: UVec2::splat(64),
                ..default()
            },
            anchor: TilemapAnchor::TopLeft,
            visibility: Visibility::Visible,
            ..default()
        },
    ));
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

pub fn tile_pos_for_bounds(bounds: &MapBounds, x: i32, y: i32) -> Option<TilePos> {
    let local_x = x.checked_sub(bounds.min_x)?;
    let local_y = y.checked_sub(bounds.min_y)?;
    if local_x < 0 || local_y < 0 {
        return None;
    }
    let lx = local_x as u32;
    let ly = local_y as u32;
    if lx >= bounds.width || ly >= bounds.height {
        return None;
    }
    Some(TilePos { x: lx, y: ly })
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

#[allow(clippy::too_many_arguments)]
pub fn refresh_tilemaps(
    mut commands: Commands,
    mut refresh: ResMut<RenderRefresh>,
    world_model: Res<WorldModel>,
    atlas: Res<TileAtlas>,
    active_theme: Res<ActiveTheme>,
    camera: Single<(&Camera, &GlobalTransform), With<Camera2d>>,
    window: Single<&Window>,
    mut tile_entities: ResMut<TileEntities>,
    mut tilemaps: Query<(Entity, &mut TileStorage), With<TilemapLayer>>,
) {
    if !refresh.0 {
        return;
    }

    for (entity, mut storage) in tilemaps.iter_mut() {
        for tile in storage.drain() {
            commands.entity(tile).despawn();
        }
        commands.entity(entity).despawn();
    }

    let (camera, camera_transform) = *camera;
    let bounds = camera_view_bounds(camera, camera_transform, &window, world_model.tile_size)
        .map(render_bounds_for_view)
        .unwrap_or_else(|| compute_bounds(&world_model.0));
    spawn_tilemaps_for_world(
        &mut commands,
        &world_model.0,
        &atlas,
        &active_theme,
        bounds,
        &mut tile_entities,
    );
    refresh.0 = false;
}

pub fn refresh_when_camera_bounds_change(
    world_model: Res<WorldModel>,
    camera: Single<(&Camera, &GlobalTransform), With<Camera2d>>,
    window: Single<&Window>,
    bounds: Option<Res<MapBounds>>,
    mut refresh: ResMut<RenderRefresh>,
) {
    if refresh.0 {
        return;
    }
    let (camera, camera_transform) = *camera;
    let Some(view_bounds) =
        camera_view_bounds(camera, camera_transform, &window, world_model.tile_size)
    else {
        return;
    };
    let Some(render_bounds) = bounds.as_deref().copied() else {
        refresh.0 = true;
        return;
    };
    if !render_bounds_contains_view(render_bounds, view_bounds) {
        refresh.0 = true;
    }
}

fn camera_view_bounds(
    camera: &Camera,
    camera_transform: &GlobalTransform,
    window: &Window,
    tile_size: u32,
) -> Option<MapBounds> {
    let top_left = camera
        .viewport_to_world_2d(camera_transform, Vec2::ZERO)
        .ok()?;
    let bottom_right = camera
        .viewport_to_world_2d(camera_transform, Vec2::new(window.width(), window.height()))
        .ok()?;

    let tile_px = tile_size.max(1) as f32;
    let min_world_x = top_left.x.min(bottom_right.x);
    let max_world_x = top_left.x.max(bottom_right.x);
    let min_world_y = top_left.y.min(bottom_right.y);
    let max_world_y = top_left.y.max(bottom_right.y);

    let min_tile_x = (min_world_x / tile_px).floor() as i32;
    let max_tile_x = (max_world_x / tile_px).ceil() as i32;
    let min_tile_y = (-max_world_y / tile_px).floor() as i32;
    let max_tile_y = (-min_world_y / tile_px).ceil() as i32;

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

fn render_bounds_contains_view(render: MapBounds, view: MapBounds) -> bool {
    let render_min_x = render.min_x + RENDER_REFRESH_MARGIN_TILES;
    let render_min_y = render.min_y + RENDER_REFRESH_MARGIN_TILES;
    let render_max_x = render.min_x + render.width as i32 - RENDER_REFRESH_MARGIN_TILES;
    let render_max_y = render.min_y + render.height as i32 - RENDER_REFRESH_MARGIN_TILES;
    let view_max_x = view.min_x + view.width as i32;
    let view_max_y = view.min_y + view.height as i32;

    view.min_x >= render_min_x
        && view.min_y >= render_min_y
        && view_max_x <= render_max_x
        && view_max_y <= render_max_y
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
            *vis = Visibility::Visible;
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
    camera: Single<(&Camera, &GlobalTransform)>,
    window: Single<&Window>,
    mut gizmos: Gizmos,
) {
    if !settings.show_grid {
        return;
    }
    let (camera, camera_transform) = *camera;
    let Ok(top_left) = camera.viewport_to_world_2d(camera_transform, Vec2::ZERO) else {
        return;
    };
    let Ok(bottom_right) =
        camera.viewport_to_world_2d(camera_transform, Vec2::new(window.width(), window.height()))
    else {
        return;
    };

    let tile_px = world_model.tile_size.max(1) as f32;
    let padding = settings.view_distance as i32;
    let min_world_x = top_left.x.min(bottom_right.x);
    let max_world_x = top_left.x.max(bottom_right.x);
    let min_world_y = top_left.y.min(bottom_right.y);
    let max_world_y = top_left.y.max(bottom_right.y);

    let min_tile_x = (min_world_x / tile_px).floor() as i32 - padding;
    let max_tile_x = (max_world_x / tile_px).ceil() as i32 + padding;
    let min_tile_y = (-max_world_y / tile_px).floor() as i32 - padding;
    let max_tile_y = (-min_world_y / tile_px).ceil() as i32 + padding;

    let min_x = min_tile_x as f32 * tile_px;
    let max_x = (max_tile_x + 1) as f32 * tile_px;
    let top_y = -(min_tile_y as f32) * tile_px;
    let bottom_y = -((max_tile_y + 1) as f32) * tile_px;
    let color = Color::srgba(0.18, 0.18, 0.2, 0.45);

    for tx in min_tile_x..=max_tile_x + 1 {
        let x = tx as f32 * tile_px;
        gizmos.line_2d(Vec2::new(x, top_y), Vec2::new(x, bottom_y), color);
    }
    for ty in min_tile_y..=max_tile_y + 1 {
        let y = -(ty as f32) * tile_px;
        gizmos.line_2d(Vec2::new(min_x, y), Vec2::new(max_x, y), color);
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
}
