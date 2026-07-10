//! Import-only migrations from legacy `.gemap` formats.
//!
//! Legacy layers are compositing state. They are intentionally kept outside
//! the v3 voxel model and are consumed only while producing a
//! [`VoxelWorld`](crate::voxel::VoxelWorld).

mod v2;

pub use v2::{
    LegacyGemap, LegacyLayer, MappedLegacyTile, MigrationError, MigrationMode, MigrationReport,
    MigrationResult, SkippedHiddenLayer, legacy_tile_mapping, migrate_legacy, migrate_legacy_json,
    parse_legacy_json,
};
