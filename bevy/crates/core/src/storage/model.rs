//! JSON models and semantic validation for `.gemap` v3 manifests.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use thiserror::Error;

use super::archive::is_valid_entry_name;
use super::bitpack::minimal_bits;

pub const MAP_FORMAT: &str = "glyphweave-map";
pub const MAP_VERSION: u32 = 3;
pub const REGION_FORMAT: &str = "glyphweave-region";
pub const REGION_VERSION: u32 = 1;
pub const AIR_BLOCK_NAME: &str = "glyphweave:air";
pub const MIN_CHUNK_COORD: i32 = -134_217_728;
pub const MAX_CHUNK_COORD: i32 = 134_217_727;
pub const MIN_REGION_COORD: i32 = -4_194_304;
pub const MAX_REGION_COORD: i32 = 4_194_303;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub format: String,
    pub version: u32,
    pub world: WorldMetadata,
    pub axis_order: String,
    pub chunk_shape: (u32, u32, u32),
    pub region_shape: (String, u32, u32),
    #[serde(with = "uint32_key_map")]
    pub block_registry: BTreeMap<u32, String>,
    pub regions: BTreeMap<String, String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<BTreeMap<String, serde_json::Value>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WorldMetadata {
    pub name: String,
}

impl Manifest {
    pub fn new(name: impl Into<String>, block_registry: BTreeMap<u32, String>) -> Self {
        Self {
            format: MAP_FORMAT.to_owned(),
            version: MAP_VERSION,
            world: WorldMetadata { name: name.into() },
            axis_order: "z,x,y".to_owned(),
            chunk_shape: (16, 16, 16),
            region_shape: ("infinite".to_owned(), 32, 32),
            block_registry,
            regions: BTreeMap::new(),
            metadata: None,
        }
    }

