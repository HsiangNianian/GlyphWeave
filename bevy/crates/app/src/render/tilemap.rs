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
    mut tile_entities: ResMut<TileEntities>,
) {
    let world = &world_model.0;
    let tile_px = world.tile_size.max(1) as f32;
    let bounds = compute_bounds(world);
    commands.insert_resource(bounds);

    let map_size = TilemapSize {
        x: bounds.width,
        y: bounds.height,
    };
    let tile_size = TilemapTileSize { x: tile_px, y: tile_px };
    let grid_size = TilemapGridSize { x: tile_px, y: tile_px };
    let map_type = TilemapType::default();

    // With TopLeft anchor: tile TilePos(0,0) sits at the tilemap's local origin.
    // Translate the tilemap so signed tile (min_x, min_y) is the top-left cell.
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
                let kind = grid
                    .and_then(|g| g.get(tx, ty))
                    .unwrap_or(glyphweave_core::tile::TileKind::Void);
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
            TilemapLayer {
                index: i,
                layer_id: layer.id.clone(),
            },
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
    use glyphweave_core::tile::TileKind;

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
