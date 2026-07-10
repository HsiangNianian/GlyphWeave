//! Unbounded sparse voxel-world model.
//!
//! Public coordinates always use protocol order `(z, x, y)`. The model is
//! independent from Bevy and from the `.gemap` storage codec.

mod chunk;
mod coords;
mod region;
mod registry;
mod world;

pub use chunk::VoxelChunk;
pub use coords::{
    CHUNK_EDGE, CHUNK_VOLUME, ChunkCoord, LocalVoxelCoord, REGION_EDGE_CHUNKS, RegionChunkCoord,
    RegionCoord, VoxelBounds, VoxelCoord,
};
pub use region::VoxelRegion;
pub use registry::{AIR_BLOCK_NAME, BlockKey, BlockRegistry, RegistryError, SerializedBlockId};
pub use world::{VoxelWorld, VoxelWorldError};
