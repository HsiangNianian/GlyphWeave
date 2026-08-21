use crate::gameplay::sim::{build_cost, is_choppable, is_mineable, rendered_tile_at};
use crate::gameplay::state::{GameState, JobKind, JobStatus, TileArea, TileCoord};
use crate::tile::TileKind;
use crate::world::World;
use serde::{Deserialize, Serialize};

const MAX_COMMAND_TILES: usize = 512;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum BuildKind {
    Wall,
    Floor,
    Door,
}

impl BuildKind {
    pub fn tile_kind(self) -> TileKind {
        match self {
            Self::Wall => TileKind::Wall,
            Self::Floor => TileKind::Floor,
            Self::Door => TileKind::Door,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BuildBlueprint {
    pub kind: BuildKind,
    pub area: TileArea,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum GameCommand {
    Mine { area: TileArea },
    Chop { area: TileArea },
    Build { blueprint: BuildBlueprint },
    Haul { from: TileArea, to: TileCoord },
    Explore { area: TileArea },
    SetStockpile { area: TileArea },
    SetCoreStorehouse { area: TileArea },
    Evacuate { area: TileArea },
    Cancel { area: TileArea },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CommandSourceKind {
    Human,
    NaturalLanguage,
    Voice,
    System,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CommandEnvelope {
    pub source: CommandSourceKind,
    pub command: GameCommand,
}

impl CommandEnvelope {
    pub fn human(command: GameCommand) -> Self {
        Self {
            source: CommandSourceKind::Human,
            command,
        }
    }
}

pub trait CommandSource {
    fn next_command(&mut self, world: &World, state: &GameState) -> Option<CommandEnvelope>;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CommandError {
    EmptyArea,
    AreaTooLarge { requested: usize, limit: usize },
    NoValidTargets,
    MissingStockpile,
    NoWorkers,
}

impl CommandError {
    /// Short player-facing explanation for previews and rejection messages.
    pub fn describe(&self) -> String {
        match self {
            Self::EmptyArea => "no tiles selected".to_string(),
            Self::AreaTooLarge { requested, limit } => {
                format!("area too large ({requested} > {limit} tiles)")
            }
            Self::NoValidTargets => "no valid targets in area".to_string(),
            Self::MissingStockpile => "no stockpile designated".to_string(),
            Self::NoWorkers => "no workers available".to_string(),
        }
    }
}

impl std::fmt::Display for CommandError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.describe())
    }
}

impl std::error::Error for CommandError {}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct CommandReceipt {
    pub jobs_created: usize,
    pub jobs_canceled: usize,
    pub stockpiles_created: usize,
    pub core_storehouse_set: bool,
    pub safe_zone_set: bool,
}

pub struct CommandDispatcher;

impl CommandDispatcher {
    /// Validate a command and report what it would do without mutating `state`.
    ///
    /// Previewing only inspects the affected area and relevant state, so it is
    /// cheap enough to run while the cursor moves without cloning `GameState`.
    pub fn preview(
        world: &World,
        state: &GameState,
        command: &GameCommand,
    ) -> Result<CommandReceipt, CommandError> {
        match command {
            GameCommand::Mine { area } => preview_area_jobs(world, *area, |world, coord| {
                is_mineable(rendered_tile_at(world, coord))
            }),
            GameCommand::Chop { area } => preview_area_jobs(world, *area, |world, coord| {
                is_choppable(rendered_tile_at(world, coord))
            }),
            GameCommand::Build { blueprint } => {
                preview_area_jobs(world, blueprint.area, |_, _| true)
            }
            GameCommand::Haul { from, .. } => {
                validate_area(*from)?;
                let jobs_created = state
                    .item_piles
                    .keys()
                    .filter(|coord| from.contains(**coord))
                    .take(MAX_COMMAND_TILES)
                    .count();
                if jobs_created == 0 {
                    return Err(CommandError::NoValidTargets);
                }
                Ok(CommandReceipt {
                    jobs_created,
                    ..CommandReceipt::default()
                })
            }
            GameCommand::Explore { area } => preview_area_jobs(world, *area, |_, _| true),
            GameCommand::SetStockpile { area } => {
                validate_area(*area)?;
                Ok(CommandReceipt {
                    stockpiles_created: 1,
                    ..CommandReceipt::default()
                })
            }
            GameCommand::SetCoreStorehouse { area } => {
                validate_area(*area)?;
                Ok(CommandReceipt {
                    core_storehouse_set: true,
                    ..CommandReceipt::default()
                })
            }
            GameCommand::Evacuate { area } => {
                validate_area(*area)?;
                let jobs_created = state
                    .workers
                    .values()
                    .filter(|worker| worker.can_work())
                    .count();
                if jobs_created == 0 {
                    return Err(CommandError::NoWorkers);
                }
                Ok(CommandReceipt {
                    jobs_created,
                    safe_zone_set: true,
                    ..CommandReceipt::default()
                })
            }
            GameCommand::Cancel { area } => {
                validate_area(*area)?;
                let jobs_canceled = state
                    .jobs
                    .iter()
                    .filter(|job| job.is_open() && area.contains(job.kind.target()))
                    .count();
                Ok(CommandReceipt {
                    jobs_canceled,
                    ..CommandReceipt::default()
                })
            }
        }
    }

    pub fn dispatch(
        world: &World,
        state: &mut GameState,
        envelope: CommandEnvelope,
    ) -> Result<CommandReceipt, CommandError> {
        match envelope.command {
            GameCommand::Mine { area } => queue_area_jobs(world, state, area, |world, coord| {
                is_mineable(rendered_tile_at(world, coord))
                    .then_some(JobKind::Mine { target: coord })
            }),
            GameCommand::Chop { area } => queue_area_jobs(world, state, area, |world, coord| {
                is_choppable(rendered_tile_at(world, coord))
                    .then_some(JobKind::Chop { target: coord })
            }),
            GameCommand::Build { blueprint } => {
                let tile = blueprint.kind.tile_kind();
                let cost = build_cost(tile);
                queue_area_jobs(world, state, blueprint.area, move |_, coord| {
                    Some(JobKind::Build {
                        target: coord,
                        tile_id: tile.id().to_string(),
                        cost: cost.clone(),
                    })
                })
            }
            GameCommand::Haul { from, to } => {
                validate_area(from)?;
                let mut created = 0;
                let coords: Vec<_> = state
                    .item_piles
                    .keys()
                    .copied()
                    .filter(|coord| from.contains(*coord))
                    .take(MAX_COMMAND_TILES)
                    .collect();
                for coord in coords {
                    state.push_job(JobKind::Haul { from: coord, to });
                    created += 1;
                }
                if created == 0 {
                    return Err(CommandError::NoValidTargets);
                }
                state.emit(format!("Queued {created} haul job(s)."));
                Ok(CommandReceipt {
                    jobs_created: created,
                    ..CommandReceipt::default()
                })
            }
            GameCommand::Explore { area } => queue_area_jobs(world, state, area, |_, coord| {
                Some(JobKind::Explore { target: coord })
            }),
            GameCommand::SetStockpile { area } => {
                validate_area(area)?;
                state
                    .stockpiles
                    .push(crate::gameplay::state::Stockpile { area });
                state.emit(format!(
                    "Marked stockpile {},{} to {},{}.",
                    area.min_x, area.min_y, area.max_x, area.max_y
                ));
                Ok(CommandReceipt {
                    stockpiles_created: 1,
                    ..CommandReceipt::default()
                })
            }
            GameCommand::SetCoreStorehouse { area } => {
                validate_area(area)?;
                state.set_core_storehouse(area);
                Ok(CommandReceipt {
                    core_storehouse_set: true,
                    ..CommandReceipt::default()
                })
            }
            GameCommand::Evacuate { area } => {
                validate_area(area)?;
                let target = area.center();
                let worker_count = state
                    .workers
                    .values()
                    .filter(|worker| worker.can_work())
                    .count();
                if worker_count == 0 {
                    return Err(CommandError::NoWorkers);
                }
                state.set_safe_zone(area);
                for _ in 0..worker_count {
                    state.push_job(JobKind::Evacuate { target });
                }
                state.emit(format!("Queued evacuation for {worker_count} worker(s)."));
                Ok(CommandReceipt {
                    jobs_created: worker_count,
                    safe_zone_set: true,
                    ..CommandReceipt::default()
                })
            }
            GameCommand::Cancel { area } => {
                validate_area(area)?;
                let mut canceled = 0;
                for job in &mut state.jobs {
                    if job.is_open() && area.contains(job.kind.target()) {
                        job.status = JobStatus::Canceled;
                        canceled += 1;
                    }
                }
                for worker in state.workers.values_mut() {
                    if let Some(job_id) = worker.assigned_job
                        && state.jobs.iter().any(|job| {
                            job.id == job_id && matches!(job.status, JobStatus::Canceled)
                        })
                    {
                        worker.assigned_job = None;
                    }
                }
                state.emit(format!("Canceled {canceled} job(s)."));
                Ok(CommandReceipt {
                    jobs_canceled: canceled,
                    ..CommandReceipt::default()
                })
            }
        }
    }
}

fn queue_area_jobs(
    world: &World,
    state: &mut GameState,
    area: TileArea,
    mut make_job: impl FnMut(&World, TileCoord) -> Option<JobKind>,
) -> Result<CommandReceipt, CommandError> {
    validate_area(area)?;
    let mut created = 0;
    for coord in area.iter().take(MAX_COMMAND_TILES) {
        let Some(kind) = make_job(world, coord) else {
            continue;
        };
        state.push_job(kind);
        created += 1;
    }
    if created == 0 {
        return Err(CommandError::NoValidTargets);
    }
    state.emit(format!("Queued {created} job(s)."));
    Ok(CommandReceipt {
        jobs_created: created,
        ..CommandReceipt::default()
    })
}

fn preview_area_jobs(
    world: &World,
    area: TileArea,
    mut is_valid_target: impl FnMut(&World, TileCoord) -> bool,
) -> Result<CommandReceipt, CommandError> {
    validate_area(area)?;
    let jobs_created = area
        .iter()
        .take(MAX_COMMAND_TILES)
        .filter(|coord| is_valid_target(world, *coord))
        .count();
    if jobs_created == 0 {
        return Err(CommandError::NoValidTargets);
    }
    Ok(CommandReceipt {
        jobs_created,
        ..CommandReceipt::default()
    })
}

fn validate_area(area: TileArea) -> Result<(), CommandError> {
    let len = area.len();
    if len == 0 {
        return Err(CommandError::EmptyArea);
    }
    if len > MAX_COMMAND_TILES {
        return Err(CommandError::AreaTooLarge {
            requested: len,
            limit: MAX_COMMAND_TILES,
        });
    }
    Ok(())
}

#[derive(Debug, Clone)]
pub struct RuleBasedTextCommandSource {
    queue: std::collections::VecDeque<CommandEnvelope>,
}

impl RuleBasedTextCommandSource {
    pub fn from_text(text: &str, focus: TileCoord) -> Result<Self, String> {
        let command = parse_text_command(text, focus)?;
        Ok(Self {
            queue: std::collections::VecDeque::from([CommandEnvelope {
                source: CommandSourceKind::NaturalLanguage,
                command,
            }]),
        })
    }
}

impl CommandSource for RuleBasedTextCommandSource {
    fn next_command(&mut self, _world: &World, _state: &GameState) -> Option<CommandEnvelope> {
        self.queue.pop_front()
    }
}

fn parse_text_command(text: &str, focus: TileCoord) -> Result<GameCommand, String> {
    let normalized = text.trim().to_lowercase();
    if normalized.is_empty() {
        return Err("empty command".into());
    }
    let area = parse_area_hint(&normalized, focus);
    if normalized.contains("stockpile")
        || normalized.contains("仓库")
        || normalized.contains("储物")
    {
        if normalized.contains("core")
            || normalized.contains("heart")
            || normalized.contains("核心")
            || normalized.contains("中心")
        {
            return Ok(GameCommand::SetCoreStorehouse { area });
        }
        return Ok(GameCommand::SetStockpile { area });
    }
    if normalized.contains("evacuate")
        || normalized.contains("safe")
        || normalized.contains("撤离")
        || normalized.contains("安全区")
    {
        return Ok(GameCommand::Evacuate { area });
    }
    if normalized.contains("cancel") || normalized.contains("取消") {
        return Ok(GameCommand::Cancel { area });
    }
    if normalized.contains("haul") || normalized.contains("搬") || normalized.contains("运") {
        return Ok(GameCommand::Haul {
            from: area,
            to: focus,
        });
    }
    if normalized.contains("chop") || normalized.contains("tree") || normalized.contains("砍") {
        return Ok(GameCommand::Chop { area });
    }
    if normalized.contains("mine") || normalized.contains("dig") || normalized.contains("挖") {
        return Ok(GameCommand::Mine { area });
    }
    if normalized.contains("explore") || normalized.contains("探索") {
        return Ok(GameCommand::Explore { area });
    }
    if normalized.contains("door") || normalized.contains("门") {
        return Ok(GameCommand::Build {
            blueprint: BuildBlueprint {
                kind: BuildKind::Door,
                area,
            },
        });
    }
    if normalized.contains("floor") || normalized.contains("地板") {
        return Ok(GameCommand::Build {
            blueprint: BuildBlueprint {
                kind: BuildKind::Floor,
                area,
            },
        });
    }
    if normalized.contains("wall")
        || normalized.contains("build")
        || normalized.contains("造")
        || normalized.contains("墙")
    {
        return Ok(GameCommand::Build {
            blueprint: BuildBlueprint {
                kind: BuildKind::Wall,
                area,
            },
        });
    }
    Err(format!("could not parse command: {text}"))
}

fn parse_area_hint(text: &str, focus: TileCoord) -> TileArea {
    let radius = if text.contains("large") || text.contains("大片") {
        4
    } else if text.contains("small") || text.contains("小片") {
        1
    } else if text.contains("area") || text.contains("这片") || text.contains("附近") {
        2
    } else {
        0
    };
    TileArea::centered(focus, radius)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gameplay::state::GameState;

    #[test]
    fn text_parser_supports_chinese_mine_area() {
        let mut source = RuleBasedTextCommandSource::from_text("挖掉这片墙", TileCoord::new(5, 6))
            .expect("parse");
        let envelope = source
            .next_command(&World::default(), &GameState::default())
            .unwrap();
        match envelope.command {
            GameCommand::Mine { area } => {
                assert!(area.contains(TileCoord::new(5, 6)));
                assert!(area.len() > 1);
            }
            other => panic!("unexpected command: {other:?}"),
        }
    }

    #[test]
    fn dispatcher_queues_only_valid_mine_targets() {
        let mut world = World::default();
        let layer = world.active_layer.clone();
        world.set(&layer, 0, 0, TileKind::Wall);
        world.set(&layer, 1, 0, TileKind::Floor);
        let mut state = GameState::default();

        let receipt = CommandDispatcher::dispatch(
            &world,
            &mut state,
            CommandEnvelope::human(GameCommand::Mine {
                area: TileArea::rect(TileCoord::new(0, 0), TileCoord::new(1, 0)),
            }),
        )
        .unwrap();

        assert_eq!(receipt.jobs_created, 1);
        assert_eq!(state.jobs.len(), 1);
    }

    #[test]
    fn preview_reports_receipt_without_mutating_state() {
        let mut world = World::default();
        let layer = world.active_layer.clone();
        world.set(&layer, 0, 0, TileKind::Wall);
        let mut state = GameState::default();
        let before = state.jobs.len();

        let receipt = CommandDispatcher::preview(
            &world,
            &state,
            &GameCommand::Mine {
                area: TileArea::centered(TileCoord::new(0, 0), 0),
            },
        )
        .unwrap();

        assert_eq!(receipt.jobs_created, 1);
        assert_eq!(state.jobs.len(), before, "preview must not queue jobs");
        assert!(state.events.is_empty(), "preview must not emit events");

        // The real dispatch on the same input produces the same receipt.
        let real = CommandDispatcher::dispatch(
            &world,
            &mut state,
            CommandEnvelope::human(GameCommand::Mine {
                area: TileArea::centered(TileCoord::new(0, 0), 0),
            }),
        )
        .unwrap();
        assert_eq!(real.jobs_created, receipt.jobs_created);
    }

    #[test]
    fn preview_surfaces_dispatch_errors() {
        let world = World::default();
        let state = GameState::default();
        let err = CommandDispatcher::preview(
            &world,
            &state,
            &GameCommand::Mine {
                area: TileArea::centered(TileCoord::new(0, 0), 0),
            },
        )
        .unwrap_err();
        assert_eq!(err, CommandError::NoValidTargets);
        assert_eq!(err.describe(), "no valid targets in area");
    }

    #[test]
    fn dispatcher_sets_stockpile_without_jobs() {
        let mut state = GameState::default();
        let area = TileArea::centered(TileCoord::new(2, 2), 1);
        let receipt = CommandDispatcher::dispatch(
            &World::default(),
            &mut state,
            CommandEnvelope::human(GameCommand::SetStockpile { area }),
        )
        .unwrap();

        assert_eq!(receipt.stockpiles_created, 1);
        assert_eq!(state.stockpiles[0].area, area);
    }

    #[test]
    fn dispatcher_sets_core_and_evacuates_workers() {
        let mut state = GameState::new_with_worker(TileCoord::new(0, 0));
        let core = TileArea::centered(TileCoord::new(2, 2), 1);
        let receipt = CommandDispatcher::dispatch(
            &World::default(),
            &mut state,
            CommandEnvelope::human(GameCommand::SetCoreStorehouse { area: core }),
        )
        .unwrap();
        assert!(receipt.core_storehouse_set);
        assert_eq!(state.core_storehouse.map(|core| core.area), Some(core));

        let safe = TileArea::centered(TileCoord::new(5, 0), 1);
        let receipt = CommandDispatcher::dispatch(
            &World::default(),
            &mut state,
            CommandEnvelope::human(GameCommand::Evacuate { area: safe }),
        )
        .unwrap();

        assert!(receipt.safe_zone_set);
        assert_eq!(receipt.jobs_created, 1);
        assert_eq!(state.safe_zone.map(|zone| zone.area), Some(safe));
        assert!(matches!(state.jobs[0].kind, JobKind::Evacuate { .. }));
    }
}
