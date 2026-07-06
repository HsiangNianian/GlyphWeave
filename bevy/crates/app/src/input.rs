//! Cursor -> tile coordinate. Updates CursorTile for UI and tool use.
use crate::render::tilemap::TilemapLayer;
use crate::render::MapBounds;
use crate::resource::CursorTile;
use bevy::prelude::*;
use bevy_ecs_tilemap::prelude::*;

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

#[allow(clippy::type_complexity)] // Bevy tilemap projection query — naturally tuple-heavy.
pub fn update_cursor_tile(
    camera_q: Single<(&Camera, &GlobalTransform)>,
    // Multiple tilemaps (one per layer); they share bounds/anchor/transform, so any one works.
    tilemap_q: Query<
        (
            &GlobalTransform,
            &TilemapSize,
            &TilemapGridSize,
            &TilemapTileSize,
            &TilemapType,
            &TilemapAnchor,
        ),
        With<TilemapLayer>,
    >,
    window: Single<&Window>,
    bounds: Option<Res<MapBounds>>,
    mut cursor: ResMut<CursorTile>,
) {
    let (cam, gtf) = *camera_q;
    let Some(p) = window.cursor_position() else {
        cursor.valid = false;
        return;
    };
    let Ok(world) = cam.viewport_to_world_2d(gtf, p) else {
        cursor.valid = false;
        return;
    };
    let Some((tm_gtf, map_size, grid_size, tile_size, map_type, anchor)) = tilemap_q.iter().next()
    else {
        cursor.valid = false;
        return;
    };
    // World -> tilemap-local, then the crate's own projection helper.
    let local = tm_gtf
        .to_matrix()
        .inverse()
        .transform_point3(world.extend(0.0))
        .truncate();
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
