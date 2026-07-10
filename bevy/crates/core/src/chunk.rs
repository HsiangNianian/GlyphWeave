use crate::coords::{CHUNK_AREA, CHUNK_SIZE, chunk_of, local_index};
use crate::tile::TileKind;
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct Chunk {
    pub tiles: Box<[Option<TileKind>; CHUNK_AREA]>,
}

impl Default for Chunk {
    fn default() -> Self {
        // `Box::new([None; N])` needs Copy; Option<TileKind> is Copy.
        Self {
            tiles: Box::new([None; CHUNK_AREA]),
        }
    }
}

impl Chunk {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn get(&self, x: i32, y: i32) -> Option<TileKind> {
        self.tiles[local_index(x, y)]
    }

    pub fn set(&mut self, x: i32, y: i32, kind: TileKind) {
        self.tiles[local_index(x, y)] = Some(kind);
    }

    pub fn erase(&mut self, x: i32, y: i32) {
        self.tiles[local_index(x, y)] = None;
    }

    pub fn is_empty(&self) -> bool {
        self.tiles.iter().all(|t| t.is_none())
    }
}

/// Sparse grid of chunks. Empty chunks are never allocated.
#[derive(Debug, Clone, Default)]
pub struct ChunkGrid {
    pub chunks: HashMap<(i32, i32), Chunk>,
}

impl ChunkGrid {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn get(&self, x: i32, y: i32) -> Option<TileKind> {
        let key = chunk_of(x, y);
        self.chunks.get(&key).and_then(|c| c.get(x, y))
    }

    pub fn set(&mut self, x: i32, y: i32, kind: TileKind) {
        let key = chunk_of(x, y);
        let chunk = self.chunks.entry(key).or_default();
        chunk.set(x, y, kind);
    }

    pub fn erase(&mut self, x: i32, y: i32) {
        let key = chunk_of(x, y);
        if let Some(chunk) = self.chunks.get_mut(&key) {
            chunk.erase(x, y);
            if chunk.is_empty() {
                self.chunks.remove(&key);
            }
        }
    }

    /// Iterates `((tile_x, tile_y), kind)` for every non-empty cell.
    pub fn iter_tiles(&self) -> impl Iterator<Item = ((i32, i32), TileKind)> + '_ {
        self.chunks.iter().flat_map(|((cx, cy), chunk)| {
            let cx = *cx;
            let cy = *cy;
            chunk.tiles.iter().enumerate().filter_map(move |(i, t)| {
                t.map(|k| {
                    let lx = (i % CHUNK_SIZE as usize) as i32;
                    let ly = (i / CHUNK_SIZE as usize) as i32;
                    ((cx * CHUNK_SIZE + lx, cy * CHUNK_SIZE + ly), k)
                })
            })
        })
    }

    pub fn len(&self) -> usize {
        self.chunks
            .values()
            .map(|c| c.tiles.iter().filter(|t| t.is_some()).count())
            .sum()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn set_then_get() {
        let mut g = ChunkGrid::new();
        g.set(1, 2, TileKind::Wall);
        assert_eq!(g.get(1, 2), Some(TileKind::Wall));
        assert_eq!(g.get(1, 3), None);
        assert_eq!(g.len(), 1);
    }

    #[test]
    fn erase_deallocates_empty_chunk() {
        let mut g = ChunkGrid::new();
        g.set(0, 0, TileKind::Floor);
        assert_eq!(g.chunks.len(), 1);
        g.erase(0, 0);
        assert!(g.chunks.is_empty(), "empty chunk should be deallocated");
        assert_eq!(g.get(0, 0), None);
    }

    #[test]
    fn cross_chunk_boundary_positive() {
        let mut g = ChunkGrid::new();
        g.set(31, 0, TileKind::Floor);
        g.set(32, 0, TileKind::Wall);
        assert_eq!(g.chunks.len(), 2);
        assert_eq!(g.get(31, 0), Some(TileKind::Floor));
        assert_eq!(g.get(32, 0), Some(TileKind::Wall));
    }

    #[test]
    fn negative_coordinates() {
        let mut g = ChunkGrid::new();
        g.set(-1, -1, TileKind::Tree);
        g.set(-32, -32, TileKind::Grass);
        assert_eq!(g.get(-1, -1), Some(TileKind::Tree));
        assert_eq!(g.get(-32, -32), Some(TileKind::Grass));
        // Both (-1,-1) and (-32,-32) fall in chunk (-1,-1) under div_euclid semantics
        // (see coords tests `negative_one_wraps_to_last_cell` / `negative_32_is_chunk_origin_minus_one`),
        // so both tiles share one chunk.
        assert_eq!(g.chunks.len(), 1);
    }

    #[test]
    fn iter_tiles_round_trip() {
        let mut g = ChunkGrid::new();
        let pts = [(0i32, 0i32), (5, 9), (40, -3), (-7, -50), (33, 33)];
        for &(x, y) in &pts {
            g.set(x, y, TileKind::FloorAlt);
        }
        let mut collected: Vec<(i32, i32)> = g.iter_tiles().map(|(p, _)| p).collect();
        collected.sort();
        let mut expected = pts.to_vec();
        expected.sort();
        assert_eq!(collected, expected);
    }

    #[test]
    fn overwrite_same_cell() {
        let mut g = ChunkGrid::new();
        g.set(2, 2, TileKind::Floor);
        g.set(2, 2, TileKind::Wall);
        assert_eq!(g.get(2, 2), Some(TileKind::Wall));
        assert_eq!(g.len(), 1);
    }
}
