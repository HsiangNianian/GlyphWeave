//! Gameplay state snapshots embedded in `.gemap` v3 manifest metadata.
//!
//! A run-in-progress is stored alongside the tilemap under the
//! `gameplay` metadata key, so a save keeps both the world and the live
//! simulation. Snapshots are versioned; unknown versions are ignored on
//! load so newer saves still open as plain maps in older builds.

use std::collections::{BTreeMap, HashMap, HashSet};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::gameplay::state::GameState;

/// Metadata key holding the gameplay snapshot inside the v3 manifest.
pub const GAMEPLAY_METADATA_KEY: &str = "gameplay";

const SNAPSHOT_VERSION: u32 = 1;

/// JSON has no tuple/struct map keys, so `HashMap<TileCoord, _>` and
/// `HashSet<TileCoord>` serialize through these adapters as entry lists.
pub mod coord_map {
    use super::*;
    use crate::gameplay::state::TileCoord;

    #[derive(Serialize, Deserialize)]
    struct Entry<V> {
        coord: TileCoord,
        value: V,
    }

    pub fn serialize<V: Serialize, S: serde::Serializer>(
        map: &HashMap<TileCoord, V>,
        serializer: S,
    ) -> Result<S::Ok, S::Error> {
        let mut entries: Vec<_> = map
            .iter()
            .map(|(coord, value)| Entry {
                coord: *coord,
                value,
            })
            .collect();
        entries.sort_by_key(|entry| (entry.coord.x, entry.coord.y));
        serializer.collect_seq(entries.iter().map(|entry| (entry.coord, entry.value)))
    }

    pub fn deserialize<'de, V: Deserialize<'de>, D: serde::Deserializer<'de>>(
        deserializer: D,
    ) -> Result<HashMap<TileCoord, V>, D::Error> {
        let entries = Vec::<Entry<V>>::deserialize(deserializer)?;
        Ok(entries
            .into_iter()
            .map(|entry| (entry.coord, entry.value))
            .collect())
    }
}

pub mod coord_set {
    use super::*;
    use crate::gameplay::state::TileCoord;

    pub fn serialize<S: serde::Serializer>(
        set: &HashSet<TileCoord>,
        serializer: S,
    ) -> Result<S::Ok, S::Error> {
        let mut coords: Vec<_> = set.iter().copied().collect();
        coords.sort_by_key(|coord| (coord.x, coord.y));
        serializer.collect_seq(coords)
    }

    pub fn deserialize<'de, D: serde::Deserializer<'de>>(
        deserializer: D,
    ) -> Result<HashSet<TileCoord>, D::Error> {
        let coords = Vec::<TileCoord>::deserialize(deserializer)?;
        Ok(coords.into_iter().collect())
    }
}

/// Serialize a gameplay state into a manifest metadata value.
///
/// `GameState` maps workers by integer `EntityId`; `serde_json::Value` only
/// accepts string keys, so the state is serialized to JSON text first (where
/// integer keys become strings) and re-parsed into a plain object value.
pub fn encode_snapshot(state: &GameState) -> Value {
    let json = serde_json::to_string(state).expect("GameState serialization is infallible");
    let state_value: Value =
        serde_json::from_str(&json).expect("state JSON round-trips through a Value");
    serde_json::json!({
        "version": SNAPSHOT_VERSION,
        "state": state_value,
    })
}

/// Restore a gameplay state from manifest metadata, if present and readable.
///
/// Returns `None` when the metadata has no snapshot, the snapshot version is
/// unknown, or the payload fails to deserialize — callers fall back to a
/// fresh gameplay state rather than failing the whole map load.
pub fn decode_snapshot(metadata: &BTreeMap<String, Value>) -> Option<GameState> {
    let snapshot = metadata.get(GAMEPLAY_METADATA_KEY)?;
    let version = snapshot.get("version")?.as_u64()?;
    if version != u64::from(SNAPSHOT_VERSION) {
        return None;
    }
    serde_json::from_value(snapshot.get("state")?.clone()).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gameplay::command::GameCommand;
    use crate::gameplay::{ChallengeStatus, ResourceKind, TileArea, TileCoord};
    use crate::storage::archive::ArchiveLimits;
    use crate::storage::codec::{decode_world_with_metadata, encode_world_with_metadata};
    use crate::voxel::VoxelWorld;

    fn populated_state() -> GameState {
        let mut state = GameState::new_with_worker(TileCoord::new(3, 4));
        state.spawn_worker("Second", TileCoord::new(1, 1));
        state.add_item_pile(TileCoord::new(2, 2), ResourceKind::Wood, 5);
        state
    }

    #[test]
    fn snapshot_round_trips_through_gemap_metadata() {
        let mut world = VoxelWorld::new("Save with run");
        let wall = world.intern_block("glyphweave:wall").unwrap();
        world.set(crate::voxel::VoxelCoord::new(0, 0, 0), wall).unwrap();

        let state = populated_state();
        let metadata = BTreeMap::from([(GAMEPLAY_METADATA_KEY.to_owned(), encode_snapshot(&state))]);
        let bytes = encode_world_with_metadata(&world, Some(metadata)).unwrap();
        let decoded = decode_world_with_metadata(&bytes, ArchiveLimits::default()).unwrap();

        let restored = decode_snapshot(decoded.metadata.as_ref().unwrap()).unwrap();
        assert_eq!(restored, state);
    }

    #[test]
    fn missing_snapshot_metadata_yields_none() {
        let world = VoxelWorld::new("No run");
        let bytes = encode_world_with_metadata(&world, None).unwrap();
        let decoded = decode_world_with_metadata(&bytes, ArchiveLimits::default()).unwrap();
        let empty = BTreeMap::new();
        assert!(decode_snapshot(decoded.metadata.as_ref().unwrap_or(&empty)).is_none());
    }

    #[test]
    fn unknown_snapshot_version_is_ignored() {
        let metadata = BTreeMap::from([(
            GAMEPLAY_METADATA_KEY.to_owned(),
            serde_json::json!({"version": 99, "state": {}}),
        )]);
        assert!(decode_snapshot(&metadata).is_none());
    }

    #[test]
    fn malformed_snapshot_payload_is_ignored() {
        let metadata = BTreeMap::from([(
            GAMEPLAY_METADATA_KEY.to_owned(),
            serde_json::json!({"version": 1, "state": {"workers": "not a map"}}),
        )]);
        assert!(decode_snapshot(&metadata).is_none());
    }

    #[test]
    fn challenge_run_snapshot_round_trips() {
        let mut state = populated_state();
        let core = TileArea::rect(TileCoord::new(0, 0), TileCoord::new(2, 2));
        state.start_flood_fortress(core, vec![], vec![], 48);
        // Advance the run so the snapshot carries non-default flood data.
        let restored = round_trip(&state);
        assert_eq!(restored, state);
        assert!(matches!(
            restored.challenge_status(),
            Some(ChallengeStatus::Running)
        ));
        // Silence unused-import warnings for GameCommand, kept for future tests.
        let _ = GameCommand::Mine {
            area: TileArea::centered(TileCoord::new(0, 0), 0),
        };
    }

    fn round_trip(state: &GameState) -> GameState {
        let world = VoxelWorld::new("Run only");
        let metadata = BTreeMap::from([(GAMEPLAY_METADATA_KEY.to_owned(), encode_snapshot(state))]);
        let bytes = encode_world_with_metadata(&world, Some(metadata)).unwrap();
        let decoded = decode_world_with_metadata(&bytes, ArchiveLimits::default()).unwrap();
        decode_snapshot(decoded.metadata.as_ref().unwrap()).unwrap()
    }
}
