//! Built-in playable challenge scenarios.

use glyphweave_core::gameplay::{
    GameState, OldDam, ResourceKind, TileArea, TileCoord, WaterSource,
};
use glyphweave_core::tile::TileKind;
use glyphweave_core::world::World;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FloodFortressPreset {
    BreachNight,
    LowlandGranary,
    TwinRivers,
}

impl FloodFortressPreset {
    pub const ALL: [Self; 3] = [Self::BreachNight, Self::LowlandGranary, Self::TwinRivers];

    pub fn label(self) -> &'static str {
        match self {
            Self::BreachNight => "破堤之夜",
            Self::LowlandGranary => "低地粮仓",
            Self::TwinRivers => "双河夹击",
        }
    }

    pub fn description(self) -> &'static str {
        match self {
            Self::BreachNight => "教学关：旧堤坝破裂前修好防线。",
            Self::LowlandGranary => "资源保护关：核心仓库位于低地。",
            Self::TwinRivers => "工程规划关：两侧水源夹击据点。",
        }
    }
}

pub fn create_flood_fortress_preset(preset: FloodFortressPreset) -> (World, GameState) {
    match preset {
        FloodFortressPreset::BreachNight => breach_night(),
        FloodFortressPreset::LowlandGranary => lowland_granary(),
        FloodFortressPreset::TwinRivers => twin_rivers(),
    }
}

fn breach_night() -> (World, GameState) {
    let mut world = base_world("Flood Fortress - Breach Night");
    fill_rect(
        &mut world,
        TileCoord::new(-12, -8),
        TileCoord::new(12, 8),
        TileKind::Grass,
    );
    fill_rect(
        &mut world,
        TileCoord::new(-2, -2),
        TileCoord::new(5, 2),
        TileKind::Floor,
    );
    fill_rect(
        &mut world,
        TileCoord::new(-8, -1),
        TileCoord::new(-5, 1),
        TileKind::DeepWater,
    );
    paint_line(
        &mut world,
        TileCoord::new(-4, -3),
        TileCoord::new(-4, 3),
        TileKind::Wall,
    );
    set_tile(&mut world, TileCoord::new(-3, -3), TileKind::Wall);
    set_tile(&mut world, TileCoord::new(-4, 0), TileKind::Wall);
    scatter_trees(&mut world, TileCoord::new(1, -6), 10);
    scatter_rocks(&mut world, TileCoord::new(7, -3), 8);

    let core = TileArea::rect(TileCoord::new(2, -1), TileCoord::new(4, 1));
    let state = flood_state(
        core,
        vec![OldDam::new(TileCoord::new(-4, 0))],
        vec![WaterSource::new(TileCoord::new(-5, 0), 3)],
        48,
        [
            TileCoord::new(0, 0),
            TileCoord::new(1, 0),
            TileCoord::new(0, 1),
            TileCoord::new(1, 1),
        ],
    );
    (world, state)
}

fn lowland_granary() -> (World, GameState) {
    let mut world = base_world("Flood Fortress - Lowland Granary");
    fill_rect(
        &mut world,
        TileCoord::new(-14, -9),
        TileCoord::new(14, 9),
        TileKind::Grass,
    );
    fill_rect(
        &mut world,
        TileCoord::new(-3, -3),
        TileCoord::new(5, 3),
        TileKind::FloorAlt,
    );
    fill_rect(
        &mut world,
        TileCoord::new(-9, -2),
        TileCoord::new(-6, 2),
        TileKind::DeepWater,
    );
    paint_line(
        &mut world,
        TileCoord::new(-5, -4),
        TileCoord::new(-5, 4),
        TileKind::Wall,
    );
    set_tile(&mut world, TileCoord::new(-5, 0), TileKind::Wall);
    fill_rect(
        &mut world,
        TileCoord::new(7, -5),
        TileCoord::new(10, -2),
        TileKind::Floor,
    );
    scatter_trees(&mut world, TileCoord::new(0, 6), 12);
    scatter_rocks(&mut world, TileCoord::new(9, 4), 10);

    let core = TileArea::rect(TileCoord::new(2, -1), TileCoord::new(4, 1));
    let mut state = flood_state(
        core,
        vec![OldDam::new(TileCoord::new(-5, 0))],
        vec![WaterSource::new(TileCoord::new(-6, 0), 3)],
        64,
        [
            TileCoord::new(0, 0),
            TileCoord::new(1, 0),
            TileCoord::new(0, 1),
            TileCoord::new(1, 1),
        ],
    );
    state.inventory.add(ResourceKind::Food, 10);
    (world, state)
}

