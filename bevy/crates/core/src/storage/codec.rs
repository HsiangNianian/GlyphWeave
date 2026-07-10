//! End-to-end `.gemap` v3 encoding and decoding.

use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::io::Cursor;

use thiserror::Error;

use crate::voxel::{
    BlockKey, CHUNK_VOLUME, ChunkCoord, LocalVoxelCoord, RegionChunkCoord, RegionCoord,
    RegistryError, VoxelWorld, VoxelWorldError,
};

use super::StorageError;
use super::archive::{ArchiveError, ArchiveLimits, read_entries, write_entries};
use super::bitpack::unpack_indices;
use super::canonical::{canonicalize, chunk_id};
use super::model::{
    AIR_BLOCK_NAME, ChunkRecord, Manifest, ModelError, RegionManifest, parse_region_key,
    parse_section_key,
};

#[derive(Debug, Error)]
pub enum GemapV3Error {
    #[error(transparent)]
    Archive(#[from] ArchiveError),
    #[error("invalid JSON in {path}: {source}")]
    Json {
        path: String,
        #[source]
        source: serde_json::Error,
    },
    #[error("invalid {path}: {source}")]
    Model {
        path: String,
        #[source]
        source: ModelError,
    },
    #[error("invalid chunk {chunk_id}: {source}")]
    Chunk {
        chunk_id: String,
        #[source]
        source: StorageError,
    },
    #[error("manifest references missing entry {0}")]
    MissingEntry(String),
    #[error("region entry {path} declares {actual:?}, expected {expected:?}")]
    RegionCoordinateMismatch {
        path: String,
        expected: (i32, i32),
        actual: (i32, i32),
    },
    #[error("chunk {chunk_id} references unregistered block ID {block_id}")]
    UnregisteredBlockId { chunk_id: String, block_id: u32 },
    #[error("chunk {chunk_id} content hash is {actual}, not its declared ID")]
    ChunkHashMismatch { chunk_id: String, actual: String },
    #[error("block registry error: {0}")]
    Registry(#[from] RegistryError),
    #[error("voxel world error: {0}")]
    World(#[from] VoxelWorldError),
    #[error("runtime block key {0:?} is missing from the serialized registry")]
    MissingRuntimeBlock(BlockKey),
}

pub type GemapV3Result<T> = std::result::Result<T, GemapV3Error>;

#[derive(Debug)]
pub struct DecodedGemap {
    pub world: VoxelWorld,
    pub metadata: Option<BTreeMap<String, serde_json::Value>>,
}

pub fn encode_world(world: &VoxelWorld) -> GemapV3Result<Vec<u8>> {
    encode_world_with_metadata(world, None)
}

pub fn encode_world_with_metadata(
    world: &VoxelWorld,
    metadata: Option<BTreeMap<String, serde_json::Value>>,
) -> GemapV3Result<Vec<u8>> {
    let (block_registry, serialized_ids) = encode_registry(world);
    let mut manifest = Manifest::new(world.name.clone(), block_registry);
    manifest.metadata = metadata;
    let mut entries = BTreeMap::new();

    let mut regions: Vec<_> = world.iter_regions().collect();
    regions.sort_by_key(|(coord, _)| (coord.x, coord.y));
    for (region_coord, region) in regions {
        let region_key = format!("{},{}", region_coord.x, region_coord.y);
        let region_path = format!("regions/{}.{}/region.json", region_coord.x, region_coord.y);
        manifest.regions.insert(region_key, region_path.clone());

        let mut region_manifest = RegionManifest::new((region_coord.x, region_coord.y));
        let mut chunks: Vec<_> = region.iter_chunks().collect();
        chunks.sort_by_key(|(coord, _)| (coord.z(), coord.x(), coord.y()));
        for (section_coord, chunk) in chunks {
            let mut blocks = Vec::with_capacity(CHUNK_VOLUME);
            for index in 0..CHUNK_VOLUME {
                let local = LocalVoxelCoord::from_index(index)
                    .expect("indices below CHUNK_VOLUME are valid local coordinates");
                let runtime = chunk.get(local);
                let serialized = serialized_ids
                    .get(&runtime)
                    .copied()
                    .ok_or(GemapV3Error::MissingRuntimeBlock(runtime))?;
                blocks.push(serialized);
            }
            let canonical = canonicalize(&blocks).map_err(|source| GemapV3Error::Chunk {
                chunk_id: "<pending>".to_owned(),
                source,
            })?;
            let chunk_path = format!(
                "regions/{}.{}/chunks/{}.bin",
                region_coord.x, region_coord.y, canonical.id
            );
            entries
                .entry(chunk_path)
                .or_insert_with(|| canonical.data.clone());
            region_manifest.sections.insert(
                format!(
                    "{},{},{}",
                    section_coord.z(),
                    section_coord.x(),
                    section_coord.y()
                ),
                canonical.id.clone(),
            );
            region_manifest
                .chunks
                .entry(canonical.id.clone())
                .or_insert_with(|| ChunkRecord {
                    bits: canonical.bits,
                    palette: canonical.palette,
                    data: format!("chunks/{}.bin", canonical.id),
                });
        }
        region_manifest
            .validate()
            .map_err(|source| GemapV3Error::Model {
                path: region_path.clone(),
                source,
            })?;
        entries.insert(
            region_path.clone(),
            json_bytes(&region_path, &region_manifest)?,
        );
    }

    manifest.validate().map_err(|source| GemapV3Error::Model {
        path: "manifest.json".to_owned(),
        source,
    })?;
    entries.insert(
        "manifest.json".to_owned(),
        json_bytes("manifest.json", &manifest)?,
    );
    let cursor = write_entries(Cursor::new(Vec::new()), &entries)?;
    Ok(cursor.into_inner())
}

pub fn decode_world(bytes: &[u8], limits: ArchiveLimits) -> GemapV3Result<VoxelWorld> {
    decode_world_with_metadata(bytes, limits).map(|decoded| decoded.world)
}

pub fn decode_world_with_metadata(
    bytes: &[u8],
    limits: ArchiveLimits,
) -> GemapV3Result<DecodedGemap> {
    let entries = read_entries(Cursor::new(bytes), limits)?;
    let manifest: Manifest = parse_json(&entries, "manifest.json")?;
    manifest.validate().map_err(|source| GemapV3Error::Model {
        path: "manifest.json".to_owned(),
        source,
    })?;

    let mut world = VoxelWorld::new(manifest.world.name.clone());
    let mut runtime_keys = BTreeMap::new();
    for (&serialized_id, name) in &manifest.block_registry {
        let runtime = if serialized_id == 0 {
            BlockKey::AIR
        } else {
            world.intern_block(name.clone())?
        };
        runtime_keys.insert(serialized_id, runtime);
    }

    for (region_key, region_path) in &manifest.regions {
        let expected_region =
            parse_region_key(region_key).map_err(|source| GemapV3Error::Model {
                path: "manifest.json".to_owned(),
                source,
            })?;
        let region_manifest: RegionManifest = parse_json(&entries, region_path)?;
        region_manifest
            .validate()
            .map_err(|source| GemapV3Error::Model {
                path: region_path.clone(),
                source,
            })?;
        if region_manifest.region != expected_region {
            return Err(GemapV3Error::RegionCoordinateMismatch {
                path: region_path.clone(),
                expected: expected_region,
                actual: region_manifest.region,
            });
        }

        let region_dir = region_path
            .strip_suffix("region.json")
            .expect("validated canonical region paths end in region.json");
        let mut decoded_chunks: HashMap<String, Vec<BlockKey>> = HashMap::new();
        for (declared_id, record) in &region_manifest.chunks {
            for &block_id in &record.palette {
                if !runtime_keys.contains_key(&block_id) {
                    return Err(GemapV3Error::UnregisteredBlockId {
                        chunk_id: declared_id.clone(),
                        block_id,
                    });
                }
            }
        }
        for (section_key, declared_id) in &region_manifest.sections {
            let blocks = if let Some(blocks) = decoded_chunks.get(declared_id) {
                blocks
            } else {
                let record = &region_manifest.chunks[declared_id];
                let data_path = format!("{region_dir}{}", record.data);
                let data = entries
                    .get(&data_path)
                    .ok_or_else(|| GemapV3Error::MissingEntry(data_path.clone()))?;
                let indices = unpack_indices(data, record.bits, record.palette.len(), CHUNK_VOLUME)
                    .map_err(|source| GemapV3Error::Chunk {
                        chunk_id: declared_id.clone(),
                        source,
                    })?;
                let actual = chunk_id(&record.palette, record.bits, data);
                if actual != *declared_id {
                    return Err(GemapV3Error::ChunkHashMismatch {
                        chunk_id: declared_id.clone(),
                        actual,
                    });
                }
                let mut blocks = Vec::with_capacity(CHUNK_VOLUME);
                for index in indices {
                    let serialized_id = record.palette[index as usize];
                    let runtime = runtime_keys.get(&serialized_id).copied().ok_or_else(|| {
                        GemapV3Error::UnregisteredBlockId {
                            chunk_id: declared_id.clone(),
                            block_id: serialized_id,
                        }
                    })?;
                    blocks.push(runtime);
                }
                decoded_chunks.insert(declared_id.clone(), blocks);
                decoded_chunks
                    .get(declared_id)
                    .expect("chunk was inserted immediately above")
            };

            let (cz, rcx, rcy) =
                parse_section_key(section_key).map_err(|source| GemapV3Error::Model {
                    path: region_path.clone(),
                    source,
                })?;
            let region_coord = RegionCoord::new(expected_region.0, expected_region.1);
            let section_coord = RegionChunkCoord::new(cz, rcx, rcy)
                .expect("validated section local coordinates are in range");
            let chunk_coord = ChunkCoord::from_region_local(region_coord, section_coord);
            for (index, &block) in blocks.iter().enumerate() {
                if block.is_air() {
                    continue;
                }
                let local = LocalVoxelCoord::from_index(index)
                    .expect("decoded chunks contain exactly CHUNK_VOLUME entries");
                world.set(
                    crate::voxel::VoxelCoord::from_chunk_local(chunk_coord, local),
                    block,
                )?;
            }
        }
    }
    Ok(DecodedGemap {
        world,
        metadata: manifest.metadata,
    })
}

fn encode_registry(world: &VoxelWorld) -> (BTreeMap<u32, String>, HashMap<BlockKey, u32>) {
    let used: BTreeSet<BlockKey> = world
        .iter_voxels()
        .map(|(_, block)| block)
        .filter(|block| !block.is_air())
        .collect();
    let mut names: Vec<_> = used
        .into_iter()
        .map(|key| {
            (
                world
                    .registry()
                    .name(key)
                    .expect("world voxels only contain registered block keys")
                    .to_owned(),
                key,
            )
        })
        .collect();
    names.sort_by(|left, right| left.0.cmp(&right.0));

    let mut serialized = BTreeMap::from([(0, AIR_BLOCK_NAME.to_owned())]);
    let mut ids = HashMap::from([(BlockKey::AIR, 0)]);
    for (offset, (name, key)) in names.into_iter().enumerate() {
        let id = (offset + 1) as u32;
        serialized.insert(id, name);
        ids.insert(key, id);
    }
    (serialized, ids)
}

fn parse_json<T: serde::de::DeserializeOwned>(
    entries: &BTreeMap<String, Vec<u8>>,
    path: &str,
) -> GemapV3Result<T> {
    let data = entries
        .get(path)
        .ok_or_else(|| GemapV3Error::MissingEntry(path.to_owned()))?;
    serde_json::from_slice(data).map_err(|source| GemapV3Error::Json {
        path: path.to_owned(),
        source,
    })
}

fn json_bytes<T: serde::Serialize>(path: &str, value: &T) -> GemapV3Result<Vec<u8>> {
    let mut bytes = serde_json::to_vec_pretty(value).map_err(|source| GemapV3Error::Json {
        path: path.to_owned(),
        source,
    })?;
    bytes.push(b'\n');
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;
    use crate::voxel::VoxelCoord;

    #[test]
    fn empty_world_round_trips() {
        let world = VoxelWorld::new("Empty");
        let bytes = encode_world(&world).unwrap();
        assert!(bytes.starts_with(b"PK"));
        let decoded = decode_world(&bytes, ArchiveLimits::default()).unwrap();
        assert_eq!(decoded.name, "Empty");
        assert!(decoded.is_empty());
        assert_eq!(decoded.registry().len(), 1);
    }

    #[test]
    fn optional_metadata_survives_explicit_document_round_trip() {
        let world = VoxelWorld::new("Metadata");
        let metadata = BTreeMap::from([(
            "migration".to_owned(),
            serde_json::json!({"sourceFormat":"gemap-v2","mode":"flatten"}),
        )]);
        let bytes = encode_world_with_metadata(&world, Some(metadata.clone())).unwrap();
        let decoded = decode_world_with_metadata(&bytes, ArchiveLimits::default()).unwrap();
        assert_eq!(decoded.metadata, Some(metadata));
    }

    #[test]
    fn sparse_negative_world_round_trips_semantically() {
        let mut world = VoxelWorld::new("Round trip");
        let wall = world.intern_block("glyphweave:wall").unwrap();
        let unknown = world.intern_block("future-mod:blue/crystal").unwrap();
        let expected = [
            (VoxelCoord::new(0, 0, 0), wall),
            (VoxelCoord::new(-1, -1, -1), unknown),
            (VoxelCoord::new(-17, -513, 512), wall),
            (VoxelCoord::new(31, 900, -900), unknown),
        ];
        for (coord, block) in expected {
            world.set(coord, block).unwrap();
        }

        let first = encode_world(&world).unwrap();
        let decoded = decode_world(&first, ArchiveLimits::default()).unwrap();
        assert_eq!(decoded.name, world.name);
        for (coord, original_block) in expected {
            let original_name = world.registry().name(original_block).unwrap();
            let decoded_name = decoded.registry().name(decoded.get(coord)).unwrap();
            assert_eq!(decoded_name, original_name, "voxel at {coord:?}");
        }
        assert_eq!(decoded.len(), expected.len());
        assert_eq!(encode_world(&decoded).unwrap(), first);
    }

    #[test]
    fn identical_sections_deduplicate_inside_region() {
        let mut world = VoxelWorld::new("Dedup");
        let wall = world.intern_block("glyphweave:wall").unwrap();
        world.set(VoxelCoord::new(0, 0, 0), wall).unwrap();
        world.set(VoxelCoord::new(0, 16, 0), wall).unwrap();

        let bytes = encode_world(&world).unwrap();
        let entries = read_entries(Cursor::new(bytes), ArchiveLimits::default()).unwrap();
        let region: RegionManifest =
            serde_json::from_slice(&entries["regions/0.0/region.json"]).unwrap();
        assert_eq!(region.sections.len(), 2);
        assert_eq!(region.chunks.len(), 1);
        assert_eq!(
            entries.keys().filter(|name| name.ends_with(".bin")).count(),
            1
        );
    }

    #[test]
    fn canonical_writer_omits_unused_registry_entries() {
        let mut world = VoxelWorld::new("Registry compaction");
        let used = world.intern_block("glyphweave:wall").unwrap();
        world.intern_block("future-mod:unused").unwrap();
        world.set(VoxelCoord::new(0, 0, 0), used).unwrap();

        let bytes = encode_world(&world).unwrap();
        let entries = read_entries(Cursor::new(bytes), ArchiveLimits::default()).unwrap();
        let manifest: Manifest = serde_json::from_slice(&entries["manifest.json"]).unwrap();
        assert_eq!(
            manifest
                .block_registry
                .values()
                .cloned()
                .collect::<Vec<_>>(),
            vec![AIR_BLOCK_NAME.to_owned(), "glyphweave:wall".to_owned()]
        );
    }

    #[test]
    fn corruption_is_not_silently_interpreted_as_air() {
        let mut world = VoxelWorld::new("Corrupt");
        let wall = world.intern_block("glyphweave:wall").unwrap();
        world.set(VoxelCoord::new(0, 0, 0), wall).unwrap();
        let encoded = encode_world(&world).unwrap();
        let mut entries = read_entries(Cursor::new(encoded), ArchiveLimits::default()).unwrap();
        let bin_name = entries
            .keys()
            .find(|name| name.ends_with(".bin"))
            .unwrap()
            .clone();
        entries.get_mut(&bin_name).unwrap()[0] ^= 1;
        let corrupt = write_entries(Cursor::new(Vec::new()), &entries)
            .unwrap()
            .into_inner();
        assert!(matches!(
            decode_world(&corrupt, ArchiveLimits::default()),
            Err(GemapV3Error::ChunkHashMismatch { .. })
        ));
    }

    fn fixture_root() -> PathBuf {
        let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        path.pop();
        path.pop();
        path.pop();
        path.push("fixtures/gemap");
        path
    }

    fn repo_root() -> PathBuf {
        let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        path.pop();
        path.pop();
        path.pop();
        path
    }

    #[test]
    fn shared_valid_fixture_corpus_decodes_exact_logical_voxels() {
        let root = fixture_root();
        let expectations: serde_json::Value =
            serde_json::from_slice(&std::fs::read(root.join("expectations.json")).unwrap())
                .unwrap();
        for (case, expected) in expectations["v3Valid"].as_object().unwrap() {
            let archive = expected["archive"].as_str().unwrap();
            let bytes = std::fs::read(root.join(archive)).unwrap();
            let world = decode_world(&bytes, ArchiveLimits::default())
                .unwrap_or_else(|error| panic!("fixture {case} failed: {error}"));

            let mut actual: Vec<_> = world
                .iter_voxels()
                .map(|(coord, block)| {
                    (
                        coord.z,
                        coord.x,
                        coord.y,
                        world.registry().name(block).unwrap().to_owned(),
                    )
                })
                .collect();
            actual.sort();
            let mut logical: Vec<_> = expected["logicalVoxels"]
                .as_array()
                .unwrap()
                .iter()
                .map(|voxel| {
                    let coord = voxel["coord"].as_array().unwrap();
                    (
                        coord[0].as_i64().unwrap() as i32,
                        coord[1].as_i64().unwrap() as i32,
                        coord[2].as_i64().unwrap() as i32,
                        voxel["block"].as_str().unwrap().to_owned(),
                    )
                })
                .collect();
            logical.sort();
            assert_eq!(actual, logical, "logical voxels differ for {case}");
        }
    }

    #[test]
    fn repository_examples_are_v3_archives() {
        let examples = [
            (
                "aethra-mega.gemap",
                "South China Sea Archipelago",
                230_400,
                (0, 0, 0, 0, 639, 359),
            ),
            (
                "badlands-wadi.gemap",
                "灼沙干河",
                129_600,
                (0, 0, 0, 0, 479, 269),
            ),
            (
                "dragon_island.gemap",
                "Dragon Archipelago",
                110_520,
                (0, 0, 0, 0, 359, 306),
            ),
        ];
        let root = repo_root().join("examples");
        for (file_name, expected_name, expected_voxels, expected_bounds) in examples {
            let path = root.join(file_name);
            let bytes = std::fs::read(&path).unwrap();
            assert!(
                bytes.starts_with(b"PK"),
                "{} must be a v3 ZIP archive",
                path.display()
            );
            let world = decode_world(&bytes, ArchiveLimits::default())
                .unwrap_or_else(|error| panic!("{} failed: {error}", path.display()));
            assert!(
                world.name.contains(expected_name),
                "{} has unexpected world name {}",
                path.display(),
                world.name
            );
            assert_eq!(world.len(), expected_voxels, "{}", path.display());
            let bounds = world.bounds().expect("example must not be empty");
            assert_eq!(
                (
                    bounds.min.z,
                    bounds.min.x,
                    bounds.min.y,
                    bounds.max.z,
                    bounds.max.x,
                    bounds.max.y
                ),
                expected_bounds,
                "{}",
                path.display()
            );
        }
    }

    #[test]
    fn shared_invalid_fixture_corpus_hits_required_error_boundaries() {
        let root = fixture_root().join("v3-invalid");
        let decode = |name: &str, limits: ArchiveLimits| {
            let bytes = std::fs::read(root.join(name)).unwrap();
            match decode_world(&bytes, limits) {
                Err(error) => error,
                Ok(_) => panic!("invalid fixture {name} was unexpectedly accepted"),
            }
        };

        assert!(matches!(
            decode("bad-path.gemap", ArchiveLimits::default()),
            GemapV3Error::Archive(ArchiveError::InvalidEntryName(_))
                | GemapV3Error::Model {
                    source: ModelError::InvalidRegionPath { .. },
                    ..
                }
        ));
        assert!(matches!(
            decode("duplicate-entry.gemap", ArchiveLimits::default()),
            GemapV3Error::Archive(ArchiveError::DuplicateEntry(_))
        ));
        assert!(matches!(
            decode("corrupt-hash.gemap", ArchiveLimits::default()),
            GemapV3Error::ChunkHashMismatch { .. }
        ));
        assert!(matches!(
            decode("truncated-binary.gemap", ArchiveLimits::default()),
            GemapV3Error::Chunk {
                source: StorageError::InvalidPackedLength { .. },
                ..
            }
        ));
        let strict = ArchiveLimits {
            max_archive_size: 2 * 1024 * 1024,
            max_entries: 128,
            max_entry_size: 256 * 1024,
            max_total_size: 512 * 1024,
            max_compression_ratio: 100,
        };
        assert!(matches!(
            decode("zip-bomb-limit.gemap", strict),
            GemapV3Error::Archive(
                ArchiveError::EntryTooLarge { .. }
                    | ArchiveError::ArchiveTooLarge { .. }
                    | ArchiveError::SuspiciousCompressionRatio { .. }
            )
        ));
    }
}
