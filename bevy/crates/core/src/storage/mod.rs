//! Canonical `.gemap` v3 storage primitives.
//!
//! This module is independent of ZIP container I/O so the binary chunk format
//! can be tested and shared by native and WASM readers.

pub mod archive;
pub mod bitpack;
pub mod canonical;
pub mod codec;
pub mod model;

use thiserror::Error;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum StorageError {
    #[error("palette must contain at least one block")]
    EmptyPalette,
    #[error("bits per index must be in 1..=32, got {0}")]
    InvalidBits(u8),
    #[error("palette length {palette_len} does not fit in {bits} bits")]
    PaletteDoesNotFit { palette_len: usize, bits: u8 },
    #[error("palette length {palette_len} requires canonical bit width {expected}, got {actual}")]
    NonMinimalBits {
        palette_len: usize,
        expected: u8,
        actual: u8,
    },
    #[error(
        "palette index {index} at position {position} is out of range for {palette_len} entries"
    )]
    PaletteIndexOutOfRange {
        position: usize,
        index: u32,
        palette_len: usize,
    },
    #[error("packed data length must be {expected} bytes, got {actual}")]
    InvalidPackedLength { expected: usize, actual: usize },
    #[error("unused high bits in the final packed byte must be zero")]
    NonZeroPadding,
    #[error("a canonical chunk must contain exactly 4096 voxels, got {0}")]
    InvalidVoxelCount(usize),
    #[error("air-only chunks are represented by an absent section")]
    AirOnlyChunk,
}

pub type StorageResult<T> = std::result::Result<T, StorageError>;
