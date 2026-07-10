use std::collections::HashMap;

use thiserror::Error;

use super::{
    BlockKey, BlockRegistry, RegionCoord, RegistryError, VoxelBounds, VoxelCoord, VoxelRegion,
};

#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum VoxelWorldError {
    #[error(transparent)]
    Registry(#[from] RegistryError),
    #[error("block key {0:?} does not belong to this world's registry")]
    UnknownBlockKey(BlockKey),
}

/// An unbounded sparse 3D voxel world with a world-local block registry.
#[derive(Debug, Clone)]
pub struct VoxelWorld {
    pub name: String,
    registry: BlockRegistry,
    regions: HashMap<RegionCoord, VoxelRegion>,
    occupied: usize,
}

impl Default for VoxelWorld {
    fn default() -> Self {
        Self {
            name: "Untitled".to_owned(),
            registry: BlockRegistry::new(),
            regions: HashMap::new(),
            occupied: 0,
        }
    }
}

impl VoxelWorld {
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            ..Self::default()
        }
    }

    pub const fn registry(&self) -> &BlockRegistry {
        &self.registry
    }

    /// The registry is append-only, so existing world keys remain stable.
    pub fn registry_mut(&mut self) -> &mut BlockRegistry {
        &mut self.registry
    }

    pub fn intern_block(&mut self, name: impl Into<String>) -> Result<BlockKey, RegistryError> {
        self.registry.intern(name)
    }

    /// Missing voxels and missing regions are air.
    pub fn get(&self, coord: VoxelCoord) -> BlockKey {
        let (chunk, local) = coord.split();
        let (region, region_chunk) = chunk.split_region();
        self.regions
            .get(&region)
            .map_or(BlockKey::AIR, |value| value.get(region_chunk, local))
    }

    /// Sets a block and returns the previous value.
    pub fn set(&mut self, coord: VoxelCoord, block: BlockKey) -> Result<BlockKey, VoxelWorldError> {
        if !self.registry.contains(block) {
            return Err(VoxelWorldError::UnknownBlockKey(block));
        }
        if block.is_air() {
            return Ok(self.erase(coord));
        }

        let (chunk, local) = coord.split();
        let (region_coord, region_chunk) = chunk.split_region();
        let region = self
            .regions
            .entry(region_coord)
            .or_insert_with(|| VoxelRegion::new(region_coord));
        let previous = region.set(region_chunk, local, block);
        if previous.is_air() {
            self.occupied += 1;
        }
        Ok(previous)
    }

    pub fn erase(&mut self, coord: VoxelCoord) -> BlockKey {
        let (chunk, local) = coord.split();
        let (region_coord, region_chunk) = chunk.split_region();
        let Some(region) = self.regions.get_mut(&region_coord) else {
            return BlockKey::AIR;
        };
        let previous = region.erase(region_chunk, local);
        let remove_region = region.is_empty();
        if !previous.is_air() {
            self.occupied -= 1;
        }
        if remove_region {
            self.regions.remove(&region_coord);
        }
        previous
    }

    pub fn len(&self) -> usize {
        self.occupied
    }

    pub fn is_empty(&self) -> bool {
        self.occupied == 0
    }

    pub fn region_count(&self) -> usize {
        self.regions.len()
    }

    pub fn chunk_count(&self) -> usize {
        self.regions.values().map(VoxelRegion::chunk_count).sum()
    }

    pub fn iter_regions(&self) -> impl Iterator<Item = (RegionCoord, &VoxelRegion)> + '_ {
        self.regions.iter().map(|(coord, region)| (*coord, region))
    }

    pub fn iter_voxels(&self) -> impl Iterator<Item = (VoxelCoord, BlockKey)> + '_ {
        self.regions.values().flat_map(VoxelRegion::iter_voxels)
    }

    /// Computes inclusive occupied bounds. Empty worlds have no bounds.
    pub fn bounds(&self) -> Option<VoxelBounds> {
        let mut voxels = self.iter_voxels();
        let (first, _) = voxels.next()?;
        let mut bounds = VoxelBounds::single(first);
        for (coord, _) in voxels {
            bounds.include(coord);
        }
        Some(bounds)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn set_get_overwrite_and_erase() {
        let mut world = VoxelWorld::new("Core test");
        let wall = world.intern_block("glyphweave:wall").unwrap();
        let floor = world.intern_block("glyphweave:floor").unwrap();
        let coord = VoxelCoord::new(-7, 12, 33);

        assert_eq!(world.get(coord), BlockKey::AIR);
        assert_eq!(world.set(coord, wall).unwrap(), BlockKey::AIR);
        assert_eq!(world.get(coord), wall);
        assert_eq!(world.set(coord, floor).unwrap(), wall);
        assert_eq!(world.len(), 1);
        assert_eq!(world.erase(coord), floor);
        assert_eq!(world.get(coord), BlockKey::AIR);
        assert!(world.is_empty());
    }

    #[test]
    fn all_negative_golden_boundaries_are_addressable() {
        let mut world = VoxelWorld::new("Boundaries");
        let block = world.intern_block("test:marker").unwrap();
        let values = [-1, -16, -17, -512, -513];
        let mut coords = Vec::new();
        for value in values {
            coords.extend([
                VoxelCoord::new(value, 1, 2),
                VoxelCoord::new(1, value, 2),
                VoxelCoord::new(1, 2, value),
            ]);
        }
        for coord in &coords {
            world.set(*coord, block).unwrap();
        }
        for coord in &coords {
            assert_eq!(world.get(*coord), block, "missing voxel at {coord:?}");
        }
        assert_eq!(world.len(), coords.len());
    }

    #[test]
    fn erase_last_voxel_reclaims_chunk_and_region() {
        let mut world = VoxelWorld::new("Sparse");
        let block = world.intern_block("test:block").unwrap();
        let a = VoxelCoord::new(0, 0, 0);
        let b = VoxelCoord::new(0, 1, 0);
        world.set(a, block).unwrap();
        world.set(b, block).unwrap();
        assert_eq!(world.region_count(), 1);
        assert_eq!(world.chunk_count(), 1);

        world.erase(a);
        assert_eq!(world.chunk_count(), 1);
        world.erase(b);
        assert_eq!(world.chunk_count(), 0);
        assert_eq!(world.region_count(), 0);
    }

    #[test]
    fn set_air_is_an_erase_and_does_not_allocate() {
        let mut world = VoxelWorld::new("Air");
        assert_eq!(
            world
                .set(VoxelCoord::new(99, 99, 99), BlockKey::AIR)
                .unwrap(),
            BlockKey::AIR
        );
        assert!(world.is_empty());
        assert_eq!(world.chunk_count(), 0);
        assert_eq!(world.region_count(), 0);
    }

    #[test]
    fn rejects_keys_from_outside_the_registry() {
        let mut world = VoxelWorld::new("Invalid key");
        let foreign = BlockKey::from_runtime_index(42);
        assert_eq!(
            world.set(VoxelCoord::new(0, 0, 0), foreign),
            Err(VoxelWorldError::UnknownBlockKey(foreign))
        );
        assert!(world.is_empty());
    }

    #[test]
    fn iteration_and_bounds_cover_sparse_world() {
        let mut world = VoxelWorld::new("Bounds");
        let block = world.intern_block("test:block").unwrap();
        let coords = [
            VoxelCoord::new(-20, 8, 40),
            VoxelCoord::new(5, -600, 7),
            VoxelCoord::new(2, 30, -900),
        ];
        for coord in coords {
            world.set(coord, block).unwrap();
        }

        let mut actual: Vec<_> = world.iter_voxels().map(|(coord, _)| coord).collect();
        actual.sort();
        let mut expected = coords.to_vec();
        expected.sort();
        assert_eq!(actual, expected);
        assert_eq!(
            world.bounds(),
            Some(VoxelBounds {
                min: VoxelCoord::new(-20, -600, -900),
                max: VoxelCoord::new(5, 30, 40),
            })
        );
    }

    #[test]
    fn unknown_registered_name_survives_world_iteration() {
        let mut world = VoxelWorld::new("Future data");
        let unknown = world.intern_block("uninstalled-mod:future_block").unwrap();
        world.set(VoxelCoord::new(3, 2, 1), unknown).unwrap();

        let (_, key) = world.iter_voxels().next().unwrap();
        assert_eq!(
            world.registry().name(key),
            Some("uninstalled-mod:future_block")
        );
    }
}
