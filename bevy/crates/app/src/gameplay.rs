//! Bevy-side sandbox gameplay integration.
//!
//! The core gameplay crate owns rules and state transitions. This module only
//! maps Bevy input/UI/render resources onto those core commands and ticks.

use crate::render::tilemap::RenderRefresh;
use crate::resource::{CursorTile, EditEvent, WorldModel, WorldRevision};
use bevy::ecs::message::MessageWriter;
use bevy::prelude::*;
use glyphweave_core::gameplay::{
    BuildBlueprint, BuildKind, CommandDispatcher, CommandEnvelope, CommandError, CommandSource,
    GameCommand, GameState, ResourceKind, RuleBasedTextCommandSource, SimulationConfig, TileArea,
    TileCoord, tick_gameplay,
};
use glyphweave_core::world::World;
use std::collections::{HashMap, HashSet};

#[derive(Resource, Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum GameMode {
    #[default]
    Edit,
    Play,
}

impl GameMode {
    pub fn toggle(&mut self) {
        *self = match self {
            Self::Edit => Self::Play,
            Self::Play => Self::Edit,
        };
    }
}

#[derive(Resource, Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ActiveGameOrder {
    Mine,
    Chop,
    BuildWall,
    BuildFloor,
    BuildDoor,
    Haul,
    Explore,
    Stockpile,
    CoreStorehouse,
    Evacuate,
    Cancel,
    #[default]
    Inspect,
}

impl ActiveGameOrder {
    pub const ALL: [ActiveGameOrder; 12] = [
        ActiveGameOrder::Mine,
        ActiveGameOrder::Chop,
        ActiveGameOrder::BuildWall,
        ActiveGameOrder::BuildFloor,
        ActiveGameOrder::BuildDoor,
        ActiveGameOrder::Haul,
        ActiveGameOrder::Explore,
        ActiveGameOrder::Stockpile,
        ActiveGameOrder::CoreStorehouse,
        ActiveGameOrder::Evacuate,
        ActiveGameOrder::Cancel,
        ActiveGameOrder::Inspect,
    ];

    pub fn label(self) -> &'static str {
        match self {
            Self::Mine => "Mine",
            Self::Chop => "Chop",
            Self::BuildWall => "Wall",
            Self::BuildFloor => "Floor",
            Self::BuildDoor => "Door",
            Self::Haul => "Haul",
            Self::Explore => "Explore",
            Self::Stockpile => "Stockpile",
            Self::CoreStorehouse => "Core",
            Self::Evacuate => "Evac",
            Self::Cancel => "Cancel",
            Self::Inspect => "Inspect",
        }
    }
}

#[derive(Resource, Debug, Clone)]
pub struct GameplayModel(pub GameState);

impl Default for GameplayModel {
    fn default() -> Self {
        Self(GameState::new_with_worker(TileCoord::new(0, 0)))
    }
}

