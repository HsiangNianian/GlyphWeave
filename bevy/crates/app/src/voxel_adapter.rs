//! Explicit adapter between legacy atlas `TileKind` values and v3 block names.
//!
//! The voxel world remains authoritative. Unknown registered blocks are never
//! changed by this adapter; the current 2D atlas simply renders them as empty.

use glyphweave_core::tile::TileKind;
use glyphweave_core::voxel::{BlockKey, VoxelCoord, VoxelWorld, VoxelWorldError};
use glyphweave_core::world::World;

pub const DEFAULT_TILE_SIZE: u32 = 24;
pub const GAMEPLAY_Z: i32 = 0;

const TILE_BLOCK_SURFACES: &[(TileKind, &str)] = &[
    (TileKind::Wall, "glyphweave:wall"),
    (TileKind::Floor, "glyphweave:floor"),
    (TileKind::FloorAlt, "glyphweave:floor-alt"),
    (TileKind::Door, "glyphweave:door"),
    (TileKind::DoorOpen, "glyphweave:door-open"),
    (TileKind::Water, "glyphweave:water"),
    (TileKind::DeepWater, "glyphweave:deep-water"),
    (TileKind::Lava, "glyphweave:lava"),
    (TileKind::Tree, "glyphweave:tree"),
    (TileKind::Grass, "glyphweave:grass"),
    (TileKind::Bridge, "glyphweave:bridge"),
    (TileKind::StairsDown, "glyphweave:stairs-down"),
    (TileKind::StairsUp, "glyphweave:stairs-up"),
    (TileKind::Altar, "glyphweave:altar"),
    (TileKind::Fountain, "glyphweave:fountain"),
    (TileKind::Grave, "glyphweave:grave"),
    (TileKind::Trap, "glyphweave:trap"),
    (TileKind::Pillar, "glyphweave:pillar"),
    (TileKind::Treasure, "glyphweave:treasure"),
    (TileKind::Shop, "glyphweave:shop"),
    (TileKind::Table, "glyphweave:table"),
    (TileKind::Throne, "glyphweave:throne"),
    (TileKind::Cage, "glyphweave:cage"),
    (TileKind::Blood, "glyphweave:blood"),
    (TileKind::Bar, "glyphweave:bar"),
];

pub fn tile_block_name(kind: TileKind) -> Option<&'static str> {
    TILE_BLOCK_SURFACES
        .iter()
        .find(|(tile, _)| *tile == kind)
        .map(|(_, block)| *block)
}

pub fn block_name_tile(name: &str) -> Option<TileKind> {
    TILE_BLOCK_SURFACES
        .iter()
        .find(|(_, block)| *block == name)
        .map(|(tile, _)| *tile)
}

pub fn tile_at(world: &VoxelWorld, z: i32, x: i32, y: i32) -> Option<TileKind> {
    let key = world.get(VoxelCoord::new(z, x, y));
    if key.is_air() {
        return None;
    }
    world.registry().name(key).and_then(block_name_tile)
}

pub fn set_tile(
    world: &mut VoxelWorld,
    z: i32,
    x: i32,
    y: i32,
    kind: TileKind,
) -> Result<BlockKey, VoxelWorldError> {
    let coord = VoxelCoord::new(z, x, y);
    let Some(name) = tile_block_name(kind) else {
        return Ok(world.erase(coord));
    };
    let key = world.intern_block(name)?;
    world.set(coord, key)
}

pub fn legacy_world_to_voxel(legacy: &World) -> VoxelWorld {
    let mut voxel = VoxelWorld::new(legacy.world_name.clone());
    for layer in &legacy.layers {
        if !layer.visible {
            continue;
        }
        let Some(grid) = legacy.grid(&layer.id) else {
            continue;
        };
        for ((x, y), kind) in grid.iter_tiles() {
            let _ = set_tile(&mut voxel, GAMEPLAY_Z, x, y, kind);
        }
    }
    voxel
}

pub fn voxel_slice_to_legacy(voxel: &VoxelWorld, z: i32, tile_size: u32, theme_id: &str) -> World {
    let mut legacy = World {
        world_name: voxel.name.clone(),
        tile_size,
        theme_id: theme_id.to_owned(),
        ..World::default()
    };
    let layer = legacy.active_layer.clone();
    for (coord, key) in voxel.iter_voxels() {
        if coord.z != z {
            continue;
        }
        let Some(kind) = voxel.registry().name(key).and_then(block_name_tile) else {
            continue;
        };
        legacy.set(&layer, coord.x, coord.y, kind);
    }
    legacy
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_tiles_round_trip_through_namespaced_blocks() {
        let mut world = VoxelWorld::new("adapter");
        for (index, kind) in TileKind::ALL.into_iter().enumerate() {
            let x = index as i32;
            set_tile(&mut world, 3, x, -2, kind).unwrap();
            let expected = (!matches!(kind, TileKind::Void)).then_some(kind);
            assert_eq!(tile_at(&world, 3, x, -2), expected);
        }
    }

    #[test]
    fn unknown_blocks_render_empty_without_being_rewritten() {
        let mut world = VoxelWorld::new("unknown");
        let unknown = world.intern_block("future-mod:crystal").unwrap();
        let coord = VoxelCoord::new(4, 1, 2);
        world.set(coord, unknown).unwrap();

        assert_eq!(tile_at(&world, 4, 1, 2), None);
        assert_eq!(world.get(coord), unknown);

        set_tile(&mut world, 4, 1, 2, TileKind::Wall).unwrap();
        assert_eq!(tile_at(&world, 4, 1, 2), Some(TileKind::Wall));
        assert_eq!(
            world.registry().name(world.get(coord)),
            Some("glyphweave:wall")
        );
    }

    #[test]
    fn surface_table_covers_every_non_air_tile_kind_once() {
        let mut tiles: Vec<_> = TILE_BLOCK_SURFACES.iter().map(|(tile, _)| *tile).collect();
        tiles.sort();
        tiles.dedup();
        assert_eq!(tiles.len(), TILE_BLOCK_SURFACES.len());
        assert_eq!(tiles.len(), TileKind::ALL.len() - 1);
        assert!(!tiles.contains(&TileKind::Void));

        let mut blocks: Vec<_> = TILE_BLOCK_SURFACES
            .iter()
            .map(|(_, block)| *block)
            .collect();
        blocks.sort();
        blocks.dedup();
        assert_eq!(blocks.len(), TILE_BLOCK_SURFACES.len());
    }
}
