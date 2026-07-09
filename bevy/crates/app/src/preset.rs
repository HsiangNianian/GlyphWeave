use glyphweave_core::tile::TileKind;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PresetCategory {
    Rooms,
    Corridors,
    Features,
    Dungeon,
    Traps,
}

impl PresetCategory {
    pub const ALL: [PresetCategory; 5] = [
        PresetCategory::Rooms,
        PresetCategory::Corridors,
        PresetCategory::Features,
        PresetCategory::Dungeon,
        PresetCategory::Traps,
    ];

    pub fn label(self) -> &'static str {
        match self {
            PresetCategory::Rooms => "Rooms",
            PresetCategory::Corridors => "Corridors",
            PresetCategory::Features => "Features",
            PresetCategory::Dungeon => "Dungeon",
            PresetCategory::Traps => "Traps",
        }
    }
}

pub struct Preset {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub category: PresetCategory,
    pub grid: &'static [&'static [TileKind]],
}

const V: TileKind = TileKind::Void;
const W: TileKind = TileKind::Wall;
const F: TileKind = TileKind::Floor;
const D: TileKind = TileKind::Door;
const WA: TileKind = TileKind::Water;
const T: TileKind = TileKind::Tree;
const B: TileKind = TileKind::Bridge;
const A: TileKind = TileKind::Altar;
const TR: TileKind = TileKind::Treasure;
const FT: TileKind = TileKind::Fountain;
const G: TileKind = TileKind::Grave;
const P: TileKind = TileKind::Pillar;
const SD: TileKind = TileKind::StairsDown;
const SU: TileKind = TileKind::StairsUp;
const RP: TileKind = TileKind::Trap;
const C: TileKind = TileKind::Cage;
const TH: TileKind = TileKind::Throne;
const TB: TileKind = TileKind::Table;