    pub fn validate(&self) -> ModelResult<()> {
        if self.format != MAP_FORMAT {
            return Err(ModelError::UnexpectedFormat {
                expected: MAP_FORMAT,
                actual: self.format.clone(),
            });
        }
        if self.version != MAP_VERSION {
            return Err(ModelError::UnsupportedVersion {
                kind: "map",
                actual: self.version,
            });
        }
        if self.axis_order != "z,x,y" {
            return Err(ModelError::InvalidAxisOrder(self.axis_order.clone()));
        }
        if self.chunk_shape != (16, 16, 16) {
            return Err(ModelError::InvalidChunkShape(self.chunk_shape));
        }
        if self.region_shape != ("infinite".to_owned(), 32, 32) {
            return Err(ModelError::InvalidRegionShape(self.region_shape.clone()));
        }
        if self.world.name.is_empty() {
            return Err(ModelError::EmptyWorldName);
        }
        match self.block_registry.get(&0) {
            Some(name) if name == AIR_BLOCK_NAME => {}
            _ => return Err(ModelError::MissingAirBlock),
        }
        for (&id, name) in &self.block_registry {
            if !is_valid_block_name(name) {
                return Err(ModelError::InvalidBlockName {
                    id,
                    name: name.clone(),
                });
            }
        }
        for (key, path) in &self.regions {
            let (rx, ry) = parse_region_key(key)?;
            validate_region_coord((rx, ry))?;
            let expected = format!("regions/{rx}.{ry}/region.json");
            if !is_valid_entry_name(path) || *path != expected {
                return Err(ModelError::InvalidRegionPath {
                    key: key.clone(),
                    expected,
                    actual: path.clone(),
                });
            }
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RegionManifest {
    pub format: String,
    pub version: u32,
    pub region: (i32, i32),
    pub sections: BTreeMap<String, String>,
    pub chunks: BTreeMap<String, ChunkRecord>,
}

impl RegionManifest {
    pub fn new(region: (i32, i32)) -> Self {
        Self {
            format: REGION_FORMAT.to_owned(),
            version: REGION_VERSION,
            region,
            sections: BTreeMap::new(),
            chunks: BTreeMap::new(),
        }
    }

    pub fn validate(&self) -> ModelResult<()> {
        if self.format != REGION_FORMAT {
            return Err(ModelError::UnexpectedFormat {
                expected: REGION_FORMAT,
                actual: self.format.clone(),
            });
        }
        if self.version != REGION_VERSION {
            return Err(ModelError::UnsupportedVersion {
                kind: "region",
                actual: self.version,
            });
        }
        validate_region_coord(self.region)?;

        for (chunk_id, record) in &self.chunks {
            if !is_chunk_id(chunk_id) {
                return Err(ModelError::InvalidChunkId(chunk_id.clone()));
            }
            validate_palette(chunk_id, record)?;
            let expected = format!("chunks/{chunk_id}.bin");
            if record.data != expected {
                return Err(ModelError::InvalidChunkPath {
                    chunk_id: chunk_id.clone(),
                    expected,
                    actual: record.data.clone(),
                });
            }
        }

        for (section_key, chunk_id) in &self.sections {
            parse_section_key(section_key)?;
            if !self.chunks.contains_key(chunk_id) {
                return Err(ModelError::MissingChunkRecord {
                    section: section_key.clone(),
                    chunk_id: chunk_id.clone(),
                });
            }
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChunkRecord {
    pub bits: u8,
    pub palette: Vec<u32>,
    pub data: String,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum ModelError {
    #[error("expected format {expected}, got {actual}")]
    UnexpectedFormat {
        expected: &'static str,
        actual: String,
    },
    #[error("unsupported {kind} version {actual}")]
    UnsupportedVersion { kind: &'static str, actual: u32 },
    #[error("axisOrder must be z,x,y, got {0}")]
    InvalidAxisOrder(String),
    #[error("chunkShape must be [16,16,16], got {0:?}")]
    InvalidChunkShape((u32, u32, u32)),
    #[error("regionShape must be [\"infinite\",32,32], got {0:?}")]
    InvalidRegionShape((String, u32, u32)),
    #[error("world.name must not be empty")]
    EmptyWorldName,
    #[error("block registry ID 0 must be glyphweave:air")]
    MissingAirBlock,
    #[error("block registry ID {id} has invalid name {name:?}")]
    InvalidBlockName { id: u32, name: String },
    #[error("invalid region key {0:?}; expected rx,ry signed integers")]
    InvalidRegionKey(String),
    #[error("region coordinate {0:?} cannot address i32 voxel coordinates")]
    RegionCoordinateOutOfRange((i32, i32)),
    #[error("region {key} must use path {expected:?}, got {actual:?}")]
    InvalidRegionPath {
        key: String,
        expected: String,
        actual: String,
    },
    #[error("invalid section key {0:?}; expected cz,rcx,rcy with rcx/rcy in 0..31")]
    InvalidSectionKey(String),
    #[error("section z coordinate {0} cannot address i32 voxel coordinates")]
    SectionCoordinateOutOfRange(i32),
    #[error("invalid chunk ID {0:?}; expected 64 lowercase hexadecimal characters")]
    InvalidChunkId(String),
    #[error("chunk {0} palette must be non-empty, sorted, and contain no duplicates")]
    NonCanonicalPalette(String),
    #[error("chunk {chunk_id} palette requires {expected} bits, got {actual}")]
    InvalidChunkBits {
        chunk_id: String,
        expected: u8,
        actual: u8,
    },
    #[error("chunk {chunk_id} must use path {expected:?}, got {actual:?}")]
    InvalidChunkPath {
        chunk_id: String,
        expected: String,
        actual: String,
    },
    #[error("section {section} references missing chunk {chunk_id}")]
    MissingChunkRecord { section: String, chunk_id: String },
}

pub type ModelResult<T> = std::result::Result<T, ModelError>;

pub fn parse_region_key(key: &str) -> ModelResult<(i32, i32)> {
    let mut parts = key.split(',');
    let (Some(rx), Some(ry), None) = (parts.next(), parts.next(), parts.next()) else {
        return Err(ModelError::InvalidRegionKey(key.to_owned()));
    };
    let rx = rx
        .parse()
        .map_err(|_| ModelError::InvalidRegionKey(key.to_owned()))?;
    let ry = ry
        .parse()
        .map_err(|_| ModelError::InvalidRegionKey(key.to_owned()))?;
    if format!("{rx},{ry}") != key {
        return Err(ModelError::InvalidRegionKey(key.to_owned()));
    }
    Ok((rx, ry))
}

pub fn parse_section_key(key: &str) -> ModelResult<(i32, u8, u8)> {
    let mut parts = key.split(',');
    let (Some(cz), Some(rcx), Some(rcy), None) =
        (parts.next(), parts.next(), parts.next(), parts.next())
    else {
        return Err(ModelError::InvalidSectionKey(key.to_owned()));
    };
    let cz: i32 = cz
        .parse()
        .map_err(|_| ModelError::InvalidSectionKey(key.to_owned()))?;
    let rcx: u8 = rcx
        .parse()
        .map_err(|_| ModelError::InvalidSectionKey(key.to_owned()))?;
    let rcy: u8 = rcy
        .parse()
        .map_err(|_| ModelError::InvalidSectionKey(key.to_owned()))?;
    if rcx > 31 || rcy > 31 || format!("{cz},{rcx},{rcy}") != key {
        return Err(ModelError::InvalidSectionKey(key.to_owned()));
    }
    if !(MIN_CHUNK_COORD..=MAX_CHUNK_COORD).contains(&cz) {
        return Err(ModelError::SectionCoordinateOutOfRange(cz));
    }
    Ok((cz, rcx, rcy))
}

fn validate_region_coord(coord: (i32, i32)) -> ModelResult<()> {
    if !(MIN_REGION_COORD..=MAX_REGION_COORD).contains(&coord.0)
        || !(MIN_REGION_COORD..=MAX_REGION_COORD).contains(&coord.1)
    {
        return Err(ModelError::RegionCoordinateOutOfRange(coord));
    }
    Ok(())
}

pub fn is_valid_block_name(name: &str) -> bool {
    let Some((namespace, path)) = name.split_once(':') else {
        return false;
    };
    if namespace.is_empty() || path.is_empty() || path.contains(':') {
        return false;
    }
    let valid_namespace = namespace
        .bytes()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || b"_.-".contains(&c));
    let valid_path = path
        .bytes()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || b"_./-".contains(&c));
    valid_namespace
        && valid_path
        && path
            .split('/')
            .all(|segment| !segment.is_empty() && segment != "." && segment != "..")
}

fn is_chunk_id(id: &str) -> bool {
    id.len() == 64
        && id
            .bytes()
            .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
}

fn validate_palette(chunk_id: &str, record: &ChunkRecord) -> ModelResult<()> {
    if record.palette.is_empty()
        || record.palette.len() > 4096
        || record.palette == [0]
        || record.palette.windows(2).any(|pair| pair[0] >= pair[1])
    {
        return Err(ModelError::NonCanonicalPalette(chunk_id.to_owned()));
    }
    let expected =
        minimal_bits(record.palette.len()).expect("a non-empty palette always has a minimal width");
    if record.bits != expected {
        return Err(ModelError::InvalidChunkBits {
            chunk_id: chunk_id.to_owned(),
            expected,
            actual: record.bits,
        });
    }
    Ok(())
}

mod uint32_key_map {
    use std::collections::BTreeMap;

    use serde::{Deserialize, Deserializer, Serialize, Serializer, de::Error};

    pub fn serialize<S>(value: &BTreeMap<u32, String>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        value.serialize(serializer)
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<BTreeMap<u32, String>, D::Error>
    where
        D: Deserializer<'de>,
    {
        let raw = BTreeMap::<String, String>::deserialize(deserializer)?;
        raw.into_iter()
            .map(|(key, value)| {
                let parsed: u32 = key.parse().map_err(|_| {
                    D::Error::custom(format!("invalid uint32 registry key {key:?}"))
                })?;
                if parsed.to_string() != key {
                    return Err(D::Error::custom(format!(
                        "non-canonical uint32 registry key {key:?}"
                    )));
                }
                Ok((parsed, value))
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn registry() -> BTreeMap<u32, String> {
        BTreeMap::from([
            (0, AIR_BLOCK_NAME.to_owned()),
            (1, "glyphweave:wall".to_owned()),
        ])
    }

    #[test]
    fn manifest_shape_and_round_trip() {
        let mut manifest = Manifest::new("Tiny", registry());
        manifest
            .regions
            .insert("-1,0".to_owned(), "regions/-1.0/region.json".to_owned());
        manifest.validate().unwrap();

        let json = serde_json::to_string_pretty(&manifest).unwrap();
        assert!(json.contains("\"axisOrder\": \"z,x,y\""));
        assert!(json.contains("\"chunkShape\": ["));
        let decoded: Manifest = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded, manifest);
    }

    #[test]
    fn air_and_namespaced_names_are_enforced() {
        let mut manifest = Manifest::new("Bad", BTreeMap::new());
        assert_eq!(manifest.validate(), Err(ModelError::MissingAirBlock));
        manifest.block_registry.insert(0, AIR_BLOCK_NAME.to_owned());
        manifest.block_registry.insert(1, "UPPER:wall".to_owned());
        assert!(matches!(
            manifest.validate(),
            Err(ModelError::InvalidBlockName { id: 1, .. })
        ));
    }

    #[test]
    fn coordinate_keys_use_canonical_decimal_form() {
        assert_eq!(parse_region_key("-1,0"), Ok((-1, 0)));
        assert!(parse_region_key("-01,0").is_err());
        assert_eq!(parse_section_key("-32,0,31"), Ok((-32, 0, 31)));
        assert!(parse_section_key("0,32,0").is_err());
    }

    #[test]
    fn region_references_canonical_chunk_records() {
        let id = "a".repeat(64);
        let mut region = RegionManifest::new((0, 0));
        region.sections.insert("0,0,0".to_owned(), id.clone());
        assert!(matches!(
            region.validate(),
            Err(ModelError::MissingChunkRecord { .. })
        ));
        region.chunks.insert(
            id.clone(),
            ChunkRecord {
                bits: 1,
                palette: vec![0, 1],
                data: format!("chunks/{id}.bin"),
            },
        );
        region.validate().unwrap();
    }

    #[test]
    fn block_names_are_portable_and_namespaced() {
        for valid in [
            "glyphweave:air",
            "legacy:floor_alt",
            "mod-name:path/to.block",
        ] {
            assert!(is_valid_block_name(valid), "rejected {valid}");
        }
        for invalid in ["air", ":air", "core:", "Core:air", "core:a//b", "core:../a"] {
            assert!(!is_valid_block_name(invalid), "accepted {invalid}");
        }
    }

    #[test]
    fn registry_keys_reject_noncanonical_or_out_of_range_json() {
        let base = |registry: &str| {
            format!(
                r#"{{"format":"glyphweave-map","version":3,"world":{{"name":"x"}},"axisOrder":"z,x,y","chunkShape":[16,16,16],"regionShape":["infinite",32,32],"blockRegistry":{registry},"regions":{{}}}}"#
            )
        };
        assert!(serde_json::from_str::<Manifest>(&base(r#"{"0":"glyphweave:air"}"#)).is_ok());
        assert!(serde_json::from_str::<Manifest>(&base(r#"{"00":"glyphweave:air"}"#)).is_err());
        assert!(
            serde_json::from_str::<Manifest>(&base(r#"{"4294967296":"glyphweave:air"}"#)).is_err()
        );
    }
}
