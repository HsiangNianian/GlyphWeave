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
