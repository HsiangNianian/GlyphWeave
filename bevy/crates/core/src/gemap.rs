use crate::error::{CoreError, Result};
use crate::layer::Layer;
use crate::tile::TileKind;
use crate::world::World;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

/// `.gemap` file v2 on-disk shape (camelCase JSON).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GemapFile {
    #[serde(default)]
    pub version: u32,
    /// Legacy flat: `"x,y" -> "tileId"`. Used as layer-1 on load when `layerTiles` is absent/empty.
    #[serde(default)]
    pub tiles: HashMap<String, String>,
    /// Authoritative: `layerId -> ("x,y" -> "tileId")`. Takes precedence over `tiles` on load.
    #[serde(default)]
    pub layer_tiles: HashMap<String, HashMap<String, String>>,
    #[serde(default)]
    pub layers: Vec<Layer>,
    #[serde(default = "default_world_name")]
    pub world_name: String,
    #[serde(default = "default_tile_size")]
    pub tile_size: u32,
    #[serde(default = "default_theme_id")]
    pub theme_id: String,
}

fn default_world_name() -> String {
    "Untitled".into()
}
fn default_tile_size() -> u32 {
    24
}
fn default_theme_id() -> String {
    "ansi-16".into()
}

pub fn parse_coord_key(key: &str) -> Result<(i32, i32)> {
    let (a, b) = key
        .split_once(',')
        .ok_or_else(|| CoreError::InvalidCoordKey(key.into()))?;
    let x: i32 = a
        .trim()
        .parse()
        .map_err(|_| CoreError::InvalidCoordKey(key.into()))?;
    let y: i32 = b
        .trim()
        .parse()
        .map_err(|_| CoreError::InvalidCoordKey(key.into()))?;
    Ok((x, y))
}

impl GemapFile {
    pub fn from_world(world: &World) -> Self {
        let first_layer = world
            .layers
            .first()
            .map(|l| l.id.clone())
            .unwrap_or_else(|| "layer-1".into());

        let mut layer_tiles: HashMap<String, HashMap<String, String>> = HashMap::new();
        let mut flat: HashMap<String, String> = HashMap::new();

        for layer in &world.layers {
            let mut map = HashMap::new();
            if let Some(grid) = world.grids.get(&layer.id) {
                for ((x, y), k) in grid.iter_tiles() {
                    let id = k.id().to_string();
                    let key = format!("{x},{y}");
                    if layer.id == first_layer {
                        flat.insert(key.clone(), id.clone());
                    }
                    map.insert(key, id);
                }
            }
            layer_tiles.insert(layer.id.clone(), map);
        }

        GemapFile {
            version: world.version,
            tiles: flat,
            layer_tiles,
            layers: world.layers.clone(),
            world_name: world.world_name.clone(),
            tile_size: world.tile_size,
            theme_id: world.theme_id.clone(),
        }
    }

    pub fn into_world(self) -> World {
        let mut world = World {
            version: if self.version > 0 { self.version } else { 2 },
            world_name: self.world_name,
            tile_size: self.tile_size,
            theme_id: self.theme_id,
            ..World::default()
        };

        if !self.layers.is_empty() {
            world.layers = self.layers;
        }
        world.grids.clear();
        for layer in &world.layers {
            world.grids.entry(layer.id.clone()).or_default();
        }
        if world.layers.is_empty() {
            let l = Layer::new("layer-1", "Layer 1");
            world.grids.insert(l.id.clone(), Default::default());
            world.layers.push(l);
        }
        world.active_layer = world.layers[0].id.clone();

        if !self.layer_tiles.is_empty() {
            // layerTiles is authoritative when present; the flat `tiles` map is ignored on load.
            for (layer_id, map) in self.layer_tiles {
                let grid = world.grids.entry(layer_id).or_default();
                ingest(grid, map);
            }
        } else {
            // Legacy flat -> active (first) layer.
            let active = world.active_layer.clone();
            let grid = world.grids.entry(active).or_default();
            ingest(grid, self.tiles);
        }
        world
    }
}

fn ingest(grid: &mut crate::chunk::ChunkGrid, map: HashMap<String, String>) {
    for (key, id) in map {
        let Ok((x, y)) = parse_coord_key(&key) else {
            continue;
        };
        match TileKind::from_id(&id) {
            Some(kind) => {
                if !matches!(kind, TileKind::Void) {
                    grid.set(x, y, kind);
                }
            }
            None => {
                eprintln!("warn: unknown tile id '{id}' at ({x},{y}); mapping to Void");
            }
        }
    }
}

pub fn load_world(path: &Path) -> Result<World> {
    let text = std::fs::read_to_string(path)?;
    let file: GemapFile = serde_json::from_str(&text)?;
    if file.version != 0 && file.version != 2 {
        return Err(CoreError::UnsupportedVersion(file.version));
    }
    Ok(file.into_world())
}

