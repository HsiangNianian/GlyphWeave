/// Edge length of a cubic voxel chunk.
pub const CHUNK_EDGE: i32 = 16;
pub const CHUNK_VOLUME: usize =
    (CHUNK_EDGE as usize) * (CHUNK_EDGE as usize) * (CHUNK_EDGE as usize);

/// Horizontal edge length of a region in chunks.
pub const REGION_EDGE_CHUNKS: i32 = 32;

/// A voxel position in protocol order `(z, x, y)`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct VoxelCoord {
    pub z: i32,
    pub x: i32,
    pub y: i32,
}

impl VoxelCoord {
    pub const fn new(z: i32, x: i32, y: i32) -> Self {
        Self { z, x, y }
    }

    /// Splits this coordinate using Euclidean division on every axis.
    pub fn split(self) -> (ChunkCoord, LocalVoxelCoord) {
        let chunk = ChunkCoord::new(
            self.z.div_euclid(CHUNK_EDGE),
            self.x.div_euclid(CHUNK_EDGE),
            self.y.div_euclid(CHUNK_EDGE),
        );
        let local = LocalVoxelCoord::new_unchecked(
            self.z.rem_euclid(CHUNK_EDGE) as u8,
            self.x.rem_euclid(CHUNK_EDGE) as u8,
            self.y.rem_euclid(CHUNK_EDGE) as u8,
        );
        (chunk, local)
    }

    pub fn chunk(self) -> ChunkCoord {
        self.split().0
    }

    pub fn local(self) -> LocalVoxelCoord {
        self.split().1
    }

    pub fn from_chunk_local(chunk: ChunkCoord, local: LocalVoxelCoord) -> Self {
        Self::new(
            chunk.z * CHUNK_EDGE + i32::from(local.z()),
            chunk.x * CHUNK_EDGE + i32::from(local.x()),
            chunk.y * CHUNK_EDGE + i32::from(local.y()),
        )
    }
}

/// A global chunk position in protocol order `(z, x, y)`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct ChunkCoord {
    pub z: i32,
    pub x: i32,
    pub y: i32,
}

impl ChunkCoord {
    pub const fn new(z: i32, x: i32, y: i32) -> Self {
        Self { z, x, y }
    }

    /// Splits a global chunk into its horizontal region and region-local key.
    pub fn split_region(self) -> (RegionCoord, RegionChunkCoord) {
        let region = RegionCoord::new(
            self.x.div_euclid(REGION_EDGE_CHUNKS),
            self.y.div_euclid(REGION_EDGE_CHUNKS),
        );
        let local = RegionChunkCoord::new_unchecked(
            self.z,
            self.x.rem_euclid(REGION_EDGE_CHUNKS) as u8,
            self.y.rem_euclid(REGION_EDGE_CHUNKS) as u8,
        );
        (region, local)
    }

    pub fn region(self) -> RegionCoord {
        self.split_region().0
    }

    pub fn local_in_region(self) -> RegionChunkCoord {
        self.split_region().1
    }

    pub fn from_region_local(region: RegionCoord, local: RegionChunkCoord) -> Self {
        Self::new(
            local.z(),
            region.x * REGION_EDGE_CHUNKS + i32::from(local.x()),
            region.y * REGION_EDGE_CHUNKS + i32::from(local.y()),
        )
    }
}

/// A horizontal region coordinate in `(x, y)` order.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct RegionCoord {
    pub x: i32,
    pub y: i32,
}

impl RegionCoord {
    pub const fn new(x: i32, y: i32) -> Self {
        Self { x, y }
    }
}

/// A voxel position inside one chunk, in protocol order `(z, x, y)`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct LocalVoxelCoord {
    z: u8,
    x: u8,
    y: u8,
}

impl LocalVoxelCoord {
    pub fn new(z: u8, x: u8, y: u8) -> Option<Self> {
        (usize::from(z) < CHUNK_EDGE as usize
            && usize::from(x) < CHUNK_EDGE as usize
            && usize::from(y) < CHUNK_EDGE as usize)
            .then_some(Self { z, x, y })
    }

    const fn new_unchecked(z: u8, x: u8, y: u8) -> Self {
        Self { z, x, y }
    }

    pub const fn z(self) -> u8 {
        self.z
    }

    pub const fn x(self) -> u8 {
        self.x
    }

    pub const fn y(self) -> u8 {
        self.y
    }

    /// `((lz * 16) + ly) * 16 + lx`, as frozen by `.gemap` v3.
    pub fn index(self) -> usize {
        ((usize::from(self.z) * CHUNK_EDGE as usize) + usize::from(self.y)) * CHUNK_EDGE as usize
            + usize::from(self.x)
    }

    pub fn from_index(index: usize) -> Option<Self> {
        if index >= CHUNK_VOLUME {
            return None;
        }
        let x = (index % CHUNK_EDGE as usize) as u8;
        let yz = index / CHUNK_EDGE as usize;
        let y = (yz % CHUNK_EDGE as usize) as u8;
        let z = (yz / CHUNK_EDGE as usize) as u8;
        Some(Self::new_unchecked(z, x, y))
    }
}

