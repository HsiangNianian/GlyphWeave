use super::{BlockKey, CHUNK_VOLUME, LocalVoxelCoord};

/// One dense `16 x 16 x 16` chunk. The world allocates chunks sparsely.
#[derive(Debug, Clone)]
pub struct VoxelChunk {
    blocks: Box<[BlockKey; CHUNK_VOLUME]>,
    occupied: usize,
}

impl Default for VoxelChunk {
    fn default() -> Self {
        Self {
            blocks: Box::new([BlockKey::AIR; CHUNK_VOLUME]),
            occupied: 0,
        }
    }
}

impl VoxelChunk {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn get(&self, coord: LocalVoxelCoord) -> BlockKey {
        self.blocks[coord.index()]
    }

    /// Sets a block and returns the previous value.
    pub fn set(&mut self, coord: LocalVoxelCoord, block: BlockKey) -> BlockKey {
        let cell = &mut self.blocks[coord.index()];
        let previous = *cell;
        if previous.is_air() && !block.is_air() {
            self.occupied += 1;
        } else if !previous.is_air() && block.is_air() {
            self.occupied -= 1;
        }
        *cell = block;
        previous
    }

    pub fn erase(&mut self, coord: LocalVoxelCoord) -> BlockKey {
        self.set(coord, BlockKey::AIR)
    }

    pub fn len(&self) -> usize {
        self.occupied
    }

    pub fn is_empty(&self) -> bool {
        self.occupied == 0
    }

    pub fn iter(&self) -> impl Iterator<Item = (LocalVoxelCoord, BlockKey)> + '_ {
        self.blocks
            .iter()
            .copied()
            .enumerate()
            .filter(|(_, block)| !block.is_air())
            .map(|(index, block)| {
                (
                    LocalVoxelCoord::from_index(index).expect("chunk index is always in bounds"),
                    block,
                )
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn set_overwrite_and_erase_track_occupancy() {
        let mut chunk = VoxelChunk::new();
        let coord = LocalVoxelCoord::new(15, 3, 8).unwrap();
        let first = BlockKey::from_runtime_index(1);
        let second = BlockKey::from_runtime_index(2);

        assert_eq!(chunk.set(coord, first), BlockKey::AIR);
        assert_eq!(chunk.len(), 1);
        assert_eq!(chunk.set(coord, second), first);
        assert_eq!(chunk.len(), 1);
        assert_eq!(chunk.erase(coord), second);
        assert!(chunk.is_empty());
        assert_eq!(chunk.get(coord), BlockKey::AIR);
    }

    #[test]
    fn iteration_only_yields_non_air_blocks() {
        let mut chunk = VoxelChunk::new();
        let a = LocalVoxelCoord::new(0, 0, 0).unwrap();
        let b = LocalVoxelCoord::new(15, 15, 15).unwrap();
        chunk.set(a, BlockKey::from_runtime_index(1));
        chunk.set(b, BlockKey::from_runtime_index(2));

        let mut entries: Vec<_> = chunk.iter().collect();
        entries.sort_by_key(|(coord, _)| coord.index());
        assert_eq!(
            entries,
            vec![
                (a, BlockKey::from_runtime_index(1)),
                (b, BlockKey::from_runtime_index(2))
            ]
        );
    }
}