const SMALL_ROOM: &[&[TileKind]] = &[
    &[W, W, W, W, W],
    &[W, F, F, F, W],
    &[W, F, F, F, W],
    &[W, F, F, F, W],
    &[W, W, W, W, W],
];
const MEDIUM_ROOM: &[&[TileKind]] = &[
    &[W, W, W, W, W, W, W],
    &[W, F, F, F, F, F, W],
    &[W, F, F, F, F, F, W],
    &[W, F, F, F, F, F, W],
    &[W, F, F, F, F, F, W],
    &[W, F, F, F, F, F, W],
    &[W, W, W, W, W, W, W],
];
const LARGE_ROOM: &[&[TileKind]] = &[
    &[W, W, W, W, W, W, W, W, W, W, W],
    &[W, F, F, F, F, F, F, F, F, F, W],
    &[W, F, F, F, F, F, F, F, F, F, W],
    &[W, F, F, F, F, F, F, F, F, F, W],
    &[W, F, F, F, F, F, F, F, F, F, W],
    &[W, F, F, F, F, F, F, F, F, F, W],
    &[W, F, F, F, F, F, F, F, F, F, W],
    &[W, F, F, F, F, F, F, F, F, F, W],
    &[W, F, F, F, F, F, F, F, F, F, W],
    &[W, F, F, F, F, F, F, F, F, F, W],
    &[W, W, W, W, W, W, W, W, W, W, W],
];
const WIDE_ROOM: &[&[TileKind]] = &[
    &[W, W, W, W, W, W, W, W, W, W, W, W, W],
    &[W, F, F, F, F, F, F, F, F, F, F, F, W],
    &[W, F, F, F, F, F, F, F, F, F, F, F, W],
    &[W, F, F, F, F, F, F, F, F, F, F, F, W],
    &[W, F, F, F, F, F, F, F, F, F, F, F, W],
    &[W, F, F, F, F, F, F, F, F, F, F, F, W],
    &[W, W, W, W, W, W, W, W, W, W, W, W, W],
];
const CROSS_ROOM: &[&[TileKind]] = &[
    &[V, V, W, W, W, W, W, V, V],
    &[V, V, W, F, F, F, W, V, V],
    &[V, V, W, F, F, F, W, V, V],
    &[W, W, W, F, F, F, W, W, W],
    &[W, F, F, F, F, F, F, F, W],
    &[W, F, F, F, F, F, F, F, W],
    &[W, W, W, F, F, F, W, W, W],
    &[V, V, W, F, F, F, W, V, V],
    &[V, V, W, F, F, F, W, V, V],
    &[V, V, W, W, W, W, W, V, V],
];
const L_ROOM: &[&[TileKind]] = &[
    &[W, W, W, W, W, W, W, W],
    &[W, F, F, F, F, F, F, W],
    &[W, F, F, F, F, F, F, W],
    &[W, F, F, F, F, F, F, W],
    &[W, F, F, F, W, W, W, W],
    &[W, F, F, F, W, V, V, V],
    &[W, F, F, F, W, V, V, V],
    &[W, W, W, W, W, V, V, V],
];
const T_ROOM: &[&[TileKind]] = &[
    &[W, W, W, W, W, W, W, W, W],
    &[W, F, F, F, F, F, F, F, W],
    &[W, F, F, F, F, F, F, F, W],
    &[W, W, W, F, F, F, W, W, W],
    &[V, V, W, F, F, F, W, V, V],
    &[V, V, W, F, F, F, W, V, V],
    &[V, V, W, F, F, F, W, V, V],
    &[V, V, W, W, W, W, W, V, V],
];
const OCTAGON_ROOM: &[&[TileKind]] = &[
    &[V, V, W, W, W, W, W, V, V],
    &[V, W, W, F, F, F, W, W, V],
    &[W, W, F, F, F, F, F, W, W],
    &[W, F, F, F, F, F, F, F, W],
    &[W, F, F, F, F, F, F, F, W],
    &[W, F, F, F, F, F, F, F, W],
    &[W, W, F, F, F, F, F, W, W],
    &[V, W, W, F, F, F, W, W, V],
    &[V, V, W, W, W, W, W, V, V],
];
const PILLARED_HALL: &[&[TileKind]] = &[
    &[W, W, W, W, W, W, W, W, W],
    &[W, F, F, P, F, P, F, F, W],
    &[W, F, F, F, F, F, F, F, W],
    &[W, P, F, F, F, F, F, P, W],
    &[W, F, F, F, F, F, F, F, W],
    &[W, F, F, F, F, F, F, F, W],
    &[W, P, F, F, F, F, F, P, W],
    &[W, F, F, F, F, F, F, F, W],
    &[W, F, F, P, F, P, F, F, W],
    &[W, W, W, W, W, W, W, W, W],
];

const CORRIDOR_H: &[&[TileKind]] = &[
    &[W, W, W, W, W, W, W, W, W],
    &[F, F, F, F, F, F, F, F, F],
    &[W, W, W, W, W, W, W, W, W],
];
const CORRIDOR_V: &[&[TileKind]] = &[
    &[W, F, W],
    &[W, F, W],
    &[W, F, W],
    &[W, F, W],
    &[W, F, W],
    &[W, F, W],
    &[W, F, W],
];
const CORRIDOR_WIDE_H: &[&[TileKind]] = &[
    &[W, W, W, W, W, W, W, W, W],
    &[F, F, F, F, F, F, F, F, F],
    &[F, F, F, F, F, F, F, F, F],
    &[W, W, W, W, W, W, W, W, W],
];
const T_JUNCTION: &[&[TileKind]] = &[
    &[W, F, W, V, V, V],
    &[W, F, W, V, V, V],
    &[F, F, F, F, F, F],
    &[W, F, W, V, V, V],
    &[W, F, W, V, V, V],
];
const CROSS_JUNCTION: &[&[TileKind]] = &[
    &[V, V, W, F, W, V, V],
    &[V, V, W, F, W, V, V],
    &[F, F, F, F, F, F, F],
    &[W, F, W, W, F, W, W],
    &[F, F, F, F, F, F, F],
    &[V, V, W, F, W, V, V],
    &[V, V, W, F, W, V, V],
];
const CORNER: &[&[TileKind]] = &[
    &[W, F, W, W, W],
    &[W, F, F, F, W],
    &[W, W, W, F, W],
    &[V, V, V, F, W],
];
const S_CORRIDOR: &[&[TileKind]] = &[
    &[F, F, F, W, W],
    &[W, W, F, F, F],
    &[W, W, W, W, F],
    &[F, F, F, F, F],
    &[W, F, W, W, W],
    &[W, F, F, F, W],
    &[W, W, W, F, F],
];

