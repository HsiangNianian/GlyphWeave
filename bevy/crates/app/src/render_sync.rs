//! Consume EditEvent messages and update the touched tile's texture index.
//! In P1 the tool system applies the edit to the core World (source of truth)
//! AND emits the event; this system only mirrors the change into the render view.
use crate::render::MapBounds;
use crate::render::atlas::tile_index;
use crate::render::tilemap::{
    COMPOSITE_LAYER_ID, TileEntities, TilemapLayer, composite_tile_at, tile_pos_for_bounds,
};
use crate::resource::{EditEvent, WorldModel};
use bevy::ecs::message::MessageReader;
use bevy::prelude::*;
use bevy_ecs_tilemap::prelude::*;
use glyphweave_core::tile::TileKind;

pub fn sync_edits(
    mut commands: Commands,
    mut reader: MessageReader<EditEvent>,
    world_model: Res<WorldModel>,
    bounds: Option<Res<MapBounds>>,
    mut tile_entities: ResMut<TileEntities>,
    mut tilemaps: Query<(Entity, &TilemapLayer, &mut TileStorage)>,
    mut tiles: Query<(&mut TileTextureIndex, &mut TileVisible)>,
) {
    for ev in reader.read() {
        let (next_texture, next_visible) = tile_state_for_composite(&world_model.0, ev.x, ev.y);
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
        let Some(bounds) = bounds.as_deref() else {
            continue;
        };
        let Some(tile_pos) = tile_pos_for_bounds(bounds, ev.x, ev.y) else {
            continue;
        };
        let Some((tilemap_entity, _, mut tile_storage)) = tilemaps
            .iter_mut()
            .find(|(_, layer, _)| layer.layer_id == COMPOSITE_LAYER_ID)
        else {
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
    world: &glyphweave_core::world::World,
    x: i32,
    y: i32,
) -> (TileTextureIndex, TileVisible) {
    match composite_tile_at(world, x, y) {
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
    use glyphweave_core::layer::Layer;
    use glyphweave_core::world::World;

    #[test]
    fn visible_world_tile_makes_composite_visible() {
        let mut world = World::default();
        let layer = world.active_layer.clone();
        world.set(&layer, 1, 2, TileKind::Floor);

        let (texture, visible) = tile_state_for_composite(&world, 1, 2);

        assert_eq!(texture.0, tile_index(TileKind::Floor));
        assert!(visible.0);
    }

    #[test]
    fn empty_world_tile_hides_composite() {
        let world = World::default();

        let (texture, visible) = tile_state_for_composite(&world, 1, 2);

        assert_eq!(texture.0, tile_index(TileKind::Void));
        assert!(!visible.0);
    }

    #[test]
    fn top_visible_layer_wins_composite_tile() {
        let mut world = World::default();
        let ground = world.active_layer.clone();
        let detail = "detail".to_string();
        world.layers.push(Layer::new(&detail, "Detail"));
        world.ensure_grid(&detail);
        world.set(&ground, 1, 2, TileKind::Floor);
        world.set(&detail, 1, 2, TileKind::Wall);

        let (texture, visible) = tile_state_for_composite(&world, 1, 2);

        assert_eq!(texture.0, tile_index(TileKind::Wall));
        assert!(visible.0);
    }
}
