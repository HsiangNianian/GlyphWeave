use crate::tile::TileKind;
use crate::world::World;

/// A single-tile mutation. The layer is supplied at apply time.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Edit {
    Set(TileKind),
    Erase,
}

impl Edit {
    pub fn apply(self, world: &mut World, layer_id: &str, x: i32, y: i32) {
        match self {
            Edit::Set(kind) => world.set(layer_id, x, y, kind),
            Edit::Erase => world.erase(layer_id, x, y),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn set_creates_chunk() {
        let mut w = World::default();
        let layer = w.active_layer.clone();
        Edit::Set(TileKind::Wall).apply(&mut w, &layer, 100, -200);
        assert_eq!(w.get(&layer, 100, -200), Some(TileKind::Wall));
        assert!(!w.active_grid().unwrap().is_empty());
    }

    #[test]
    fn erase_clears_cell() {
        let mut w = World::default();
        let layer = w.active_layer.clone();
        Edit::Set(TileKind::Floor).apply(&mut w, &layer, 0, 0);
        Edit::Erase.apply(&mut w, &layer, 0, 0);
        assert_eq!(w.get(&layer, 0, 0), None);
    }
}