pub fn save_world(world: &World, path: &Path) -> Result<()> {
    let file = GemapFile::from_world(world);
    let text = serde_json::to_string_pretty(&file)?;
    std::fs::write(path, text)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn coord_key_parse_and_format() {
        assert_eq!(parse_coord_key("3,-4").unwrap(), (3, -4));
        assert!(parse_coord_key("nope").is_err());
        assert!(parse_coord_key("1,a").is_err());
    }

    #[test]
    fn tiny_round_trip() {
        let mut w = World {
            world_name: "Tiny".into(),
            ..World::default()
        };
        let layer = w.active_layer.clone();
        w.set(&layer, 0, 0, TileKind::Wall);
        w.set(&layer, -1, 5, TileKind::FloorAlt);

        let tmp = std::env::temp_dir().join("glyphweave_tiny_roundtrip.gemap");
        save_world(&w, &tmp).unwrap();
        let w2 = load_world(&tmp).unwrap();
        let _ = std::fs::remove_file(&tmp);

        assert_eq!(w2.world_name, "Tiny");
        let l2 = w2.active_layer.clone();
        assert_eq!(w2.get(&l2, 0, 0), Some(TileKind::Wall));
        assert_eq!(w2.get(&l2, -1, 5), Some(TileKind::FloorAlt));
        assert_eq!(w2.active_grid().unwrap().len(), 2);
    }

    #[test]
    fn legacy_flat_loads_into_layer_1() {
        let json = r#"{
            "version": 2,
            "tiles": { "1,2": "wall", "-3,-4": "floorAlt" },
            "worldName": "L",
            "tileSize": 24,
            "themeId": "ansi-16"
        }"#;
        let file: GemapFile = serde_json::from_str(json).unwrap();
        let world = file.into_world();
        assert_eq!(world.world_name, "L");
        assert_eq!(world.get("layer-1", 1, 2), Some(TileKind::Wall));
        assert_eq!(world.get("layer-1", -3, -4), Some(TileKind::FloorAlt));
    }

    #[test]
    fn layertiles_round_trip_preserves_three_layers() {
        let json = r#"{
            "version": 2,
            "layerTiles": {
                "layer-1": { "0,0": "floor" },
                "layer-2": { "0,0": "wall" },
                "layer-3": { "0,0": "tree" }
            },
            "tiles": { "0,0": "lava" },
            "layers": [
                {"id":"layer-1","name":"A","visible":true,"locked":false},
                {"id":"layer-2","name":"B","visible":true,"locked":false},
                {"id":"layer-3","name":"C","visible":true,"locked":false}
            ],
            "worldName": "X",
            "tileSize": 24,
            "themeId": "ansi-16"
        }"#;
        let file: GemapFile = serde_json::from_str(json).unwrap();
        let world = file.into_world();
        assert_eq!(world.layers.len(), 3);
        // layerTiles wins over the flat `tiles` "lava" entry.
        assert_eq!(world.get("layer-1", 0, 0), Some(TileKind::Floor));
        assert_eq!(world.get("layer-2", 0, 0), Some(TileKind::Wall));
        assert_eq!(world.get("layer-3", 0, 0), Some(TileKind::Tree));

        let tmp = std::env::temp_dir().join("glyphweave_3layer_roundtrip.gemap");
        save_world(&world, &tmp).unwrap();
        let world2 = load_world(&tmp).unwrap();
        let _ = std::fs::remove_file(&tmp);
        assert_eq!(world2.layers, world.layers);
        for layer in &world.layers {
            assert_eq!(
                world.grid(&layer.id).unwrap().len(),
                world2.grid(&layer.id).unwrap().len()
            );
            assert_eq!(world2.get(&layer.id, 0, 0), world.get(&layer.id, 0, 0));
        }
    }

    #[test]
    fn unknown_id_becomes_void_with_warning() {
        let json = r#"{
            "version": 2,
            "tiles": { "0,0": "madeUpTileKind" },
            "worldName": "U",
            "tileSize": 24,
            "themeId": "ansi-16"
        }"#;
        let file: GemapFile = serde_json::from_str(json).unwrap();
        let world = file.into_world();
        assert!(world.active_grid().unwrap().is_empty());
    }

    #[test]
    fn save_writes_both_layer_tiles_and_flat_for_back_compat() {
        let mut w = World::default();
        let layer = w.active_layer.clone();
        w.set(&layer, 2, 3, TileKind::Door);
        let tmp = std::env::temp_dir().join("glyphweave_backcompat.gemap");
        save_world(&w, &tmp).unwrap();
        let raw = std::fs::read_to_string(&tmp).unwrap();
        let _ = std::fs::remove_file(&tmp);
        assert!(raw.contains("\"layerTiles\""), "must write layerTiles");
        assert!(
            raw.contains("\"tiles\""),
            "must write flat tiles for back-compat"
        );
        let parsed: serde_json::Value = serde_json::from_str(&raw).unwrap();
        assert_eq!(parsed["tiles"]["2,3"], "door");
        assert_eq!(parsed["layerTiles"]["layer-1"]["2,3"], "door");
    }
}