/// A section key inside one region, in `(cz, rcx, rcy)` order.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct RegionChunkCoord {
    z: i32,
    x: u8,
    y: u8,
}

impl RegionChunkCoord {
    pub fn new(z: i32, x: u8, y: u8) -> Option<Self> {
        (usize::from(x) < REGION_EDGE_CHUNKS as usize
            && usize::from(y) < REGION_EDGE_CHUNKS as usize)
            .then_some(Self { z, x, y })
    }

    const fn new_unchecked(z: i32, x: u8, y: u8) -> Self {
        Self { z, x, y }
    }

    pub const fn z(self) -> i32 {
        self.z
    }

    pub const fn x(self) -> u8 {
        self.x
    }

    pub const fn y(self) -> u8 {
        self.y
    }
}

/// Inclusive occupied bounds of a voxel world.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct VoxelBounds {
    pub min: VoxelCoord,
    pub max: VoxelCoord,
}

impl VoxelBounds {
    pub const fn single(coord: VoxelCoord) -> Self {
        Self {
            min: coord,
            max: coord,
        }
    }

    pub fn include(&mut self, coord: VoxelCoord) {
        self.min.z = self.min.z.min(coord.z);
        self.min.x = self.min.x.min(coord.x);
        self.min.y = self.min.y.min(coord.y);
        self.max.z = self.max.z.max(coord.z);
        self.max.x = self.max.x.max(coord.x);
        self.max.y = self.max.y.max(coord.y);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_index_uses_frozen_axis_order() {
        assert_eq!(LocalVoxelCoord::new(0, 0, 0).unwrap().index(), 0);
        assert_eq!(LocalVoxelCoord::new(0, 1, 0).unwrap().index(), 1);
        assert_eq!(LocalVoxelCoord::new(0, 0, 1).unwrap().index(), 16);
        assert_eq!(LocalVoxelCoord::new(1, 0, 0).unwrap().index(), 256);
        assert_eq!(LocalVoxelCoord::new(15, 15, 15).unwrap().index(), 4095);
        assert!(LocalVoxelCoord::new(16, 0, 0).is_none());
        assert!(LocalVoxelCoord::from_index(4096).is_none());

        for index in 0..CHUNK_VOLUME {
            assert_eq!(LocalVoxelCoord::from_index(index).unwrap().index(), index);
        }
    }

    #[test]
    fn negative_boundaries_round_trip_on_every_axis() {
        let values = [-1, -16, -17, -512, -513];
        for value in values {
            for coord in [
                VoxelCoord::new(value, 7, 11),
                VoxelCoord::new(7, value, 11),
                VoxelCoord::new(7, 11, value),
            ] {
                let (chunk, local) = coord.split();
                assert_eq!(VoxelCoord::from_chunk_local(chunk, local), coord);
            }
        }
    }

    #[test]
    fn golden_negative_chunk_decomposition() {
        let cases = [
            (-1, -1, 15),
            (-16, -1, 0),
            (-17, -2, 15),
            (-512, -32, 0),
            (-513, -33, 15),
        ];
        for (voxel, expected_chunk, expected_local) in cases {
            let coord = VoxelCoord::new(voxel, voxel, voxel);
            let (chunk, local) = coord.split();
            assert_eq!(
                chunk,
                ChunkCoord::new(expected_chunk, expected_chunk, expected_chunk)
            );
            assert_eq!(
                local,
                LocalVoxelCoord::new(expected_local, expected_local, expected_local).unwrap()
            );
        }
    }

    #[test]
    fn golden_negative_region_decomposition() {
        let cases = [
            (-1, -1, 31),
            (-16, -1, 31),
            (-17, -1, 30),
            (-512, -1, 0),
            (-513, -2, 31),
        ];
        for (voxel, expected_region, expected_region_chunk) in cases {
            for coord in [VoxelCoord::new(0, voxel, 0), VoxelCoord::new(0, 0, voxel)] {
                let chunk = coord.chunk();
                let (region, local) = chunk.split_region();
                let actual_region = if coord.x == voxel { region.x } else { region.y };
                let actual_local = if coord.x == voxel {
                    local.x()
                } else {
                    local.y()
                };
                assert_eq!(actual_region, expected_region);
                assert_eq!(actual_local, expected_region_chunk);
                assert_eq!(ChunkCoord::from_region_local(region, local), chunk);
            }
        }
    }

    #[test]
    fn bounds_include_all_axes() {
        let mut bounds = VoxelBounds::single(VoxelCoord::new(2, 3, 4));
        bounds.include(VoxelCoord::new(-1, 10, 0));
        assert_eq!(bounds.min, VoxelCoord::new(-1, 3, 0));
        assert_eq!(bounds.max, VoxelCoord::new(2, 10, 4));
    }
}
