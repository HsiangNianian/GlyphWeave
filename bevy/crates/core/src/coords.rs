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
        for (x, y) in [
            (0i32, 0i32),
            (5, 7),
            (31, 31),
            (32, 0),
            (-1, -1),
            (-32, -33),
            (-100, 250),
        ] {
            let (cx, cy) = chunk_of(x, y);
            let (lx, ly) = local_of(x, y);
            assert_eq!(
                tile_from_chunk_local(cx, cy, lx, ly),
                (x, y),
                "round-trip ({},{})",
                x,
                y
            );
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