const VAULT: &[&[TileKind]] = &[
    &[W, W, W, W, W],
    &[W, F, F, F, W],
    &[W, F, TR, F, W],
    &[W, F, F, F, W],
    &[W, W, W, W, W],
];
const FOUNTAIN_HALL: &[&[TileKind]] = &[
    &[W, W, W, W, W, W, W],
    &[W, F, F, F, F, F, W],
    &[W, F, F, FT, F, F, W],
    &[W, F, FT, FT, FT, F, W],
    &[W, F, F, FT, F, F, W],
    &[W, F, F, F, F, F, W],
    &[W, W, W, W, W, W, W],
];
const LAKE: &[&[TileKind]] = &[
    &[V, V, WA, WA, WA, V, V],
    &[V, WA, WA, WA, WA, WA, V],
    &[WA, WA, WA, WA, WA, WA, WA],
    &[WA, WA, WA, WA, WA, WA, WA],
    &[WA, WA, WA, WA, WA, WA, WA],
    &[V, WA, WA, WA, WA, WA, V],
    &[V, V, WA, WA, WA, V, V],
];
const FOREST: &[&[TileKind]] = &[
    &[T, V, T, V, T, V],
    &[V, T, V, T, V, T],
    &[T, V, T, V, T, V],
    &[V, T, V, T, V, T],
    &[T, V, T, V, T, V],
];
const GRAVEYARD: &[&[TileKind]] = &[
    &[W, W, W, W, W, W, W],
    &[W, G, F, G, F, G, W],
    &[W, F, F, F, F, F, W],
    &[W, G, F, G, F, G, W],
    &[W, F, F, F, F, F, W],
    &[W, G, F, G, F, G, W],
    &[W, W, W, W, W, W, W],
];
const ALTAR_ROOM: &[&[TileKind]] = &[
    &[W, W, W, W, W],
    &[W, F, F, F, W],
    &[W, F, A, F, W],
    &[W, F, F, F, W],
    &[W, W, W, W, W],
];

const ENTRANCE_HALL: &[&[TileKind]] = &[
    &[W, W, W, W, W, W, W],
    &[D, F, F, F, F, F, D],
    &[W, F, F, F, F, F, W],
    &[W, F, F, SD, F, F, W],
    &[W, F, F, F, F, F, W],
    &[D, F, F, F, F, F, D],
    &[W, W, W, W, W, W, W],
];
const PRISON: &[&[TileKind]] = &[
    &[W, W, W, W, W, W, W, W, W],
    &[D, F, F, F, W, F, F, F, D],
    &[W, C, F, C, W, F, F, F, W],
    &[W, F, F, F, W, W, W, W, W],
    &[W, F, F, F, W, F, F, F, W],
    &[W, C, F, C, W, F, F, F, W],
    &[W, F, F, F, W, F, F, F, W],
    &[W, W, W, W, W, W, W, W, W],
];
const BRIDGE_PRESET: &[&[TileKind]] = &[
    &[W, F, W],
    &[WA, B, WA],
    &[WA, B, WA],
    &[WA, B, WA],
    &[WA, B, WA],
    &[WA, B, WA],
    &[W, F, W],
];
const SHOP: &[&[TileKind]] = &[
    &[W, W, W, W, W, W, W],
    &[D, F, F, F, F, F, D],
    &[W, TB, TB, F, TB, TB, W],
    &[W, F, F, F, F, F, W],
    &[W, TB, TB, F, TB, TB, W],
    &[W, F, F, F, F, F, W],
    &[W, W, W, W, W, W, W],
];
const KITCHEN: &[&[TileKind]] = SHOP;
const THRONE_ROOM: &[&[TileKind]] = &[
    &[W, W, W, W, W, W, W, W, W],
    &[W, F, F, F, F, F, F, F, W],
    &[W, F, F, F, F, F, F, F, W],
    &[W, F, F, TH, TH, F, F, F, W],
    &[W, F, F, TH, TH, F, F, F, W],
    &[W, F, F, F, F, F, F, F, W],
    &[W, F, F, F, F, F, F, F, W],
    &[W, F, F, F, F, F, F, F, W],
    &[W, W, W, W, W, W, W, W, W],
];
const STAIRS_SET: &[&[TileKind]] = &[
    &[W, W, W, W, W],
    &[W, F, F, F, W],
    &[W, SU, F, SD, W],
    &[W, F, F, F, W],
    &[W, W, W, W, W],
];

