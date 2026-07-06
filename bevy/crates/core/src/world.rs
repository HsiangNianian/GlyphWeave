use crate::chunk::ChunkGrid;
use crate::layer::Layer;
use crate::tile::TileKind;
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct World {
    pub version: u32,
    pub world_name: String,
    pub tile_size: u32,
    pub theme_id: String,
    pub layers: Vec<Layer>,
    /// One grid per layer id.
    pub grids: HashMap<String, ChunkGrid>,
    pub active_layer: String,
}

impl Default for World {
    fn default() -> Self {
        let layer = Layer::new("layer-1", "Layer 1");
        let mut grids = HashMap::new();
        grids.insert(layer.id.clone(), ChunkGrid::new());
        Self {
            version: 2,
            world_name: "Untitled".into(),
            tile_size: 24,
            theme_id: "ansi-16".into(),
            layers: vec![layer],
            grids,
            active_layer: "layer-1".into(),
        }
    }
}

impl World {
    pub fn new() -> Self { Self::default() }

    pub fn layer(&self, id: &str) -> Option<&Layer> {
        self.layers.iter().find(|l| l.id == id)
    }

    pub fn grid(&self, layer_id: &str) -> Option<&ChunkGrid> { self.grids.get(layer_id) }
    pub fn grid_mut(&mut self, layer_id: &str) -> Option<&mut ChunkGrid> { self.grids.get_mut(layer_id) }

    pub fn active_grid(&self) -> Option<&ChunkGrid> { self.grid(&self.active_layer) }

    pub fn get(&self, layer_id: &str, x: i32, y: i32) -> Option<TileKind> {
        self.grid(layer_id).and_then(|g| g.get(x, y))
    }

    pub fn set(&mut self, layer_id: &str, x: i32, y: i32, kind: TileKind) {
        if let Some(g) = self.grid_mut(layer_id) {
            g.set(x, y, kind);
        }
    }

    pub fn erase(&mut self, layer_id: &str, x: i32, y: i32) {
        if let Some(g) = self.grid_mut(layer_id) {
            g.erase(x, y);
        }
    }

    pub fn ensure_grid(&mut self, layer_id: &str) {
        self.grids.entry(layer_id.to_string()).or_default();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_has_one_layer_with_empty_grid() {
        let w = World::default();
        assert_eq!(w.layers.len(), 1);
        assert!(w.active_grid().unwrap().is_empty());
        assert_eq!(w.version, 2);
        assert_eq!(w.tile_size, 24);
    }

    #[test]
    fn set_get_erase_round_trip() {
        let mut w = World::default();
        let layer = w.active_layer.clone();
        w.set(&layer, 3, -4, TileKind::Wall);
        assert_eq!(w.get(&layer, 3, -4), Some(TileKind::Wall));
        w.erase(&layer, 3, -4);
        assert_eq!(w.get(&layer, 3, -4), None);
    }

    #[test]
    fn set_on_unknown_layer_is_noop() {
        let mut w = World::default();
        w.set("nope", 0, 0, TileKind::Floor);
        assert!(w.grids.contains_key("layer-1"));
        assert!(!w.grids.contains_key("nope"));
    }
}
