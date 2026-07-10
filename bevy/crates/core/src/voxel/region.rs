use std::collections::HashMap;

use super::{
    BlockKey, ChunkCoord, LocalVoxelCoord, RegionChunkCoord, RegionCoord, VoxelChunk, VoxelCoord,
};

/// All vertical chunks inside one `32 x 32` horizontal region.
#[derive(Debug, Clone)]
pub struct VoxelRegion {
    coord: RegionCoord,
    chunks: HashMap<RegionChunkCoord, VoxelChunk>,
    occupied: usize,
}

impl VoxelRegion {
    pub fn new(coord: RegionCoord) -> Self {
        Self {
            coord,
            chunks: HashMap::new(),
            occupied: 0,
        }
    }

    pub const fn coord(&self) -> RegionCoord {
        self.coord
    }

    pub fn get(&self, chunk: RegionChunkCoord, local: LocalVoxelCoord) -> BlockKey {
        self.chunks
            .get(&chunk)
            .map_or(BlockKey::AIR, |section| section.get(local))
    }

    /// Sets a block and returns the previous value. Air never allocates a chunk.
    pub fn set(
        &mut self,
        chunk: RegionChunkCoord,
        local: LocalVoxelCoord,
        block: BlockKey,
    ) -> BlockKey {
        if block.is_air() {
            return self.erase(chunk, local);
        }

        let section = self.chunks.entry(chunk).or_default();
        let previous = section.set(local, block);
        if previous.is_air() {
            self.occupied += 1;
        }
        previous
    }

    pub fn erase(&mut self, chunk: RegionChunkCoord, local: LocalVoxelCoord) -> BlockKey {
        let Some(section) = self.chunks.get_mut(&chunk) else {
            return BlockKey::AIR;
        };
        let previous = section.erase(local);
        let remove_chunk = section.is_empty();
        if !previous.is_air() {
            self.occupied -= 1;
        }
        if remove_chunk {
            self.chunks.remove(&chunk);
        }
        previous
    }

    pub fn len(&self) -> usize {
        self.occupied
    }

    pub fn is_empty(&self) -> bool {
        self.occupied == 0
    }

    pub fn chunk_count(&self) -> usize {
        self.chunks.len()
    }

    pub fn iter_chunks(&self) -> impl Iterator<Item = (RegionChunkCoord, &VoxelChunk)> + '_ {
        self.chunks.iter().map(|(coord, chunk)| (*coord, chunk))
    }

    pub fn iter_voxels(&self) -> impl Iterator<Item = (VoxelCoord, BlockKey)> + '_ {
        self.iter_chunks().flat_map(|(region_chunk, chunk)| {
            let chunk_coord = ChunkCoord::from_region_local(self.coord, region_chunk);
            chunk.iter().map(move |(local, block)| {
                (VoxelCoord::from_chunk_local(chunk_coord, local), block)
            })
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn air_does_not_allocate_and_last_erase_removes_chunk() {
        let mut region = VoxelRegion::new(RegionCoord::new(-1, 2));
        let chunk = RegionChunkCoord::new(4, 31, 0).unwrap();
        let local = LocalVoxelCoord::new(1, 2, 3).unwrap();

        assert_eq!(region.set(chunk, local, BlockKey::AIR), BlockKey::AIR);
        assert_eq!(region.chunk_count(), 0);
        region.set(chunk, local, BlockKey::from_runtime_index(1));
        assert_eq!(region.chunk_count(), 1);
        assert_eq!(region.len(), 1);
        assert_eq!(region.erase(chunk, local), BlockKey::from_runtime_index(1));
        assert!(region.is_empty());
        assert_eq!(region.chunk_count(), 0);
    }

    #[test]
    fn iteration_reconstructs_global_coordinates() {
        let region_coord = RegionCoord::new(-2, 1);
        let mut region = VoxelRegion::new(region_coord);
        let section = RegionChunkCoord::new(-3, 31, 4).unwrap();
        let local = LocalVoxelCoord::new(15, 2, 7).unwrap();
        region.set(section, local, BlockKey::from_runtime_index(9));

        let chunk = ChunkCoord::from_region_local(region_coord, section);
        assert_eq!(
            region.iter_voxels().collect::<Vec<_>>(),
            vec![(
                VoxelCoord::from_chunk_local(chunk, local),
                BlockKey::from_runtime_index(9)
            )]
        );
    }
}