const TRAP_CORRIDOR: &[&[TileKind]] = &[
    &[W, W, W, W, W, W, W, W, W],
    &[RP, F, F, RP, F, F, RP, F, RP],
    &[W, W, W, W, W, W, W, W, W],
];
const TRAP_ROOM: &[&[TileKind]] = &[
    &[W, W, W, W, W, W, W],
    &[W, RP, F, RP, F, RP, W],
    &[W, F, F, F, F, F, W],
    &[W, RP, F, RP, F, RP, W],
    &[W, F, F, F, F, F, W],
    &[W, RP, F, RP, F, RP, W],
    &[W, W, W, W, W, W, W],
];

pub const PRESETS: &[Preset] = &[
    Preset {
        id: "small-room",
        name: "Small Room",
        description: "A cozy 5x5 room.",
        category: PresetCategory::Rooms,
        grid: SMALL_ROOM,
    },
    Preset {
        id: "medium-room",
        name: "Medium Room",
        description: "A spacious 7x7 room.",
        category: PresetCategory::Rooms,
        grid: MEDIUM_ROOM,
    },
    Preset {
        id: "large-room",
        name: "Large Room",
        description: "A grand 11x11 hall.",
        category: PresetCategory::Rooms,
        grid: LARGE_ROOM,
    },
    Preset {
        id: "wide-room",
        name: "Wide Room",
        description: "A wide 13x7 rectangular room.",
        category: PresetCategory::Rooms,
        grid: WIDE_ROOM,
    },
    Preset {
        id: "cross-room",
        name: "Cross Room",
        description: "A cross-shaped chamber.",
        category: PresetCategory::Rooms,
        grid: CROSS_ROOM,
    },
    Preset {
        id: "l-room",
        name: "L-Shape Room",
        description: "An L-shaped room.",
        category: PresetCategory::Rooms,
        grid: L_ROOM,
    },
    Preset {
        id: "t-room",
        name: "T-Shape Room",
        description: "A T-shaped meeting room.",
        category: PresetCategory::Rooms,
        grid: T_ROOM,
    },
    Preset {
        id: "octagon-room",
        name: "Octagon Room",
        description: "An octagonal chamber.",
        category: PresetCategory::Rooms,
        grid: OCTAGON_ROOM,
    },
    Preset {
        id: "pillared-hall",
        name: "Pillared Hall",
        description: "A hall with support pillars.",
        category: PresetCategory::Rooms,
        grid: PILLARED_HALL,
    },
    Preset {
        id: "corridor-h",
        name: "Horizontal Corridor",
        description: "A straight 1x7 horizontal passage.",
        category: PresetCategory::Corridors,
        grid: CORRIDOR_H,
    },
    Preset {
        id: "corridor-v",
        name: "Vertical Corridor",
        description: "A straight 7x1 vertical passage.",
        category: PresetCategory::Corridors,
        grid: CORRIDOR_V,
    },
    Preset {
        id: "corridor-wide-h",
        name: "Wide H-Corridor",
        description: "A 2-tile-wide horizontal corridor.",
        category: PresetCategory::Corridors,
        grid: CORRIDOR_WIDE_H,
    },
    Preset {
        id: "t-junction",
        name: "T-Junction",
        description: "A three-way corridor junction.",
        category: PresetCategory::Corridors,
        grid: T_JUNCTION,
    },
    Preset {
        id: "cross-junction",
        name: "Cross Junction",
        description: "A four-way corridor crossing.",
        category: PresetCategory::Corridors,
        grid: CROSS_JUNCTION,
    },
    Preset {
        id: "corner",
        name: "Corner",
        description: "An L-shaped corridor bend.",
        category: PresetCategory::Corridors,
        grid: CORNER,
    },
    Preset {
        id: "s-corridor",
        name: "S-Corridor",
        description: "A snaking S-shaped passage.",
        category: PresetCategory::Corridors,
        grid: S_CORRIDOR,
    },
    Preset {
        id: "vault",
        name: "Treasure Vault",
        description: "A small heavily-walled treasure room.",
        category: PresetCategory::Features,
        grid: VAULT,
    },
    Preset {
        id: "fountain-hall",
        name: "Fountain Hall",
        description: "A room with a central fountain.",
        category: PresetCategory::Features,
        grid: FOUNTAIN_HALL,
    },
    Preset {
        id: "lake",
        name: "Lake",
        description: "A small body of water.",
        category: PresetCategory::Features,
        grid: LAKE,
    },
    Preset {
        id: "forest",
        name: "Forest Grove",
        description: "A cluster of trees.",
        category: PresetCategory::Features,
        grid: FOREST,
    },
    Preset {
        id: "graveyard",
        name: "Graveyard",
        description: "A burial ground with graves.",
        category: PresetCategory::Features,
        grid: GRAVEYARD,
    },
    Preset {
        id: "altar-room",
        name: "Altar Room",
        description: "A somber chamber with an altar.",
        category: PresetCategory::Features,
        grid: ALTAR_ROOM,
    },
    Preset {
        id: "entrance-hall",
        name: "Entrance Hall",
        description: "A grand entrance with stairs down.",
        category: PresetCategory::Dungeon,
        grid: ENTRANCE_HALL,
    },
    Preset {
        id: "prison",
        name: "Prison",
        description: "A cell block.",
        category: PresetCategory::Dungeon,
        grid: PRISON,
    },
    Preset {
        id: "bridge",
        name: "Bridge",
        description: "A bridge crossing water.",
        category: PresetCategory::Dungeon,
        grid: BRIDGE_PRESET,
    },
    Preset {
        id: "shop",
        name: "Shop",
        description: "A merchant shop.",
        category: PresetCategory::Dungeon,
        grid: SHOP,
    },
    Preset {
        id: "kitchen",
        name: "Kitchen",
        description: "A kitchen with tables.",
        category: PresetCategory::Dungeon,
        grid: KITCHEN,
    },
    Preset {
        id: "throne-room",
        name: "Throne Room",
        description: "A royal throne chamber.",
        category: PresetCategory::Dungeon,
        grid: THRONE_ROOM,
    },
    Preset {
        id: "stairs-set",
        name: "Stairs Set",
        description: "Up and down stairs side by side.",
        category: PresetCategory::Dungeon,
        grid: STAIRS_SET,
    },
    Preset {
        id: "trap-corridor",
        name: "Trapped Corridor",
        description: "A corridor lined with traps.",
        category: PresetCategory::Traps,
        grid: TRAP_CORRIDOR,
    },
    Preset {
        id: "trap-room",
        name: "Trap Room",
        description: "A room with a trapped floor.",
        category: PresetCategory::Traps,
        grid: TRAP_ROOM,
    },
];