impl std::ops::Deref for GameplayModel {
    type Target = GameState;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl std::ops::DerefMut for GameplayModel {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}

#[derive(Resource, Debug, Clone)]
pub struct GameplayTickTimer(pub Timer);

impl Default for GameplayTickTimer {
    fn default() -> Self {
        Self(Timer::from_seconds(0.12, TimerMode::Repeating))
    }
}

#[derive(Resource, Default, Debug)]
pub struct GameplayVisualEntities {
    workers: HashMap<u64, Entity>,
    monsters: HashMap<u64, Entity>,
    item_piles: HashMap<TileCoord, Entity>,
}

#[derive(Component)]
pub struct GameplayVisual;

pub fn is_edit_mode(mode: Res<GameMode>) -> bool {
    *mode == GameMode::Edit
}

pub fn is_play_mode(mode: Res<GameMode>) -> bool {
    *mode == GameMode::Play
}

pub fn init_gameplay_state(mut commands: Commands, world_model: Res<WorldModel>) {
    commands.insert_resource(GameplayModel(GameState::new_with_worker(
        spawn_coord_for_world(&world_model.0),
    )));
}

pub fn reset_gameplay_for_world(gameplay: &mut GameplayModel, world: &World) {
    gameplay.0 = GameState::new_with_worker(spawn_coord_for_world(world));
}

pub fn seed_perf_gameplay_entities(gameplay: &mut GameplayModel, world: &World, count: usize) {
    let anchor = spawn_coord_for_world(world);
    gameplay.0 = GameState::default();
    gameplay
        .stockpiles
        .push(glyphweave_core::gameplay::Stockpile {
            area: TileArea::centered(anchor, 4),
        });

    for index in 0..count {
        let coord = perf_coord(anchor, index);
        let coord = if glyphweave_core::gameplay::is_passable(
            glyphweave_core::gameplay::rendered_tile_at(world, coord),
        ) {
            coord
        } else {
            anchor
        };
        match index % 3 {
            0 => {
                gameplay.spawn_worker(format!("Worker {}", index / 3 + 1), coord);
            }
            1 => {
                let resource = if index % 2 == 0 {
                    ResourceKind::Stone
                } else {
                    ResourceKind::Wood
                };
                gameplay.add_item_pile(coord, resource, 1);
            }
            _ => {
                gameplay.spawn_monster(coord);
            }
        }
    }
    gameplay.emit(format!("Seeded {count} perf gameplay entities."));
}

pub fn command_for_order(
    order: ActiveGameOrder,
    cursor: TileCoord,
    area_radius: i32,
    state: &GameState,
) -> Option<GameCommand> {
    let area = TileArea::centered(cursor, area_radius);
    match order {
        ActiveGameOrder::Mine => Some(GameCommand::Mine { area }),
        ActiveGameOrder::Chop => Some(GameCommand::Chop { area }),
        ActiveGameOrder::BuildWall => Some(GameCommand::Build {
            blueprint: BuildBlueprint {
                kind: BuildKind::Wall,
                area,
            },
        }),
        ActiveGameOrder::BuildFloor => Some(GameCommand::Build {
            blueprint: BuildBlueprint {
                kind: BuildKind::Floor,
                area,
            },
        }),
        ActiveGameOrder::BuildDoor => Some(GameCommand::Build {
            blueprint: BuildBlueprint {
                kind: BuildKind::Door,
                area,
            },
        }),
        ActiveGameOrder::Haul => state
            .stockpile_target()
            .map(|to| GameCommand::Haul { from: area, to }),
        ActiveGameOrder::Explore => Some(GameCommand::Explore { area }),
        ActiveGameOrder::Stockpile => Some(GameCommand::SetStockpile { area }),
        ActiveGameOrder::CoreStorehouse => Some(GameCommand::SetCoreStorehouse { area }),
        ActiveGameOrder::Evacuate => Some(GameCommand::Evacuate { area }),
        ActiveGameOrder::Cancel => Some(GameCommand::Cancel { area }),
        ActiveGameOrder::Inspect => None,
    }
}

pub fn dispatch_text_command(
    text: &str,
    focus: TileCoord,
    world: &World,
    gameplay: &mut GameplayModel,
) -> Result<(), String> {
    let mut source = RuleBasedTextCommandSource::from_text(text, focus)?;
    let Some(envelope) = source.next_command(world, &gameplay.0) else {
        return Err("text command produced no order".into());
    };
    dispatch_envelope(world, gameplay, envelope).map(|_| ())
}

pub fn gameplay_order_input(
    buttons: Res<ButtonInput<MouseButton>>,
    keys: Res<ButtonInput<KeyCode>>,
    cursor: Res<CursorTile>,
    active_order: Res<ActiveGameOrder>,
    world_model: Res<WorldModel>,
    mut gameplay: ResMut<GameplayModel>,
) {
    if !buttons.just_pressed(MouseButton::Left) || !cursor.valid {
        return;
    }
    let area_radius = if keys.pressed(KeyCode::ShiftLeft) || keys.pressed(KeyCode::ShiftRight) {
        2
    } else {
        0
    };
    let focus = TileCoord::new(cursor.x, cursor.y);
    let Some(command) = command_for_order(*active_order, focus, area_radius, &gameplay.0) else {
        return;
    };
    if let Err(err) = dispatch_envelope(
        &world_model.0,
        &mut gameplay,
        CommandEnvelope::human(command),
    ) {
        gameplay.emit(format!("Command rejected: {err}."));
    }
}

pub fn gameplay_hotkeys(
    keys: Res<ButtonInput<KeyCode>>,
    mut mode: ResMut<GameMode>,
    mut active_order: ResMut<ActiveGameOrder>,
) {
    if keys.just_pressed(KeyCode::Tab) {
        mode.toggle();
    }
    if *mode != GameMode::Play {
        return;
    }

    if keys.just_pressed(KeyCode::KeyM) {
        *active_order = ActiveGameOrder::Mine;
    } else if keys.just_pressed(KeyCode::KeyC) {
        *active_order = ActiveGameOrder::Chop;
    } else if keys.just_pressed(KeyCode::KeyW) {
        *active_order = ActiveGameOrder::BuildWall;
    } else if keys.just_pressed(KeyCode::KeyH) {
        *active_order = ActiveGameOrder::Haul;
    } else if keys.just_pressed(KeyCode::KeyX) {
        *active_order = ActiveGameOrder::Cancel;
    } else if keys.just_pressed(KeyCode::KeyO) {
        *active_order = ActiveGameOrder::Explore;
    } else if keys.just_pressed(KeyCode::KeyV) {
        *active_order = ActiveGameOrder::Evacuate;
    } else if keys.just_pressed(KeyCode::KeyK) {
        *active_order = ActiveGameOrder::CoreStorehouse;
    }
}

#[allow(clippy::too_many_arguments)]
pub fn tick_gameplay_system(
    time: Res<Time>,
    mut timer: ResMut<GameplayTickTimer>,
    mut world_model: ResMut<WorldModel>,
    mut gameplay: ResMut<GameplayModel>,
    mut world_revision: ResMut<WorldRevision>,
    mut writer: MessageWriter<EditEvent>,
    mut refresh: ResMut<RenderRefresh>,
) {
    if !timer.0.tick(time.delta()).just_finished() {
        return;
    }

    let result = tick_gameplay(
        &mut world_model.0,
        &mut gameplay.0,
        SimulationConfig::default(),
    );
    if result.tile_changes.is_empty() {
        return;
    }

    world_revision.0 = world_revision.0.wrapping_add(1);
    for coord in result.tile_changes {
        writer.write(EditEvent {
            x: coord.x,
            y: coord.y,
        });
    }
    refresh.0 = true;
}

pub fn sync_gameplay_entities(
    mut commands: Commands,
    world_model: Res<WorldModel>,
    gameplay: Res<GameplayModel>,
    mut visuals: ResMut<GameplayVisualEntities>,
    mut transforms: Query<(&mut Transform, &mut Sprite), With<GameplayVisual>>,
) {
    let tile_px = world_model.tile_size.max(1) as f32;

    let worker_ids: HashSet<_> = gameplay.workers.keys().copied().collect();
    for worker in gameplay.workers.values() {
        let entity = *visuals.workers.entry(worker.id).or_insert_with(|| {
            spawn_visual(
                &mut commands,
                worker.pos,
                tile_px,
                Color::srgba(0.35, 0.72, 1.0, 0.95),
                0.58,
                5.0,
            )
        });
        update_visual(
            entity,
            worker.pos,
            tile_px,
            Color::srgba(0.35, 0.72, 1.0, 0.95),
            0.58,
            5.0,
            &mut transforms,
        );
    }
    despawn_missing(&mut commands, &mut visuals.workers, &worker_ids);

    let monster_ids: HashSet<_> = gameplay.monsters.keys().copied().collect();
    for monster in gameplay.monsters.values() {
        let entity = *visuals.monsters.entry(monster.id).or_insert_with(|| {
            spawn_visual(
                &mut commands,
                monster.pos,
                tile_px,
                Color::srgba(0.92, 0.18, 0.14, 0.95),
                0.6,
                5.2,
            )
        });
        update_visual(
            entity,
            monster.pos,
            tile_px,
            Color::srgba(0.92, 0.18, 0.14, 0.95),
            0.6,
            5.2,
            &mut transforms,
        );
    }
    despawn_missing(&mut commands, &mut visuals.monsters, &monster_ids);

    let pile_coords: HashSet<_> = gameplay.item_piles.keys().copied().collect();
    for pile in gameplay.item_piles.values() {
        let color = item_pile_color(&pile.items);
        let entity = *visuals
            .item_piles
            .entry(pile.pos)
            .or_insert_with(|| spawn_visual(&mut commands, pile.pos, tile_px, color, 0.38, 4.7));
        update_visual(entity, pile.pos, tile_px, color, 0.38, 4.7, &mut transforms);
    }
    despawn_missing(&mut commands, &mut visuals.item_piles, &pile_coords);
}

pub fn draw_gameplay_overlays(
    mode: Res<GameMode>,
    world_model: Res<WorldModel>,
    gameplay: Res<GameplayModel>,
    mut gizmos: Gizmos,
) {
    if *mode != GameMode::Play {
        return;
    }
    let tile_px = world_model.tile_size.max(1) as f32;

    for stockpile in &gameplay.stockpiles {
        let left = stockpile.area.min_x as f32 * tile_px;
        let right = (stockpile.area.max_x + 1) as f32 * tile_px;
        let top = -(stockpile.area.min_y as f32) * tile_px;
        let bottom = -((stockpile.area.max_y + 1) as f32) * tile_px;
        let center = Vec2::new((left + right) * 0.5, (top + bottom) * 0.5);
        let size = Vec2::new(right - left, top - bottom);
        gizmos.rect_2d(
            Isometry2d::from_translation(center),
            size,
            Color::srgba(0.3, 0.95, 0.55, 0.75),
        );
    }

    if let Some(core) = gameplay.core_storehouse {
        draw_area_rect(
            &mut gizmos,
            core.area,
            tile_px,
            Color::srgba(0.25, 0.8, 1.0, 0.9),
        );
    }

    if let Some(safe_zone) = gameplay.safe_zone {
        draw_area_rect(
            &mut gizmos,
            safe_zone.area,
            tile_px,
            Color::srgba(0.55, 1.0, 0.3, 0.85),
        );
    }

    if let Some(challenge) = &gameplay.challenge {
        for dam in &challenge.flood.old_dams {
            let color = if dam.breached {
                Color::srgba(0.2, 0.55, 1.0, 0.9)
            } else {
                Color::srgba(1.0, 0.45, 0.1, 0.9)
            };
            gizmos.rect_2d(
                Isometry2d::from_translation(tile_center(dam.pos, tile_px)),
                Vec2::splat(tile_px * 0.92),
                color,
            );
        }
    }

    for job in gameplay.jobs.iter().filter(|job| job.is_open()) {
        let target = job.kind.target();
        let center = tile_center(target, tile_px);
        gizmos.rect_2d(
            Isometry2d::from_translation(center),
            Vec2::splat(tile_px * 0.86),
            Color::srgba(1.0, 0.86, 0.25, 0.7),
        );
    }
}

fn dispatch_envelope(
    world: &World,
    gameplay: &mut GameplayModel,
    envelope: CommandEnvelope,
) -> Result<(), String> {
    CommandDispatcher::dispatch(world, &mut gameplay.0, envelope)
        .map(|_| ())
        .map_err(command_error_label)
}

fn command_error_label(err: CommandError) -> String {
    match err {
        CommandError::EmptyArea => "empty area".into(),
        CommandError::AreaTooLarge { requested, limit } => {
            format!("area too large ({requested} > {limit})")
        }
        CommandError::NoValidTargets => "no valid targets".into(),
        CommandError::MissingStockpile => "missing stockpile".into(),
        CommandError::NoWorkers => "no workers".into(),
    }
}

fn spawn_coord_for_world(world: &World) -> TileCoord {
    let origin = TileCoord::new(0, 0);
    if glyphweave_core::gameplay::is_passable(glyphweave_core::gameplay::rendered_tile_at(
        world, origin,
    )) {
        return origin;
    }

    world
        .layers
        .iter()
        .filter_map(|layer| world.grid(&layer.id))
        .flat_map(|grid| grid.iter_tiles())
        .find_map(|((x, y), kind)| {
            glyphweave_core::gameplay::is_passable(Some(kind)).then_some(TileCoord::new(x, y))
        })
        .unwrap_or(origin)
}

fn perf_coord(anchor: TileCoord, index: usize) -> TileCoord {
    let side = ((index as f32).sqrt().ceil() as i32).max(1);
    let row = index as i32 / side;
    let col = index as i32 % side;
    TileCoord::new(anchor.x + col - side / 2, anchor.y + row - side / 2)
}

fn spawn_visual(
    commands: &mut Commands,
    coord: TileCoord,
    tile_px: f32,
    color: Color,
    size_ratio: f32,
    z: f32,
) -> Entity {
    commands
        .spawn((
            GameplayVisual,
            Sprite {
                color,
                custom_size: Some(Vec2::splat(tile_px * size_ratio)),
                ..default()
            },
            Transform::from_translation(tile_center(coord, tile_px).extend(z)),
        ))
        .id()
}

fn update_visual(
    entity: Entity,
    coord: TileCoord,
    tile_px: f32,
    color: Color,
    size_ratio: f32,
    z: f32,
    transforms: &mut Query<(&mut Transform, &mut Sprite), With<GameplayVisual>>,
) {
    let Ok((mut transform, mut sprite)) = transforms.get_mut(entity) else {
        return;
    };
    transform.translation = tile_center(coord, tile_px).extend(z);
    sprite.color = color;
    sprite.custom_size = Some(Vec2::splat(tile_px * size_ratio));
}

fn despawn_missing<K>(
    commands: &mut Commands,
    entities: &mut HashMap<K, Entity>,
    present: &HashSet<K>,
) where
    K: Copy + Eq + std::hash::Hash,
{
    let stale: Vec<K> = entities
        .keys()
        .copied()
        .filter(|key| !present.contains(key))
        .collect();
    for key in stale {
        if let Some(entity) = entities.remove(&key) {
            commands.entity(entity).despawn();
        }
    }
}

fn tile_center(coord: TileCoord, tile_px: f32) -> Vec2 {
    Vec2::new(
        (coord.x as f32 + 0.5) * tile_px,
        -((coord.y as f32 + 0.5) * tile_px),
    )
}

fn draw_area_rect(gizmos: &mut Gizmos, area: TileArea, tile_px: f32, color: Color) {
    let left = area.min_x as f32 * tile_px;
    let right = (area.max_x + 1) as f32 * tile_px;
    let top = -(area.min_y as f32) * tile_px;
    let bottom = -((area.max_y + 1) as f32) * tile_px;
    let center = Vec2::new((left + right) * 0.5, (top + bottom) * 0.5);
    let size = Vec2::new(right - left, top - bottom);
    gizmos.rect_2d(Isometry2d::from_translation(center), size, color);
}

fn item_pile_color(items: &glyphweave_core::gameplay::Inventory) -> Color {
    if items.get(ResourceKind::Wood) > 0 {
        Color::srgba(0.75, 0.45, 0.22, 0.95)
    } else if items.get(ResourceKind::Stone) > 0 {
        Color::srgba(0.68, 0.68, 0.72, 0.95)
    } else if items.get(ResourceKind::Food) > 0 {
        Color::srgba(0.45, 0.78, 0.28, 0.95)
    } else {
        Color::srgba(0.95, 0.78, 0.25, 0.95)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn active_order_maps_to_build_command() {
        let state = GameState::new_with_worker(TileCoord::new(0, 0));
        let command =
            command_for_order(ActiveGameOrder::BuildWall, TileCoord::new(2, 3), 0, &state).unwrap();

        match command {
            GameCommand::Build { blueprint } => {
                assert_eq!(blueprint.kind, BuildKind::Wall);
                assert_eq!(blueprint.area.center(), TileCoord::new(2, 3));
            }
            other => panic!("unexpected command: {other:?}"),
        }
    }

    #[test]
    fn text_command_queues_jobs_via_shared_dispatcher() {
        let mut world = World::default();
        let layer = world.active_layer.clone();
        world.set(&layer, 0, 0, glyphweave_core::tile::TileKind::Tree);
        let mut gameplay = GameplayModel(GameState::new_with_worker(TileCoord::new(1, 0)));

        dispatch_text_command("砍树", TileCoord::new(0, 0), &world, &mut gameplay).unwrap();

        assert_eq!(gameplay.open_job_count(), 1);
    }
}
