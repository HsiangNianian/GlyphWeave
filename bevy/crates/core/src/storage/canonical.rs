//! Canonical palette construction and content-addressed chunk identity.

use std::collections::{BTreeMap, BTreeSet};

use super::bitpack::{minimal_bits, pack_indices};
use super::{StorageError, StorageResult};

pub const VOXELS_PER_CHUNK: usize = 16 * 16 * 16;
const HASH_DOMAIN: &[u8] = b"GEMAP-CHUNK-V1\0";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CanonicalChunk {
    pub palette: Vec<u32>,
    pub bits: u8,
    pub data: Vec<u8>,
    pub id: String,
}

/// Converts global block IDs into the one canonical representation allowed on disk.
pub fn canonicalize(blocks: &[u32]) -> StorageResult<CanonicalChunk> {
    if blocks.len() != VOXELS_PER_CHUNK {
        return Err(StorageError::InvalidVoxelCount(blocks.len()));
    }
    if blocks.iter().all(|&block| block == 0) {
        return Err(StorageError::AirOnlyChunk);
    }

    let palette: Vec<u32> = blocks
        .iter()
        .copied()
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    let inverse: BTreeMap<u32, u32> = palette
        .iter()
        .enumerate()
        .map(|(index, &block)| (block, index as u32))
        .collect();
    let indices: Vec<u32> = blocks.iter().map(|block| inverse[block]).collect();
    let bits = minimal_bits(palette.len())?;
    let data = pack_indices(&indices, bits, palette.len())?;
    let id = chunk_id(&palette, bits, &data);

    Ok(CanonicalChunk {
        palette,
        bits,
        data,
        id,
    })
}

pub fn chunk_id(palette: &[u32], bits: u8, data: &[u8]) -> String {
    let mut hasher = blake3::Hasher::new();
    hasher.update(HASH_DOMAIN);
    hasher.update(&(palette.len() as u32).to_le_bytes());
    for block in palette {
        hasher.update(&block.to_le_bytes());
    }
    hasher.update(&[bits]);
    hasher.update(data);
    hasher.finalize().to_hex().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonical_palette_is_sorted_and_unused_entries_cannot_exist() {
        let mut blocks = vec![17; VOXELS_PER_CHUNK];
        blocks[1] = 12;
        blocks[2] = 12;
        blocks[3] = 17;
        let chunk = canonicalize(&blocks).unwrap();

        assert_eq!(chunk.palette, vec![12, 17]);
        assert_eq!(chunk.bits, 1);
        assert_eq!(chunk.data.len(), 512);
        assert_eq!(chunk.id.len(), 64);
        assert!(
            chunk
                .id
                .chars()
                .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
        );
    }

    #[test]
    fn same_voxels_always_have_same_identity() {
        let mut blocks = vec![0; VOXELS_PER_CHUNK];
        for (index, block) in blocks.iter_mut().enumerate() {
            *block = [17, 12, 12, 17][index % 4];
        }
        let first = canonicalize(&blocks).unwrap();
        let second = canonicalize(&blocks).unwrap();
        assert_eq!(first, second);
    }

    #[test]
    fn changing_one_voxel_changes_identity() {
        let mut blocks = vec![1; VOXELS_PER_CHUNK];
        let before = canonicalize(&blocks).unwrap();
        blocks[VOXELS_PER_CHUNK - 1] = 2;
        let after = canonicalize(&blocks).unwrap();
        assert_ne!(before.id, after.id);
    }

    #[test]
    fn air_only_chunks_are_absent() {
        assert_eq!(
            canonicalize(&vec![0; VOXELS_PER_CHUNK]),
            Err(StorageError::AirOnlyChunk)
        );
    }

    #[test]
    fn exact_voxel_count_is_required() {
        assert_eq!(
            canonicalize(&vec![1; VOXELS_PER_CHUNK - 1]),
            Err(StorageError::InvalidVoxelCount(VOXELS_PER_CHUNK - 1))
        );
    }
}
