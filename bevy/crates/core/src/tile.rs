use serde::{Deserialize, Serialize};

/// 26 tile kinds. Discriminant order = atlas index order (0..26).
/// `Ord` orders by atlas index (natural and correct for derived ordering with `#[repr(u8)]`).
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Default, Serialize, Deserialize,
)]
#[repr(u8)]
pub enum TileKind {
    #[default]
    #[serde(rename = "void")]
    Void = 0,
    #[serde(rename = "wall")]
    Wall,
    #[serde(rename = "floor")]
    Floor,
    #[serde(rename = "floorAlt")]
    FloorAlt,
    #[serde(rename = "door")]
    Door,
    #[serde(rename = "doorOpen")]
    DoorOpen,
    #[serde(rename = "water")]
    Water,
    #[serde(rename = "deepWater")]
    DeepWater,
    #[serde(rename = "lava")]
    Lava,
    #[serde(rename = "tree")]
    Tree,
    #[serde(rename = "grass")]
    Grass,
    #[serde(rename = "bridge")]
    Bridge,
    #[serde(rename = "stairsDown")]
    StairsDown,
    #[serde(rename = "stairsUp")]
    StairsUp,
    #[serde(rename = "altar")]
    Altar,
    #[serde(rename = "fountain")]
    Fountain,
    #[serde(rename = "grave")]
    Grave,
    #[serde(rename = "trap")]
    Trap,
    #[serde(rename = "pillar")]
    Pillar,
    #[serde(rename = "treasure")]
    Treasure,
    #[serde(rename = "shop")]
    Shop,
    #[serde(rename = "table")]
    Table,
    #[serde(rename = "throne")]
    Throne,
    #[serde(rename = "cage")]
    Cage,
    #[serde(rename = "blood")]
    Blood,
    #[serde(rename = "bar")]
    Bar,
}

/// Single source of truth mapping kind <-> serde id <-> glyph.
const TILE_TABLE: [(TileKind, &str, char); 26] = [
    (TileKind::Void, "void", ' '),
    (TileKind::Wall, "wall", '#'),
    (TileKind::Floor, "floor", '.'),
    (TileKind::FloorAlt, "floorAlt", ','),
    (TileKind::Door, "door", '+'),
    (TileKind::DoorOpen, "doorOpen", '\''),
    (TileKind::Water, "water", '~'),
    (TileKind::DeepWater, "deepWater", '≈'),
    (TileKind::Lava, "lava", '~'),
    (TileKind::Tree, "tree", '♣'),
    (TileKind::Grass, "grass", '"'),
    (TileKind::Bridge, "bridge", '═'),
    (TileKind::StairsDown, "stairsDown", '>'),
    (TileKind::StairsUp, "stairsUp", '<'),
    (TileKind::Altar, "altar", '≡'),
    (TileKind::Fountain, "fountain", '♦'),
    (TileKind::Grave, "grave", '☠'),
    (TileKind::Trap, "trap", '^'),
    (TileKind::Pillar, "pillar", '0'),
    (TileKind::Treasure, "treasure", '$'),
    (TileKind::Shop, "shop", 'Σ'),
    (TileKind::Table, "table", '▤'),
    (TileKind::Throne, "throne", 'Ψ'),
    (TileKind::Cage, "cage", '█'),
    (TileKind::Blood, "blood", ';'),
    (TileKind::Bar, "bar", '│'),
];

impl TileKind {
    /// Atlas index (0..26), matching `TILE_TABLE` order and discriminant value.
    pub fn index(self) -> usize {
        TILE_TABLE.iter().position(|(k, _, _)| *k == self).unwrap()
    }

    pub fn glyph(self) -> char {
        TILE_TABLE
            .iter()
            .find(|(k, _, _)| *k == self)
            .map(|(_, _, c)| *c)
            .unwrap_or(' ')
    }

    /// `Some(kind)` if the id is known, else `None`.
    pub fn from_id(id: &str) -> Option<TileKind> {
        TILE_TABLE
            .iter()
            .find(|(_, i, _)| *i == id)
            .map(|(k, _, _)| *k)
    }

    /// Canonical id string used in `.gemap` files.
    pub fn id(self) -> &'static str {
        TILE_TABLE
            .iter()
            .find(|(k, _, _)| *k == self)
            .map(|(_, i, _)| *i)
            .unwrap()
    }

    pub const ALL: [TileKind; 26] = [
        TileKind::Void,
        TileKind::Wall,
        TileKind::Floor,
        TileKind::FloorAlt,
        TileKind::Door,
        TileKind::DoorOpen,
        TileKind::Water,
        TileKind::DeepWater,
        TileKind::Lava,
        TileKind::Tree,
        TileKind::Grass,
        TileKind::Bridge,
        TileKind::StairsDown,
        TileKind::StairsUp,
        TileKind::Altar,
        TileKind::Fountain,
        TileKind::Grave,
        TileKind::Trap,
        TileKind::Pillar,
        TileKind::Treasure,
        TileKind::Shop,
        TileKind::Table,
        TileKind::Throne,
        TileKind::Cage,
        TileKind::Blood,
        TileKind::Bar,
    ];
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serde_round_trip_stress_ids() {
        for kind in TileKind::ALL {
            let s = serde_json::to_string(&kind).unwrap();
            let id = s.trim_matches('"');
            assert_eq!(id, kind.id(), "serde id mismatch for {:?}", kind);
            let back: TileKind = serde_json::from_str(&s).unwrap();
            assert_eq!(kind, back);
        }
    }

    #[test]
    fn specific_camel_case_ids() {
        assert_eq!(
            serde_json::to_string(&TileKind::FloorAlt).unwrap(),
            "\"floorAlt\""
        );
        assert_eq!(
            serde_json::to_string(&TileKind::StairsDown).unwrap(),
            "\"stairsDown\""
        );
        assert_eq!(
            serde_json::to_string(&TileKind::DeepWater).unwrap(),
            "\"deepWater\""
        );
        assert_eq!(
            serde_json::to_string(&TileKind::DoorOpen).unwrap(),
            "\"doorOpen\""
        );
    }

    #[test]
    fn from_id_known_and_unknown() {
        assert_eq!(TileKind::from_id("floorAlt"), Some(TileKind::FloorAlt));
        assert_eq!(TileKind::from_id("nope"), None);
    }

    #[test]
    fn glyph_matches_spec() {
        assert_eq!(TileKind::Wall.glyph(), '#');
        assert_eq!(TileKind::DeepWater.glyph(), '≈');
        assert_eq!(TileKind::Bar.glyph(), '│');
    }

    #[test]
    fn default_is_void() {
        assert_eq!(TileKind::default(), TileKind::Void);
    }

    #[test]
    fn ord_orders_by_atlas_index() {
        assert!(TileKind::Void < TileKind::Wall);
        assert!(TileKind::Wall < TileKind::Bar);
    }
}
