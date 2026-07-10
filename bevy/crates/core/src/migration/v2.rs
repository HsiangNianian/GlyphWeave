use std::collections::{BTreeMap, BTreeSet, HashSet};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;

use crate::voxel::{RegistryError, VoxelCoord, VoxelWorld, VoxelWorldError};

const DEFAULT_WORLD_NAME: &str = "Untitled";
const DEFAULT_LAYER_ID: &str = "layer-1";
const DEFAULT_LAYER_NAME: &str = "Layer 1";

/// A legacy v1/v2 layer descriptor in stored bottom-to-top order.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct LegacyLayer {
    pub id: String,
    pub name: String,
    #[serde(default = "default_true")]
    pub visible: bool,
    #[serde(default)]
    pub locked: bool,
}

fn default_true() -> bool {
    true
}

/// The import-only JSON shape used by legacy v1 and v2 maps.
///
/// `Option<String>` is deliberate: legacy `null` cells must survive parsing so
/// that conversion can distinguish them from malformed tile values.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyGemap {
    #[serde(default)]
    pub version: Option<u32>,
    #[serde(default)]
    pub world_name: Option<String>,
    #[serde(default)]
    pub tile_size: Option<u32>,
    #[serde(default)]
    pub theme_id: Option<String>,
    #[serde(default)]
    pub tiles: BTreeMap<String, Option<String>>,
    /// Presence makes this field authoritative, even when `tiles` also exists.
    #[serde(default)]
    pub layer_tiles: Option<BTreeMap<String, BTreeMap<String, Option<String>>>>,
    #[serde(default)]
    pub layers: Vec<LegacyLayer>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum MigrationMode {
    Flatten,
    PreserveLayers,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkippedHiddenLayer {
    pub id: String,
    pub name: String,
    pub tile_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationReport {
    pub mode: MigrationMode,
    pub output_voxel_count: usize,
    pub overwritten_tile_count: usize,
    pub skipped_hidden_layers: Vec<SkippedHiddenLayer>,
    pub source_version: u32,
    pub unknown_tile_ids: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct MigrationResult {
    pub world: VoxelWorld,
    /// Populated for `preserve-layers`; empty for `flatten`.
    pub layer_z: BTreeMap<String, i32>,
    pub report: MigrationReport,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MappedLegacyTile {
    Air,
    Known(&'static str),
    Unknown(String),
}

#[derive(Debug, Error)]
pub enum MigrationError {
    #[error("invalid legacy JSON: {0}")]
    Json(#[from] serde_json::Error),
    #[error("unsupported legacy .gemap version: {0}")]
    UnsupportedVersion(u32),
    #[error("legacy JSON has neither tiles nor layerTiles")]
    MissingTileData,
    #[error("duplicate legacy layer id: {0}")]
    DuplicateLayerId(String),
    #[error("invalid legacy coordinate key '{0}' (expected \"x,y\" with i32 parts)")]
    InvalidCoordKey(String),
    #[error("too many legacy layers to assign an i32 z coordinate")]
    TooManyLayers,
    #[error(transparent)]
    Registry(#[from] RegistryError),
    #[error(transparent)]
    World(#[from] VoxelWorldError),
}

/// Parses a legacy JSON document without discarding null cells or unknown tile
/// identifiers. Missing `version` is v1; explicit versions must be 1 or 2.
pub fn parse_legacy_json(json: &[u8]) -> Result<LegacyGemap, MigrationError> {
    let raw: serde_json::Value = serde_json::from_slice(json)?;
    let object = raw.as_object().ok_or(MigrationError::MissingTileData)?;
    if !object.contains_key("tiles") && !object.contains_key("layerTiles") {
        return Err(MigrationError::MissingTileData);
    }

    let legacy: LegacyGemap = serde_json::from_value(raw)?;
    validate_source_version(&legacy)?;
    validate_unique_layer_ids(&legacy.layers)?;
    Ok(legacy)
}

pub fn migrate_legacy_json(
    json: &[u8],
    mode: MigrationMode,
) -> Result<MigrationResult, MigrationError> {
    migrate_legacy(parse_legacy_json(json)?, mode)
}

/// Converts the legacy layer model into the v3 sparse voxel model.
///
/// This function is pure with respect to external state and never prints
/// warnings. All ambiguity or loss is represented by [`MigrationReport`].
pub fn migrate_legacy(
    legacy: LegacyGemap,
    mode: MigrationMode,
) -> Result<MigrationResult, MigrationError> {
    let source_version = validate_source_version(&legacy)?;
    validate_unique_layer_ids(&legacy.layers)?;

    let effective_layers = effective_layers(&legacy);
    let mut unknown_tile_ids = BTreeSet::new();
    let mut raw_voxels = BTreeMap::<VoxelCoord, String>::new();
    let mut overwritten_tile_count = 0;
    let mut skipped_hidden_layers = Vec::new();
    let mut layer_z = BTreeMap::new();

    match mode {
        MigrationMode::Flatten => {
            for layer in &effective_layers {
                let tiles = tiles_for_layer(&legacy, &layer.id);
                if !layer.visible {
                    let tile_count = occupied_tile_count(tiles);
                    if tile_count > 0 {
                        skipped_hidden_layers.push(SkippedHiddenLayer {
                            id: layer.id.clone(),
                            name: layer.name.clone(),
                            tile_count,
                        });
                    }
                    continue;
                }

                for (key, tile_id) in tiles {
                    let Some(tile_id) = non_air_tile_id(tile_id) else {
                        continue;
                    };
                    let (x, y) = parse_coord_key(key)?;
                    let coord = VoxelCoord::new(0, x, y);
                    if raw_voxels.contains_key(&coord) {
                        overwritten_tile_count += 1;
                    }
                    if matches!(legacy_tile_mapping(tile_id), MappedLegacyTile::Unknown(_)) {
                        unknown_tile_ids.insert(tile_id.to_owned());
                    }
                    raw_voxels.insert(coord, tile_id.to_owned());
                }
            }
        }
        MigrationMode::PreserveLayers => {
            for (index, layer) in effective_layers.iter().enumerate() {
                let z = i32::try_from(index).map_err(|_| MigrationError::TooManyLayers)?;
                layer_z.insert(layer.id.clone(), z);
                for (key, tile_id) in tiles_for_layer(&legacy, &layer.id) {
                    let Some(tile_id) = non_air_tile_id(tile_id) else {
                        continue;
                    };
                    let (x, y) = parse_coord_key(key)?;
                    if matches!(legacy_tile_mapping(tile_id), MappedLegacyTile::Unknown(_)) {
                        unknown_tile_ids.insert(tile_id.to_owned());
                    }
                    raw_voxels.insert(VoxelCoord::new(z, x, y), tile_id.to_owned());
                }
            }
        }
    }

    let unknown_mappings = collision_safe_unknown_mappings(&unknown_tile_ids);
    let mut world = VoxelWorld::new(legacy.world_name.as_deref().unwrap_or(DEFAULT_WORLD_NAME));
    for (coord, tile_id) in raw_voxels {
        set_mapped_tile(&mut world, coord, &tile_id, &unknown_mappings)?;
    }

    let report = MigrationReport {
        mode,
        output_voxel_count: world.len(),
        overwritten_tile_count,
        skipped_hidden_layers,
        source_version,
        unknown_tile_ids: unknown_tile_ids.into_iter().collect(),
    };
    Ok(MigrationResult {
        world,
        layer_z,
        report,
    })
}

/// The checked legacy tile mapping. Known identities are enumerated
/// explicitly; only unknown IDs use normalization into the `legacy` namespace.
pub fn legacy_tile_mapping(id: &str) -> MappedLegacyTile {
    match id {
        "void" => MappedLegacyTile::Air,
        "wall" => MappedLegacyTile::Known("glyphweave:wall"),
        "floor" => MappedLegacyTile::Known("glyphweave:floor"),
        "floorAlt" => MappedLegacyTile::Known("glyphweave:floor-alt"),
        "door" => MappedLegacyTile::Known("glyphweave:door"),
        "doorOpen" => MappedLegacyTile::Known("glyphweave:door-open"),
        "water" => MappedLegacyTile::Known("glyphweave:water"),
        "deepWater" => MappedLegacyTile::Known("glyphweave:deep-water"),
        "lava" => MappedLegacyTile::Known("glyphweave:lava"),
        "tree" => MappedLegacyTile::Known("glyphweave:tree"),
        "grass" => MappedLegacyTile::Known("glyphweave:grass"),
        "bridge" => MappedLegacyTile::Known("glyphweave:bridge"),
        "stairsDown" => MappedLegacyTile::Known("glyphweave:stairs-down"),
        "stairsUp" => MappedLegacyTile::Known("glyphweave:stairs-up"),
        "altar" => MappedLegacyTile::Known("glyphweave:altar"),
        "fountain" => MappedLegacyTile::Known("glyphweave:fountain"),
        "grave" => MappedLegacyTile::Known("glyphweave:grave"),
        "trap" => MappedLegacyTile::Known("glyphweave:trap"),
        "pillar" => MappedLegacyTile::Known("glyphweave:pillar"),
        "treasure" => MappedLegacyTile::Known("glyphweave:treasure"),
        "shop" => MappedLegacyTile::Known("glyphweave:shop"),
        "table" => MappedLegacyTile::Known("glyphweave:table"),
        "throne" => MappedLegacyTile::Known("glyphweave:throne"),
        "cage" => MappedLegacyTile::Known("glyphweave:cage"),
        "blood" => MappedLegacyTile::Known("glyphweave:blood"),
        "bar" => MappedLegacyTile::Known("glyphweave:bar"),
        unknown => MappedLegacyTile::Unknown(format!("legacy:{}", normalize_legacy_id(unknown))),
    }
}

fn validate_source_version(legacy: &LegacyGemap) -> Result<u32, MigrationError> {
    let version = legacy.version.unwrap_or(1);
    match version {
        1 | 2 => Ok(version),
        other => Err(MigrationError::UnsupportedVersion(other)),
    }
}

fn validate_unique_layer_ids(layers: &[LegacyLayer]) -> Result<(), MigrationError> {
    let mut ids = HashSet::new();
    for layer in layers {
        if !ids.insert(layer.id.as_str()) {
            return Err(MigrationError::DuplicateLayerId(layer.id.clone()));
        }
    }
    Ok(())
}

fn effective_layers(legacy: &LegacyGemap) -> Vec<LegacyLayer> {
    if let Some(layer_tiles) = &legacy.layer_tiles {
        let mut layers = legacy.layers.clone();
        let declared: HashSet<String> = layers.iter().map(|layer| layer.id.clone()).collect();
        for id in layer_tiles.keys() {
            if !declared.contains(id) {
                layers.push(LegacyLayer {
                    id: id.clone(),
                    name: id.clone(),
                    visible: true,
                    locked: false,
                });
            }
        }
        return layers;
    }

    if legacy.layers.is_empty() {
        vec![LegacyLayer {
            id: DEFAULT_LAYER_ID.to_owned(),
            name: DEFAULT_LAYER_NAME.to_owned(),
            visible: true,
            locked: false,
        }]
    } else {
        legacy.layers.clone()
    }
}

fn tiles_for_layer<'a>(
    legacy: &'a LegacyGemap,
    layer_id: &str,
) -> &'a BTreeMap<String, Option<String>> {
    if let Some(layer_tiles) = &legacy.layer_tiles {
        layer_tiles.get(layer_id).unwrap_or_else(|| empty_tiles())
    } else if legacy
        .layers
        .first()
        .map_or(layer_id == DEFAULT_LAYER_ID, |layer| layer.id == layer_id)
    {
        &legacy.tiles
    } else {
        empty_tiles()
    }
}

fn empty_tiles() -> &'static BTreeMap<String, Option<String>> {
    static EMPTY: std::sync::OnceLock<BTreeMap<String, Option<String>>> =
        std::sync::OnceLock::new();
    EMPTY.get_or_init(BTreeMap::new)
}

fn occupied_tile_count(tiles: &BTreeMap<String, Option<String>>) -> usize {
    tiles
        .values()
        .filter(|tile_id| non_air_tile_id(tile_id).is_some())
        .count()
}

fn non_air_tile_id(tile_id: &Option<String>) -> Option<&str> {
    tile_id.as_deref().filter(|id| *id != "void")
}

fn set_mapped_tile(
    world: &mut VoxelWorld,
    coord: VoxelCoord,
    tile_id: &str,
    unknown_mappings: &BTreeMap<String, String>,
) -> Result<(), MigrationError> {
    let block_name = match legacy_tile_mapping(tile_id) {
        MappedLegacyTile::Air => return Ok(()),
        MappedLegacyTile::Known(name) => name.to_owned(),
        MappedLegacyTile::Unknown(name) => unknown_mappings.get(tile_id).cloned().unwrap_or(name),
    };
    let block = world.intern_block(block_name)?;
    world.set(coord, block)?;
    Ok(())
}

fn parse_coord_key(key: &str) -> Result<(i32, i32), MigrationError> {
    let (x, y) = key
        .split_once(',')
        .ok_or_else(|| MigrationError::InvalidCoordKey(key.to_owned()))?;
    if y.contains(',') {
        return Err(MigrationError::InvalidCoordKey(key.to_owned()));
    }
    let x = x
        .trim()
        .parse()
        .map_err(|_| MigrationError::InvalidCoordKey(key.to_owned()))?;
    let y = y
        .trim()
        .parse()
        .map_err(|_| MigrationError::InvalidCoordKey(key.to_owned()))?;
    Ok((x, y))
}

fn normalize_legacy_id(id: &str) -> String {
    let chars: Vec<char> = id.chars().collect();
    let mut normalized = String::new();
    let mut pending_separator = false;

    for (index, character) in chars.iter().copied().enumerate() {
        if character.is_ascii_alphanumeric() {
            let previous = index.checked_sub(1).and_then(|value| chars.get(value));
            let next = chars.get(index + 1);
            let word_boundary = character.is_ascii_uppercase()
                && previous.is_some_and(|value| {
                    value.is_ascii_lowercase()
                        || value.is_ascii_digit()
                        || (value.is_ascii_uppercase()
                            && next.is_some_and(|next| next.is_ascii_lowercase()))
                });
            if (pending_separator || word_boundary)
                && !normalized.is_empty()
                && !normalized.ends_with('-')
            {
                normalized.push('-');
            }
            normalized.push(character.to_ascii_lowercase());
            pending_separator = false;
        } else {
            pending_separator = !normalized.is_empty();
        }
    }

    while normalized.ends_with('-') {
        normalized.pop();
    }
    if normalized.is_empty() {
        format!("unknown-{}", sha256_prefix(id))
    } else {
        normalized
    }
}

fn sha256_prefix(value: &str) -> String {
    let digest = Sha256::digest(value.as_bytes());
    digest[..4]
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn collision_safe_unknown_mappings(tile_ids: &BTreeSet<String>) -> BTreeMap<String, String> {
    let mut by_base = BTreeMap::<String, Vec<&str>>::new();
    for tile_id in tile_ids {
        by_base
            .entry(normalize_legacy_id(tile_id))
            .or_default()
            .push(tile_id);
    }

    let mut mappings = BTreeMap::new();
    for (base, ids) in by_base {
        let collides = ids.len() > 1;
        for id in ids {
            let suffix = if collides {
                format!("-{}", sha256_prefix(id))
            } else {
                String::new()
            };
            mappings.insert(id.to_owned(), format!("legacy:{base}{suffix}"));
        }
    }
    mappings
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use serde_json::{Value, json};

    use super::*;

    fn fixture_root() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../fixtures/gemap")
    }

    fn logical_voxels(world: &VoxelWorld) -> Value {
        let mut voxels: Vec<_> = world
            .iter_voxels()
            .map(|(coord, block)| {
                (
                    coord,
                    world
                        .registry()
                        .name(block)
                        .expect("world block belongs to its registry")
                        .to_owned(),
                )
            })
            .collect();
        voxels.sort_by_key(|(coord, _)| *coord);
        Value::Array(
            voxels
                .into_iter()
                .map(|(coord, block)| {
                    json!({
                        "coord": [coord.z, coord.x, coord.y],
                        "block": block,
                    })
                })
                .collect(),
        )
    }

    #[test]
    fn shared_legacy_fixtures_match_exact_expectations() {
        let root = fixture_root();
        let expectations: Value = serde_json::from_slice(
            &std::fs::read(root.join("expectations.json")).expect("read expectations"),
        )
        .expect("parse expectations");

        for (case_id, case) in expectations["legacy"]
            .as_object()
            .expect("legacy expectation object")
        {
            let input = std::fs::read(root.join(case["input"].as_str().expect("input path")))
                .expect("read legacy fixture");
            for (mode_name, mode) in [
                ("flatten", MigrationMode::Flatten),
                ("preserve-layers", MigrationMode::PreserveLayers),
            ] {
                let expected = &case["migrations"][mode_name];
                let result = migrate_legacy_json(&input, mode).unwrap_or_else(|error| {
                    panic!("{case_id}/{mode_name} migration failed: {error}")
                });
                assert_eq!(
                    logical_voxels(&result.world),
                    expected["logicalVoxels"],
                    "{case_id}/{mode_name} logical voxels"
                );
                assert_eq!(
                    serde_json::to_value(&result.report).expect("serialize report"),
                    expected["report"],
                    "{case_id}/{mode_name} report"
                );
                if mode == MigrationMode::PreserveLayers {
                    assert_eq!(
                        serde_json::to_value(&result.layer_z).expect("serialize layer z"),
                        expected["layerZ"],
                        "{case_id}/{mode_name} layer z"
                    );
                } else {
                    assert!(result.layer_z.is_empty());
                }
            }
        }
    }

    #[test]
    fn explicit_mapping_covers_every_legacy_tile_kind() {
        let expected = [
            ("void", MappedLegacyTile::Air),
            ("wall", MappedLegacyTile::Known("glyphweave:wall")),
            ("floor", MappedLegacyTile::Known("glyphweave:floor")),
            ("floorAlt", MappedLegacyTile::Known("glyphweave:floor-alt")),
            ("door", MappedLegacyTile::Known("glyphweave:door")),
            ("doorOpen", MappedLegacyTile::Known("glyphweave:door-open")),
            ("water", MappedLegacyTile::Known("glyphweave:water")),
            (
                "deepWater",
                MappedLegacyTile::Known("glyphweave:deep-water"),
            ),
            ("lava", MappedLegacyTile::Known("glyphweave:lava")),
            ("tree", MappedLegacyTile::Known("glyphweave:tree")),
            ("grass", MappedLegacyTile::Known("glyphweave:grass")),
            ("bridge", MappedLegacyTile::Known("glyphweave:bridge")),
            (
                "stairsDown",
                MappedLegacyTile::Known("glyphweave:stairs-down"),
            ),
            ("stairsUp", MappedLegacyTile::Known("glyphweave:stairs-up")),
            ("altar", MappedLegacyTile::Known("glyphweave:altar")),
            ("fountain", MappedLegacyTile::Known("glyphweave:fountain")),
            ("grave", MappedLegacyTile::Known("glyphweave:grave")),
            ("trap", MappedLegacyTile::Known("glyphweave:trap")),
            ("pillar", MappedLegacyTile::Known("glyphweave:pillar")),
            ("treasure", MappedLegacyTile::Known("glyphweave:treasure")),
            ("shop", MappedLegacyTile::Known("glyphweave:shop")),
            ("table", MappedLegacyTile::Known("glyphweave:table")),
            ("throne", MappedLegacyTile::Known("glyphweave:throne")),
            ("cage", MappedLegacyTile::Known("glyphweave:cage")),
            ("blood", MappedLegacyTile::Known("glyphweave:blood")),
            ("bar", MappedLegacyTile::Known("glyphweave:bar")),
        ];
        for (legacy, mapped) in expected {
            assert_eq!(legacy_tile_mapping(legacy), mapped);
        }
    }

    #[test]
    fn unknown_camel_case_ids_are_stable_namespaced_blocks() {
        assert_eq!(
            legacy_tile_mapping("mysteryTile"),
            MappedLegacyTile::Unknown("legacy:mystery-tile".to_owned())
        );
        assert_eq!(
            legacy_tile_mapping("HTTPServer2D"),
            MappedLegacyTile::Unknown("legacy:http-server2-d".to_owned())
        );
        assert_eq!(
            legacy_tile_mapping("✨"),
            MappedLegacyTile::Unknown("legacy:unknown-c0cc703f".to_owned())
        );
    }

    #[test]
    fn colliding_unknown_ids_receive_stable_hash_suffixes() {
        let result = migrate_legacy_json(
            br#"{"tiles":{"0,0":"a b","1,0":"a-b"}}"#,
            MigrationMode::Flatten,
        )
        .unwrap();
        let mut blocks: Vec<_> = result
            .world
            .iter_voxels()
            .map(|(_, block)| result.world.registry().name(block).unwrap().to_owned())
            .collect();
        blocks.sort();
        assert_eq!(
            blocks,
            vec![
                "legacy:a-b-c8687a08".to_owned(),
                "legacy:a-b-d44362d6".to_owned()
            ]
        );
    }

    #[test]
    fn layer_tiles_presence_is_authoritative_and_null_does_not_erase() {
        let json = br#"{
            "version": 2,
            "worldName": "Priority",
            "tiles": {"0,0": "lava"},
            "layers": [
                {"id":"bottom","name":"Bottom"},
                {"id":"top","name":"Top"}
            ],
            "layerTiles": {
                "bottom": {"0,0":"floor", "1,0":"wall"},
                "top": {"0,0":null, "1,0":"void"}
            }
        }"#;
        let result = migrate_legacy_json(json, MigrationMode::Flatten).unwrap();
        let floor = result.world.registry().key("glyphweave:floor").unwrap();
        let wall = result.world.registry().key("glyphweave:wall").unwrap();
        assert_eq!(result.world.get(VoxelCoord::new(0, 0, 0)), floor);
        assert_eq!(result.world.get(VoxelCoord::new(0, 1, 0)), wall);
        assert!(result.world.registry().key("glyphweave:lava").is_none());
        assert_eq!(result.report.overwritten_tile_count, 0);
    }

    #[test]
    fn rejects_non_legacy_and_unsupported_documents() {
        assert!(matches!(
            parse_legacy_json(br#"{"worldName":"No tiles"}"#),
            Err(MigrationError::MissingTileData)
        ));
        assert!(matches!(
            parse_legacy_json(br#"{"version":3,"tiles":{}}"#),
            Err(MigrationError::UnsupportedVersion(3))
        ));
        assert!(matches!(
            migrate_legacy_json(
                br#"{"tiles":{"not-a-coordinate":"wall"}}"#,
                MigrationMode::Flatten
            ),
            Err(MigrationError::InvalidCoordKey(_))
        ));
    }
}
