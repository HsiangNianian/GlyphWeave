use std::collections::HashMap;

use thiserror::Error;

pub const AIR_BLOCK_NAME: &str = "glyphweave:air";

/// An in-memory block key. It is deliberately distinct from serialized IDs.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct BlockKey(u32);

impl BlockKey {
    pub const AIR: Self = Self(0);

    #[cfg(test)]
    pub(crate) const fn from_runtime_index(value: u32) -> Self {
        Self(value)
    }

    pub const fn as_u32(self) -> u32 {
        self.0
    }

    pub const fn is_air(self) -> bool {
        self.0 == Self::AIR.0
    }
}

/// A numeric block ID belonging to one serialized `.gemap` manifest.
///
/// The codec translates these IDs through names into [`BlockKey`] values. A
/// numeric file ID must never be used directly as an in-memory block key.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct SerializedBlockId(u32);

impl SerializedBlockId {
    pub const AIR: Self = Self(0);

    pub const fn new(value: u32) -> Self {
        Self(value)
    }

    pub const fn get(self) -> u32 {
        self.0
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum RegistryError {
    #[error("invalid namespaced block name: {0}")]
    InvalidName(String),
    #[error("block registry exhausted all runtime keys")]
    CapacityExhausted,
}

/// Append-only runtime registry for stable namespaced block identities.
#[derive(Debug, Clone)]
pub struct BlockRegistry {
    names: Vec<String>,
    keys_by_name: HashMap<String, BlockKey>,
}

impl Default for BlockRegistry {
    fn default() -> Self {
        let air = AIR_BLOCK_NAME.to_owned();
        let mut keys_by_name = HashMap::new();
        keys_by_name.insert(air.clone(), BlockKey::AIR);
        Self {
            names: vec![air],
            keys_by_name,
        }
    }
}

impl BlockRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    /// Returns the existing runtime key or appends a previously unknown name.
    pub fn intern(&mut self, name: impl Into<String>) -> Result<BlockKey, RegistryError> {
        let name = name.into();
        if let Some(key) = self.key(&name) {
            return Ok(key);
        }
        if !is_valid_block_name(&name) {
            return Err(RegistryError::InvalidName(name));
        }
        let value =
            u32::try_from(self.names.len()).map_err(|_| RegistryError::CapacityExhausted)?;
        let key = BlockKey(value);
        self.names.push(name.clone());
        self.keys_by_name.insert(name, key);
        Ok(key)
    }

    pub fn key(&self, name: &str) -> Option<BlockKey> {
        self.keys_by_name.get(name).copied()
    }

    pub fn name(&self, key: BlockKey) -> Option<&str> {
        self.names.get(key.0 as usize).map(String::as_str)
    }

    pub fn contains(&self, key: BlockKey) -> bool {
        self.name(key).is_some()
    }

    pub fn len(&self) -> usize {
        self.names.len()
    }

    pub fn is_empty(&self) -> bool {
        false
    }

    /// Iterates in runtime-key order. Unknown renderer names are retained.
    pub fn iter(&self) -> impl Iterator<Item = (BlockKey, &str)> + '_ {
        self.names
            .iter()
            .enumerate()
            .map(|(index, name)| (BlockKey(index as u32), name.as_str()))
    }
}

fn is_valid_block_name(name: &str) -> bool {
    let Some((namespace, path)) = name.split_once(':') else {
        return false;
    };
    if namespace.is_empty() || path.is_empty() || path.contains(':') {
        return false;
    }
    let valid_namespace = namespace
        .bytes()
        .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || b"_.-".contains(&byte));
    let valid_path = path
        .bytes()
        .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || b"_./-".contains(&byte));
    valid_namespace
        && valid_path
        && path
            .split('/')
            .all(|segment| !segment.is_empty() && segment != "." && segment != "..")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn air_is_permanently_runtime_key_zero() {
        let registry = BlockRegistry::new();
        assert_eq!(registry.key(AIR_BLOCK_NAME), Some(BlockKey::AIR));
        assert_eq!(registry.name(BlockKey::AIR), Some(AIR_BLOCK_NAME));
        assert_eq!(registry.len(), 1);
        assert!(!registry.is_empty());
    }

    #[test]
    fn intern_is_stable_and_preserves_unknown_names() {
        let mut registry = BlockRegistry::new();
        let unknown = registry.intern("future-mod:crystal/blue").unwrap();
        assert_eq!(registry.intern("future-mod:crystal/blue").unwrap(), unknown);
        assert_eq!(registry.name(unknown), Some("future-mod:crystal/blue"));

        let round_trip: Vec<(u32, String)> = registry
            .iter()
            .map(|(key, name)| (key.as_u32(), name.to_owned()))
            .collect();
        assert_eq!(
            round_trip,
            vec![
                (0, AIR_BLOCK_NAME.to_owned()),
                (1, "future-mod:crystal/blue".to_owned())
            ]
        );
    }

    #[test]
    fn serialized_ids_are_not_runtime_keys() {
        let file_id = SerializedBlockId::new(4000);
        let mut registry = BlockRegistry::new();
        let runtime_key = registry.intern("other:wall").unwrap();
        assert_eq!(file_id.get(), 4000);
        assert_eq!(runtime_key.as_u32(), 1);
    }

    #[test]
    fn rejects_non_namespaced_or_noncanonical_names() {
        let mut registry = BlockRegistry::new();
        for invalid in [
            "wall",
            ":wall",
            "mod:",
            "Mod:wall",
            "mod:Wall",
            "mod:bad:name",
            "mod:a//b",
            "mod:../b",
        ] {
            assert_eq!(
                registry.intern(invalid),
                Err(RegistryError::InvalidName(invalid.to_owned()))
            );
        }
    }
}