fn twin_rivers() -> (World, GameState) {
    let mut world = base_world("Flood Fortress - Twin Rivers");
    fill_rect(
        &mut world,
        TileCoord::new(-16, -10),
        TileCoord::new(16, 10),
        TileKind::Grass,
    );
    fill_rect(
        &mut world,
        TileCoord::new(-4, -3),
        TileCoord::new(4, 3),
        TileKind::Floor,
    );
    fill_rect(
        &mut world,
        TileCoord::new(-13, -2),
        TileCoord::new(-10, 2),
        TileKind::DeepWater,
    );
    fill_rect(
        &mut world,
        TileCoord::new(10, -2),
        TileCoord::new(13, 2),
        TileKind::DeepWater,
    );
    paint_line(
        &mut world,
        TileCoord::new(-9, -5),
        TileCoord::new(-9, 5),
        TileKind::Wall,
    );
    paint_line(
        &mut world,
        TileCoord::new(9, -5),
        TileCoord::new(9, 5),
        TileKind::Wall,
    );
    set_tile(&mut world, TileCoord::new(-9, 0), TileKind::Wall);
    set_tile(&mut world, TileCoord::new(9, 0), TileKind::Wall);
    scatter_trees(&mut world, TileCoord::new(-1, 7), 14);
    scatter_rocks(&mut world, TileCoord::new(0, -7), 14);

    let core = TileArea::rect(TileCoord::new(-1, -1), TileCoord::new(1, 1));
    let state = flood_state(
        core,
        vec![
            OldDam::new(TileCoord::new(-9, 0)),
            OldDam::new(TileCoord::new(9, 0)),
        ],
        vec![
            WaterSource::new(TileCoord::new(-10, 0), 3),
            WaterSource::new(TileCoord::new(10, 0), 3),
        ],
        72,
        [
            TileCoord::new(-2, 0),
            TileCoord::new(2, 0),
            TileCoord::new(-2, 1),
            TileCoord::new(2, 1),
        ],
    );
    (world, state)
}

fn base_world(name: &str) -> World {
    World {
        world_name: name.into(),
        theme_id: "fortress-pixel".into(),
        tile_size: 24,
        ..World::default()
    }
}

fn flood_state(
    core: TileArea,
    dams: Vec<OldDam>,
    sources: Vec<WaterSource>,
    breach_after_ticks: u64,
    worker_positions: [TileCoord; 4],
) -> GameState {
    let mut state = GameState::default();
    for (name, pos) in ["Mason", "Rill", "Ada", "Ox"]
        .into_iter()
        .zip(worker_positions)
    {
        state.spawn_worker(name, pos);
    }
    state
        .stockpiles
        .push(glyphweave_core::gameplay::Stockpile { area: core });
    state.inventory.add(ResourceKind::Food, 12);
    state.inventory.add(ResourceKind::Wood, 12);
    state.inventory.add(ResourceKind::Stone, 16);
    state.start_flood_fortress(core, dams, sources, breach_after_ticks);
    state
}

fn fill_rect(world: &mut World, a: TileCoord, b: TileCoord, kind: TileKind) {
    let area = TileArea::rect(a, b);
    for coord in area.iter() {
        set_tile(world, coord, kind);
    }
}

fn paint_line(world: &mut World, a: TileCoord, b: TileCoord, kind: TileKind) {
    if a.x == b.x {
        for y in a.y.min(b.y)..=a.y.max(b.y) {
            set_tile(world, TileCoord::new(a.x, y), kind);
        }
    } else if a.y == b.y {
        for x in a.x.min(b.x)..=a.x.max(b.x) {
            set_tile(world, TileCoord::new(x, a.y), kind);
        }
    }
}

fn scatter_trees(world: &mut World, origin: TileCoord, count: i32) {
    for index in 0..count {
        let x = origin.x + (index % 5) - 2;
        let y = origin.y + (index / 5);
        set_tile(world, TileCoord::new(x, y), TileKind::Tree);
    }
}

fn scatter_rocks(world: &mut World, origin: TileCoord, count: i32) {
    for index in 0..count {
        let x = origin.x + (index % 4) - 2;
        let y = origin.y + (index / 4);
        set_tile(world, TileCoord::new(x, y), TileKind::Wall);
    }
}

fn set_tile(world: &mut World, coord: TileCoord, kind: TileKind) {
    let layer = world.active_layer.clone();
    world.set(&layer, coord.x, coord.y, kind);
}
