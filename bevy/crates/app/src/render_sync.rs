//! Consume EditEvent messages and update the touched tile's texture index.
//! The tool system applies the edit to the core VoxelWorld (source of truth)
//! AND emits the event; this system only mirrors the change into the render view.
use crate::render::atlas::tile_index;
use crate::render::tilemap::{
    TileEntities, composite_tile_at, render_chunk_coord_for_tile, tile_pos_for_chunk,
};
use crate::resource::{ActiveZ, EditEvent, WorldModel};
use bevy::ecs::message::MessageReader;
use bevy::prelude::*;
use bevy_ecs_tilemap::prelude::*;
use glyphweave_core::tile::TileKind;

pub fn sync_edits(
    mut commands: Commands,
    mut reader: MessageReader<EditEvent>,
    world_model: Res<WorldModel>,
    active_z: Res<ActiveZ>,
    mut tile_entities: ResMut<TileEntities>,
    mut tilemaps: Query<&mut TileStorage>,
    mut tiles: Query<(&mut TileTextureIndex, &mut TileVisible)>,
) {
    for ev in reader.read() {
        if ev.z != active_z.0 {
            continue;
        }
        let coord = render_chunk_coord_for_tile(ev.x, ev.y);
        tile_entities.mark_preview_dirty(coord);

        let (next_texture, next_visible) =
            tile_state_for_composite(&world_model.world, ev.z, ev.x, ev.y);
        if let Some(&entity) = tile_entities.map.get(&(0, ev.x, ev.y)) {
            let Ok((mut tex, mut visible)) = tiles.get_mut(entity) else {
                continue;
            };
            tex.0 = next_texture.0;
            visible.0 = next_visible.0;
            continue;
        }

        if !next_visible.0 {
            continue;
        }
        let Some(&tilemap_entity) = tile_entities.chunks.get(&coord) else {
            continue;
        };
        let Ok(mut tile_storage) = tilemaps.get_mut(tilemap_entity) else {
            continue;
        };
        let Some(tile_pos) = tile_pos_for_chunk(coord, ev.x, ev.y) else {
            continue;
        };

        let tile_entity = commands
            .spawn(TileBundle {
                position: tile_pos,
                tilemap_id: TilemapId(tilemap_entity),
                texture_index: next_texture,
                visible: next_visible,
                ..default()
            })
            .id();
        tile_storage.set(&tile_pos, tile_entity);
        tile_entities.map.insert((0, ev.x, ev.y), tile_entity);
    }
}

pub fn tile_state_for_composite(
    world: &glyphweave_core::voxel::VoxelWorld,
    z: i32,
    x: i32,
    y: i32,
) -> (TileTextureIndex, TileVisible) {
    match composite_tile_at(world, z, x, y) {
        Some(kind) => (TileTextureIndex(tile_index(kind)), TileVisible(true)),
        None => (
            TileTextureIndex(tile_index(TileKind::Void)),
            TileVisible(false),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::voxel_adapter::set_tile;
    use glyphweave_core::voxel::VoxelWorld;

    #[test]
    fn visible_world_tile_makes_composite_visible() {
        let mut world = VoxelWorld::default();
        set_tile(&mut world, 3, 1, 2, TileKind::Floor).unwrap();

        let (texture, visible) = tile_state_for_composite(&world, 3, 1, 2);

        assert_eq!(texture.0, tile_index(TileKind::Floor));
        assert!(visible.0);
    }

    #[test]
    fn empty_world_tile_hides_composite() {
        let world = VoxelWorld::default();

        let (texture, visible) = tile_state_for_composite(&world, 0, 1, 2);

        assert_eq!(texture.0, tile_index(TileKind::Void));
        assert!(!visible.0);
    }

    #[test]
    fn active_z_selects_the_rendered_slice() {
        let mut world = VoxelWorld::default();
        set_tile(&mut world, 0, 1, 2, TileKind::Floor).unwrap();
        set_tile(&mut world, 1, 1, 2, TileKind::Wall).unwrap();

        let (texture, visible) = tile_state_for_composite(&world, 1, 1, 2);

        assert_eq!(texture.0, tile_index(TileKind::Wall));
        assert!(visible.0);
    }
}
