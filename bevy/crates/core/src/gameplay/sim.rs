use crate::gameplay::state::{
    ChallengeScore, ChallengeStatus, GameState, Inventory, JobKind, JobStatus, MedalTier,
    ResourceKind, TileCoord, Worker, WorkerStatus,
};
use crate::tile::TileKind;
use crate::world::World;
use std::collections::{HashMap, HashSet, VecDeque};

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SimulationConfig {
    pub minutes_per_tick: u32,
    pub job_work_ticks: u32,
    pub max_path_nodes: usize,
    pub hunger_decay_interval: u64,
    pub monster_spawn_interval: u64,
    pub max_monsters: usize,
    pub water_spread_interval: u64,
    pub core_flood_failure_ticks: u32,
}

impl Default for SimulationConfig {
    fn default() -> Self {
        Self {
            minutes_per_tick: 5,
            job_work_ticks: 4,
            max_path_nodes: 4096,
            hunger_decay_interval: 24,
            monster_spawn_interval: 120,
            max_monsters: 6,
            water_spread_interval: 2,
            core_flood_failure_ticks: 8,
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct TickResult {
    pub tile_changes: Vec<TileCoord>,
    pub jobs_completed: usize,
    pub jobs_failed: usize,
    pub monsters_spawned: usize,
    pub attacks: usize,
    pub water_tiles_changed: usize,
    pub challenge_ended: bool,
}

pub fn tick_gameplay(
    world: &mut World,
    state: &mut GameState,
    config: SimulationConfig,
) -> TickResult {
    let mut result = TickResult::default();
    state.time.advance(config.minutes_per_tick);
    state.fog.begin_frame();

    tick_flood_fortress(world, state, config, &mut result);
    assign_jobs(state);

    let worker_ids: Vec<_> = state.workers.keys().copied().collect();
    for worker_id in worker_ids {
        let Some(mut worker) = state.workers.remove(&worker_id) else {
            continue;
        };
        tick_worker(world, state, &mut worker, config, &mut result);
        state.fog.reveal(worker.pos);
        state.workers.insert(worker_id, worker);
    }

    maybe_spawn_monster(world, state, config, &mut result);
    tick_monsters(world, state, config, &mut result);
    tick_challenge_outcome(state, config, &mut result);
    result
}

pub fn rendered_tile_at(world: &World, coord: TileCoord) -> Option<TileKind> {
    world.layers.iter().rev().find_map(|layer| {
        if !layer.visible {
            return None;
        }
        let kind = world.grid(&layer.id)?.get(coord.x, coord.y)?;
        (!matches!(kind, TileKind::Void)).then_some(kind)
    })
}

pub fn is_passable(kind: Option<TileKind>) -> bool {
    match kind {
        None | Some(TileKind::Void) => true,
        Some(
            TileKind::Floor
            | TileKind::FloorAlt
            | TileKind::Door
            | TileKind::DoorOpen
            | TileKind::Grass
            | TileKind::Bridge
            | TileKind::StairsDown
            | TileKind::StairsUp
            | TileKind::Altar
            | TileKind::Fountain
            | TileKind::Grave
            | TileKind::Trap
            | TileKind::Treasure
            | TileKind::Shop
            | TileKind::Table
            | TileKind::Throne
            | TileKind::Blood,
        ) => true,
        Some(
            TileKind::Wall
            | TileKind::Water
            | TileKind::DeepWater
            | TileKind::Lava
            | TileKind::Tree
            | TileKind::Pillar
            | TileKind::Cage
            | TileKind::Bar,
        ) => false,
    }
}

pub fn is_gameplay_passable(world: &World, state: &GameState, coord: TileCoord) -> bool {
    match state.water_level(coord) {
        0 => is_passable(rendered_tile_at(world, coord)),
        1 => is_shallow_water_walkable(rendered_tile_at(world, coord)),
        _ => false,
    }
}

fn is_shallow_water_walkable(kind: Option<TileKind>) -> bool {
    !matches!(
        kind,
        Some(
            TileKind::Wall
                | TileKind::DeepWater
                | TileKind::Lava
                | TileKind::Tree
                | TileKind::Pillar
                | TileKind::Cage
                | TileKind::Bar
        )
    )
}

pub fn is_mineable(kind: Option<TileKind>) -> bool {
    matches!(
        kind,
        Some(TileKind::Wall | TileKind::Pillar | TileKind::Bar)
    )
}

pub fn is_choppable(kind: Option<TileKind>) -> bool {
    matches!(kind, Some(TileKind::Tree))
}

pub fn resource_from_mine(kind: TileKind) -> Option<ResourceKind> {
    match kind {
        TileKind::Wall | TileKind::Pillar | TileKind::Bar => Some(ResourceKind::Stone),
        _ => None,
    }
}

pub fn resource_from_chop(kind: TileKind) -> Option<ResourceKind> {
    match kind {
        TileKind::Tree => Some(ResourceKind::Wood),
        _ => None,
    }
}

pub fn build_cost(kind: TileKind) -> Inventory {
    let mut cost = Inventory::default();
    match kind {
        TileKind::Wall | TileKind::Pillar | TileKind::Bar => cost.add(ResourceKind::Stone, 1),
        TileKind::Door | TileKind::DoorOpen | TileKind::Bridge => cost.add(ResourceKind::Wood, 1),
        TileKind::Floor | TileKind::FloorAlt => cost.add(ResourceKind::Stone, 1),
        _ => {}
    }
    cost
}

fn tick_flood_fortress(
    world: &mut World,
    state: &mut GameState,
    config: SimulationConfig,
    result: &mut TickResult,
) {
    let Some(challenge) = state.challenge.as_ref() else {
        return;
    };
    if !challenge.status.is_running() {
        return;
    }

    breach_old_dams(world, state, result);

    if flood_has_breached(state)
        && (config.water_spread_interval == 0
            || state.time.tick.is_multiple_of(config.water_spread_interval))
    {
        spread_water(world, state, result);
    }

    update_core_flooding(state);
}

fn breach_old_dams(world: &mut World, state: &mut GameState, result: &mut TickResult) {
    let should_breach = state
        .challenge
        .as_ref()
        .map(|challenge| state.time.tick >= challenge.flood.breach_tick)
        .unwrap_or(false);
    if !should_breach {
        return;
    }

    let mut breached = Vec::new();
    if let Some(challenge) = state.challenge.as_mut() {
        for dam in &mut challenge.flood.old_dams {
            if dam.breached {
                continue;
            }
            dam.breached = true;
            challenge.flood.water_levels.insert(dam.pos, 3);
            breached.push(dam.pos);
        }
    }

    if breached.is_empty() {
        return;
    }

    let layer = world.active_layer.clone();
    for coord in breached {
        world.set(&layer, coord.x, coord.y, TileKind::DeepWater);
        result.tile_changes.push(coord);
        result.water_tiles_changed += 1;
        state.emit(format!(
            "The old dam at {},{} failed. Excellent planning, everyone.",
            coord.x, coord.y
        ));
    }
}

fn flood_has_breached(state: &GameState) -> bool {
    state
        .challenge
        .as_ref()
        .map(|challenge| challenge.flood.old_dams.iter().any(|dam| dam.breached))
        .unwrap_or(false)
}

fn spread_water(world: &mut World, state: &mut GameState, result: &mut TickResult) {
    let Some(challenge) = state.challenge.as_ref() else {
        return;
    };
    let mut next_levels = challenge.flood.water_levels.clone();

    for source in &challenge.flood.water_sources {
        let current = next_levels.get(&source.pos).copied().unwrap_or(0);
        next_levels.insert(source.pos, current.max(source.max_level));
    }

    let current_levels: Vec<(TileCoord, u8)> = next_levels
        .iter()
        .map(|(coord, level)| (*coord, *level))
        .collect();
    for (coord, level) in current_levels {
        if level <= 1 {
            continue;
        }
        let neighbor_level = level - 1;
        for neighbor in coord.neighbors4() {
            if !water_can_enter(world, neighbor) {
                continue;
            }
            let current = next_levels.get(&neighbor).copied().unwrap_or(0);
            if neighbor_level > current {
                next_levels.insert(neighbor, neighbor_level);
            }
        }
    }

    let mut changed = Vec::new();
    if let Some(challenge) = state.challenge.as_mut() {
        for (coord, level) in &next_levels {
            let old = challenge
                .flood
                .water_levels
                .get(coord)
                .copied()
                .unwrap_or(0);
            if *level != old {
                changed.push((*coord, *level));
            }
        }
        challenge.flood.water_levels = next_levels;
        challenge.flood.stats.max_flooded_tiles = challenge
            .flood
            .stats
            .max_flooded_tiles
            .max(challenge.flood.water_levels.len());
    }

    let layer = world.active_layer.clone();
    for (coord, level) in changed {
        world.set(&layer, coord.x, coord.y, water_tile_for_level(level));
        result.tile_changes.push(coord);
        result.water_tiles_changed += 1;
    }
}

fn water_can_enter(world: &World, coord: TileCoord) -> bool {
    !matches!(
        rendered_tile_at(world, coord),
        Some(
            TileKind::Wall
                | TileKind::Door
                | TileKind::DoorOpen
                | TileKind::Lava
                | TileKind::Tree
                | TileKind::Pillar
                | TileKind::Cage
                | TileKind::Bar
        )
    )
}

fn water_tile_for_level(level: u8) -> TileKind {
    if level >= 2 {
        TileKind::DeepWater
    } else {
        TileKind::Water
    }
}

fn update_core_flooding(state: &mut GameState) {
    let Some(core) = state.core_storehouse else {
        return;
    };
    let flooded = core.area.iter().any(|coord| state.water_level(coord) >= 2);
    let mut started = false;
    if let Some(challenge) = state.challenge.as_mut() {
        if flooded {
            challenge.flood.core_flood_ticks += 1;
            challenge.flood.stats.core_wet_ticks += 1;
            started = challenge.flood.core_flood_ticks == 1;
        } else {
            challenge.flood.core_flood_ticks = 0;
        }
    }
    if started {
        state.emit("Core storehouse is taking water. This is the opposite of storage.");
    }
}

fn tick_challenge_outcome(
    state: &mut GameState,
    config: SimulationConfig,
    result: &mut TickResult,
) {
    let Some(challenge) = state.challenge.as_ref() else {
        return;
    };
    if !challenge.status.is_running() {
        return;
    }

    let mut loss_reason = None;
    if state.workers.values().all(|worker| !worker.can_work()) {
        loss_reason = Some("all workers are down".to_string());
    } else if challenge.flood.core_flood_ticks >= config.core_flood_failure_ticks {
        loss_reason = Some("core storehouse flooded".to_string());
    }

    if let Some(reason) = loss_reason {
        settle_challenge_loss(state, result, reason);
        return;
    }

    let should_win = state
        .challenge
        .as_ref()
        .map(|challenge| state.time.day >= challenge.goals.survive_until_day)
        .unwrap_or(false);
    if should_win {
        settle_challenge_win(state, result);
    } else {
        refresh_challenge_score(state, None, None);
    }
}

fn settle_challenge_loss(state: &mut GameState, result: &mut TickResult, reason: String) {
    refresh_challenge_score(state, None, Some(reason.clone()));
    if let Some(challenge) = state.challenge.as_mut() {
        challenge.status = ChallengeStatus::Lost {
            reason: reason.clone(),
        };
    }
    result.challenge_ended = true;
    state.emit(format!("Flood Fortress failed: {reason}."));
}

fn settle_challenge_win(state: &mut GameState, result: &mut TickResult) {
    let medal = compute_medal(state);
    refresh_challenge_score(state, Some(medal), None);
    if let Some(challenge) = state.challenge.as_mut() {
        challenge.status = ChallengeStatus::Won(medal);
    }
    result.challenge_ended = true;
    state.emit(format!(
        "Flood Fortress survived with a {} medal.",
        medal.label()
    ));
}

fn refresh_challenge_score(
    state: &mut GameState,
    medal: Option<MedalTier>,
    failure_reason: Option<String>,
) {
    let score = build_challenge_score(state, medal, failure_reason);
    if let Some(challenge) = state.challenge.as_mut() {
        challenge.score = score;
    }
}

fn build_challenge_score(
    state: &GameState,
    medal: Option<MedalTier>,
    failure_reason: Option<String>,
) -> ChallengeScore {
    let flood_stats = state
        .challenge
        .as_ref()
        .map(|challenge| challenge.flood.stats.clone())
        .unwrap_or_default();
    ChallengeScore {
        total_workers: state.workers.len(),
        surviving_workers: state
            .workers
            .values()
            .filter(|worker| worker.can_work())
            .count(),
        flooded_tiles: flood_stats.max_flooded_tiles,
        core_wet_ticks: flood_stats.core_wet_ticks,
        flood_structures_built: flood_stats.flood_structures_built,
        channels_dug: flood_stats.channels_dug,
        remaining_food: state.inventory.get(ResourceKind::Food),
        remaining_wood: state.inventory.get(ResourceKind::Wood),
        remaining_stone: state.inventory.get(ResourceKind::Stone),
        medal,
        failure_reason,
    }
}

fn compute_medal(state: &GameState) -> MedalTier {
    let Some(challenge) = state.challenge.as_ref() else {
        return MedalTier::Bronze;
    };
    let score = build_challenge_score(state, None, None);
    let goals = challenge.goals;

    let gold = score.surviving_workers == score.total_workers
        && score.core_wet_ticks == 0
        && score.channels_dug >= goals.gold_min_channels
        && score.remaining_food >= goals.gold_min_food
        && score.remaining_wood >= goals.gold_min_wood
        && score.remaining_stone >= goals.gold_min_stone;
    if gold {
        return MedalTier::Gold;
    }

    let silver = score.surviving_workers >= goals.silver_min_survivors
        && score.core_wet_ticks == 0
        && score.flood_structures_built >= goals.silver_min_flood_structures;
    if silver {
        return MedalTier::Silver;
    }

    MedalTier::Bronze
}

fn assign_jobs(state: &mut GameState) {
    let idle_workers: Vec<_> = state
        .workers
        .values()
        .filter(|worker| worker.assigned_job.is_none() && worker.can_work())
        .map(|worker| (worker.id, worker.pos))
        .collect();

    for (worker_id, worker_pos) in idle_workers {
        let Some((job_index, job_id)) = state
            .jobs
            .iter()
            .enumerate()
            .filter(|(_, job)| matches!(job.status, JobStatus::Queued))
            .min_by_key(|(_, job)| worker_pos.manhattan(job.kind.target()))
            .map(|(index, job)| (index, job.id))
        else {
            continue;
        };
        state.jobs[job_index].status = JobStatus::Assigned(worker_id);
        if let Some(worker) = state.workers.get_mut(&worker_id) {
            worker.assigned_job = Some(job_id);
            worker.status = WorkerStatus::Walking;
        }
    }
}

fn tick_worker(
    world: &mut World,
    state: &mut GameState,
    worker: &mut Worker,
    config: SimulationConfig,
    result: &mut TickResult,
) {
    tick_worker_needs(state, worker, config);
    if !worker.can_work() {
        worker.status = WorkerStatus::Downed;
        return;
    }

    let Some(job_id) = worker.assigned_job else {
        worker.status = if worker.hunger < 25 {
            WorkerStatus::Hungry
        } else {
            WorkerStatus::Idle
        };
        return;
    };
    let Some(job_index) = state.jobs.iter().position(|job| job.id == job_id) else {
        worker.assigned_job = None;
        worker.status = WorkerStatus::Idle;
        return;
    };
    if !matches!(state.jobs[job_index].status, JobStatus::Assigned(_)) {
        worker.assigned_job = None;
        worker.status = WorkerStatus::Idle;
        return;
    }

    let job_kind = state.jobs[job_index].kind.clone();
    let Some(destination) = job_destination(world, state, worker, &job_kind, config) else {
        fail_job(state, worker, job_index, "no reachable work tile", result);
        return;
    };

    if worker.pos != destination {
        if let Some(next) =
            next_step_toward(world, state, worker.pos, destination, config.max_path_nodes)
        {
            worker.status = match job_kind {
                JobKind::Haul { .. } => WorkerStatus::Hauling,
                JobKind::Evacuate { .. } => WorkerStatus::Evacuating,
                _ => WorkerStatus::Walking,
            };
            if state.water_level(next) == 1 && state.time.tick.is_multiple_of(2) {
                return;
            }
            worker.pos = next;
        } else {
            fail_job(state, worker, job_index, "path blocked", result);
        }
        return;
    }

    worker.status = WorkerStatus::Working;
    state.jobs[job_index].progress += 1;
    if state.jobs[job_index].progress < config.job_work_ticks.max(1) {
        return;
    }

    complete_job(world, state, worker, job_index, job_kind, result);
}

fn tick_worker_needs(state: &mut GameState, worker: &mut Worker, config: SimulationConfig) {
    if config.hunger_decay_interval == 0
        || !state.time.tick.is_multiple_of(config.hunger_decay_interval)
    {
        return;
    }
    worker.hunger = (worker.hunger - 1).max(0);
    if worker.hunger < 20 && state.inventory.consume(ResourceKind::Food, 1) {
        worker.hunger = (worker.hunger + 45).min(100);
        state.emit(format!("{} ate stored food.", worker.name));
    }
    if worker.hunger == 0 {
        worker.health = (worker.health - 1).max(0);
    }
}

fn job_destination(
    world: &World,
    state: &GameState,
    worker: &Worker,
    job: &JobKind,
    config: SimulationConfig,
) -> Option<TileCoord> {
    match job {
        JobKind::Mine { target } | JobKind::Chop { target } => {
            adjacent_work_tile(world, state, worker.pos, *target, config.max_path_nodes)
        }
        JobKind::Build {
            target, tile_id, ..
        } => {
            let kind = TileKind::from_id(tile_id)?;
            if matches!(kind, TileKind::Wall | TileKind::Pillar | TileKind::Bar) {
                adjacent_work_tile(world, state, worker.pos, *target, config.max_path_nodes)
            } else {
                Some(*target)
            }
        }
        JobKind::Haul { from, to } => {
            if worker.carrying.is_empty() {
                state.item_piles.contains_key(from).then_some(*from)
            } else {
                Some(*to)
            }
        }
        JobKind::Explore { target } => Some(*target),
        JobKind::Evacuate { target } => Some(*target),
    }
}

fn adjacent_work_tile(
    world: &World,
    state: &GameState,
    start: TileCoord,
    target: TileCoord,
    max_nodes: usize,
) -> Option<TileCoord> {
    target
        .neighbors4()
        .into_iter()
        .filter(|coord| is_gameplay_passable(world, state, *coord))
        .min_by_key(|coord| {
            path_distance(world, state, start, *coord, max_nodes).unwrap_or(u32::MAX)
        })
}

fn complete_job(
    world: &mut World,
    state: &mut GameState,
    worker: &mut Worker,
    job_index: usize,
    job_kind: JobKind,
    result: &mut TickResult,
) {
    match job_kind {
        JobKind::Mine { target } => {
            let Some(kind) = rendered_tile_at(world, target) else {
                fail_job(state, worker, job_index, "nothing to mine", result);
                return;
            };
            if !is_mineable(Some(kind)) {
                fail_job(state, worker, job_index, "target is not mineable", result);
                return;
            }
            let layer = world.active_layer.clone();
            world.set(&layer, target.x, target.y, TileKind::Floor);
            result.tile_changes.push(target);
            if is_channel_dig(state, target)
                && let Some(challenge) = state.challenge.as_mut()
                && challenge.status.is_running()
            {
                challenge.flood.stats.channels_dug += 1;
            }
            if let Some(resource) = resource_from_mine(kind) {
                state.add_item_pile(target, resource, 1);
            }
            finish_job(state, worker, job_index, result, "Mined stone.");
        }
        JobKind::Chop { target } => {
            let Some(kind) = rendered_tile_at(world, target) else {
                fail_job(state, worker, job_index, "nothing to chop", result);
                return;
            };
            if !is_choppable(Some(kind)) {
                fail_job(state, worker, job_index, "target is not choppable", result);
                return;
            }
            let layer = world.active_layer.clone();
            world.set(&layer, target.x, target.y, TileKind::Grass);
            result.tile_changes.push(target);
            if let Some(resource) = resource_from_chop(kind) {
                state.add_item_pile(target, resource, 1);
            }
            finish_job(state, worker, job_index, result, "Chopped wood.");
        }
        JobKind::Build {
            target,
            tile_id,
            cost,
        } => {
            let Some(kind) = TileKind::from_id(&tile_id) else {
                fail_job(state, worker, job_index, "unknown build tile", result);
                return;
            };
            if !consume_cost(&mut state.inventory, &cost) {
                fail_job(state, worker, job_index, "missing build resources", result);
                return;
            }
            let layer = world.active_layer.clone();
            world.set(&layer, target.x, target.y, kind);
            result.tile_changes.push(target);
            if matches!(kind, TileKind::Wall | TileKind::Door | TileKind::DoorOpen)
                && let Some(challenge) = state.challenge.as_mut()
                && challenge.status.is_running()
            {
                challenge.flood.stats.flood_structures_built += 1;
            }
            finish_job(state, worker, job_index, result, "Built structure.");
        }
        JobKind::Haul { from, to } => {
            if worker.carrying.is_empty() {
                let Some(kind) = take_one_from_pile(state, from) else {
                    fail_job(state, worker, job_index, "nothing to haul", result);
                    return;
                };
                worker.carrying.add(kind, 1);
                state.jobs[job_index].progress = 0;
                worker.status = WorkerStatus::Hauling;
                return;
            }
            if worker.pos != to {
                state.jobs[job_index].progress = 0;
                return;
            }
            state.inventory.merge(&mut worker.carrying);
            finish_job(state, worker, job_index, result, "Hauled resources.");
        }
        JobKind::Explore { target } => {
            state.fog.reveal(target);
            finish_job(state, worker, job_index, result, "Explored new ground.");
        }
        JobKind::Evacuate { target: _ } => {
            finish_job(
                state,
                worker,
                job_index,
                result,
                "Reached the safe zone. Nobody is calling it cowardice.",
            );
        }
    }
}

fn consume_cost(inventory: &mut Inventory, cost: &Inventory) -> bool {
    if !cost
        .iter()
        .all(|(kind, amount)| inventory.has(kind, amount))
    {
        return false;
    }
    for (kind, amount) in cost.iter() {
        inventory.consume(kind, amount);
    }
    true
}

fn take_one_from_pile(state: &mut GameState, from: TileCoord) -> Option<ResourceKind> {
    let resource = state.item_piles.get_mut(&from)?.items.drain_one()?;
    let empty = state
        .item_piles
        .get(&from)
        .map(|pile| pile.items.is_empty())
        .unwrap_or(false);
    if empty {
        state.item_piles.remove(&from);
    }
    Some(resource)
}

fn finish_job(
    state: &mut GameState,
    worker: &mut Worker,
    job_index: usize,
    result: &mut TickResult,
    message: &'static str,
) {
    state.jobs[job_index].status = JobStatus::Done;
    state.jobs[job_index].progress = 0;
    worker.assigned_job = None;
    worker.status = WorkerStatus::Idle;
    result.jobs_completed += 1;
    state.emit(message);
}

fn fail_job(
    state: &mut GameState,
    worker: &mut Worker,
    job_index: usize,
    reason: &'static str,
    result: &mut TickResult,
) {
    state.jobs[job_index].status = JobStatus::Failed;
    state.jobs[job_index].failure_reason = Some(reason.into());
    state.jobs[job_index].progress = 0;
    worker.assigned_job = None;
    worker.status = WorkerStatus::Idle;
    result.jobs_failed += 1;
    state.emit(format!("Job failed: {reason}."));
}

fn maybe_spawn_monster(
    world: &World,
    state: &mut GameState,
    config: SimulationConfig,
    result: &mut TickResult,
) {
    if !state.time.is_night()
        || state.monsters.len() >= config.max_monsters
        || config.monster_spawn_interval == 0
        || !state
            .time
            .tick
            .is_multiple_of(config.monster_spawn_interval)
    {
        return;
    }

    let Some(anchor) = state.workers.values().next().map(|worker| worker.pos) else {
        return;
    };
    for radius in [12, 16, 20] {
        for candidate in ring_candidates(anchor, radius) {
            if is_passable(rendered_tile_at(world, candidate)) {
                state.spawn_monster(candidate);
                result.monsters_spawned += 1;
                return;
            }
        }
    }
}

fn tick_monsters(
    world: &World,
    state: &mut GameState,
    config: SimulationConfig,
    result: &mut TickResult,
) {
    let monster_ids: Vec<_> = state.monsters.keys().copied().collect();
    for monster_id in monster_ids {
        let Some(mut monster) = state.monsters.remove(&monster_id) else {
            continue;
        };
        if monster.health <= 0 {
            continue;
        }
        if monster.attack_cooldown > 0 {
            monster.attack_cooldown -= 1;
        }
        let Some((worker_id, worker_pos)) = state
            .workers
            .values()
            .filter(|worker| worker.can_work())
            .map(|worker| (worker.id, worker.pos))
            .min_by_key(|(_, pos)| monster.pos.manhattan(*pos))
        else {
            state.monsters.insert(monster_id, monster);
            continue;
        };
        if monster.pos.manhattan(worker_pos) <= 1 {
            let mut attacked_name = None;
            if monster.attack_cooldown == 0
                && let Some(worker) = state.workers.get_mut(&worker_id)
            {
                worker.health = (worker.health - 8).max(0);
                monster.attack_cooldown = 4;
                result.attacks += 1;
                attacked_name = Some(worker.name.clone());
            }
            if let Some(name) = attacked_name {
                state.emit(format!("{name} was attacked."));
            }
        } else if let Some(next) = next_step_toward(
            world,
            state,
            monster.pos,
            worker_pos,
            config.max_path_nodes / 2,
        ) {
            monster.pos = next;
        }
        state.monsters.insert(monster_id, monster);
    }
}

fn next_step_toward(
    world: &World,
    state: &GameState,
    start: TileCoord,
    goal: TileCoord,
    max_nodes: usize,
) -> Option<TileCoord> {
    if start == goal {
        return Some(start);
    }
    let mut queue = VecDeque::from([start]);
    let mut came_from: HashMap<TileCoord, TileCoord> = HashMap::new();
    let mut visited: HashSet<TileCoord> = HashSet::from([start]);

    while let Some(current) = queue.pop_front() {
        if visited.len() > max_nodes.max(1) {
            return greedy_step(world, state, start, goal);
        }
        for next in current.neighbors4() {
            if !visited.insert(next) {
                continue;
            }
            if !is_gameplay_passable(world, state, next) {
                continue;
            }
            came_from.insert(next, current);
            if next == goal {
                return first_step(start, goal, &came_from);
            }
            queue.push_back(next);
        }
    }
    greedy_step(world, state, start, goal)
}

fn path_distance(
    world: &World,
    state: &GameState,
    start: TileCoord,
    goal: TileCoord,
    max_nodes: usize,
) -> Option<u32> {
    if start == goal {
        return Some(0);
    }
    let mut queue = VecDeque::from([(start, 0)]);
    let mut visited: HashSet<TileCoord> = HashSet::from([start]);
    while let Some((current, distance)) = queue.pop_front() {
        if visited.len() > max_nodes.max(1) {
            return None;
        }
        for next in current.neighbors4() {
            if !visited.insert(next) {
                continue;
            }
            if !is_gameplay_passable(world, state, next) {
                continue;
            }
            if next == goal {
                return Some(distance + 1);
            }
            queue.push_back((next, distance + 1));
        }
    }
    None
}

fn first_step(
    start: TileCoord,
    goal: TileCoord,
    came_from: &HashMap<TileCoord, TileCoord>,
) -> Option<TileCoord> {
    let mut current = goal;
    while let Some(previous) = came_from.get(&current).copied() {
        if previous == start {
            return Some(current);
        }
        current = previous;
    }
    None
}

fn greedy_step(
    world: &World,
    state: &GameState,
    start: TileCoord,
    goal: TileCoord,
) -> Option<TileCoord> {
    start
        .neighbors4()
        .into_iter()
        .filter(|coord| is_gameplay_passable(world, state, *coord))
        .min_by_key(|coord| coord.manhattan(goal))
}

fn is_channel_dig(state: &GameState, target: TileCoord) -> bool {
    let Some(challenge) = state.challenge.as_ref() else {
        return false;
    };
    let near_source = challenge
        .flood
        .water_sources
        .iter()
        .any(|source| source.pos.manhattan(target) <= 6);
    let near_dam = challenge
        .flood
        .old_dams
        .iter()
        .any(|dam| dam.pos.manhattan(target) <= 6);
    near_source || near_dam
}

fn ring_candidates(center: TileCoord, radius: i32) -> impl Iterator<Item = TileCoord> {
    let mut coords = Vec::new();
    for x in center.x - radius..=center.x + radius {
        coords.push(TileCoord::new(x, center.y - radius));
        coords.push(TileCoord::new(x, center.y + radius));
    }
    for y in center.y - radius + 1..center.y + radius {
        coords.push(TileCoord::new(center.x - radius, y));
        coords.push(TileCoord::new(center.x + radius, y));
    }
    coords.into_iter()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gameplay::command::{
        BuildBlueprint, BuildKind, CommandDispatcher, CommandEnvelope, GameCommand,
    };
    use crate::gameplay::state::{OldDam, TileArea, WaterSource};

    #[test]
    fn mine_job_turns_wall_into_floor_and_drops_stone() {
        let mut world = World::default();
        let layer = world.active_layer.clone();
        world.set(&layer, 1, 0, TileKind::Wall);
        let mut state = GameState::new_with_worker(TileCoord::new(0, 0));
        CommandDispatcher::dispatch(
            &world,
            &mut state,
            CommandEnvelope::human(GameCommand::Mine {
                area: TileArea::single(TileCoord::new(1, 0)),
            }),
        )
        .unwrap();

        let result = run_ticks(&mut world, &mut state, 8);

        assert!(result.jobs_completed >= 1);
        assert_eq!(
            rendered_tile_at(&world, TileCoord::new(1, 0)),
            Some(TileKind::Floor)
        );
        assert_eq!(
            state
                .item_piles
                .get(&TileCoord::new(1, 0))
                .map(|pile| pile.items.get(ResourceKind::Stone)),
            Some(1)
        );
    }

    #[test]
    fn haul_job_deposits_item_into_global_inventory() {
        let mut world = World::default();
        let mut state = GameState::new_with_worker(TileCoord::new(0, 0));
        state.add_item_pile(TileCoord::new(2, 0), ResourceKind::Wood, 1);
        let to = state.stockpile_target().unwrap();
        CommandDispatcher::dispatch(
            &world,
            &mut state,
            CommandEnvelope::human(GameCommand::Haul {
                from: TileArea::single(TileCoord::new(2, 0)),
                to,
            }),
        )
        .unwrap();

        run_ticks(&mut world, &mut state, 16);

        assert_eq!(state.inventory.get(ResourceKind::Wood), 1);
        assert!(!state.item_piles.contains_key(&TileCoord::new(2, 0)));
    }

    #[test]
    fn build_job_consumes_resource_and_places_wall() {
        let mut world = World::default();
        let mut state = GameState::new_with_worker(TileCoord::new(0, 0));
        state.inventory.add(ResourceKind::Stone, 1);
        CommandDispatcher::dispatch(
            &world,
            &mut state,
            CommandEnvelope::human(GameCommand::Build {
                blueprint: BuildBlueprint {
                    kind: BuildKind::Wall,
                    area: TileArea::single(TileCoord::new(1, 0)),
                },
            }),
        )
        .unwrap();

        run_ticks(&mut world, &mut state, 8);

        assert_eq!(
            rendered_tile_at(&world, TileCoord::new(1, 0)),
            Some(TileKind::Wall)
        );
        assert_eq!(state.inventory.get(ResourceKind::Stone), 0);
    }

    #[test]
    fn fog_reveals_worker_motion() {
        let mut world = World::default();
        let mut state = GameState::new_with_worker(TileCoord::new(0, 0));
        state.fog.reveal_radius = 1;
        CommandDispatcher::dispatch(
            &world,
            &mut state,
            CommandEnvelope::human(GameCommand::Explore {
                area: TileArea::single(TileCoord::new(3, 0)),
            }),
        )
        .unwrap();

        run_ticks(&mut world, &mut state, 12);

        assert!(state.fog.explored.contains(&TileCoord::new(3, 0)));
    }

    #[test]
    fn flood_fortress_loses_when_core_stays_deep() {
        let mut world = World::default();
        let mut state = GameState::new_with_worker(TileCoord::new(2, 0));
        state.start_flood_fortress(
            TileArea::single(TileCoord::new(0, 0)),
            vec![OldDam::new(TileCoord::new(-1, 0))],
            vec![WaterSource::new(TileCoord::new(-2, 0), 3)],
            1,
        );

        run_ticks_with_config(
            &mut world,
            &mut state,
            4,
            SimulationConfig {
                water_spread_interval: 1,
                core_flood_failure_ticks: 2,
                monster_spawn_interval: u64::MAX,
                ..SimulationConfig::default()
            },
        );

        assert!(matches!(
            state.challenge_status(),
            Some(ChallengeStatus::Lost { reason }) if reason == "core storehouse flooded"
        ));
        assert!(state.water_level(TileCoord::new(0, 0)) >= 2);
    }

    #[test]
    fn flood_fortress_water_waits_for_dam_breach() {
        let mut world = World::default();
        let mut state = GameState::new_with_worker(TileCoord::new(2, 0));
        state.start_flood_fortress(
            TileArea::single(TileCoord::new(0, 0)),
            vec![OldDam::new(TileCoord::new(-1, 0))],
            vec![WaterSource::new(TileCoord::new(-2, 0), 3)],
            100,
        );

        run_ticks_with_config(
            &mut world,
            &mut state,
            5,
            SimulationConfig {
                water_spread_interval: 1,
                monster_spawn_interval: u64::MAX,
                ..SimulationConfig::default()
            },
        );

        assert_eq!(state.water_level(TileCoord::new(-2, 0)), 3);
        assert_eq!(state.water_level(TileCoord::new(-1, 0)), 0);
        assert_eq!(state.water_level(TileCoord::new(0, 0)), 0);
    }

    #[test]
    fn flood_fortress_wall_blocks_water_and_awards_bronze() {
        let mut world = World::default();
        let layer = world.active_layer.clone();
        world.set(&layer, -1, 0, TileKind::Wall);
        let mut state = GameState::new_with_worker(TileCoord::new(2, 0));
        state.start_flood_fortress(
            TileArea::single(TileCoord::new(1, 0)),
            vec![OldDam::new(TileCoord::new(-3, 0))],
            vec![WaterSource::new(TileCoord::new(-4, 0), 3)],
            1,
        );

        run_ticks_with_config(
            &mut world,
            &mut state,
            8,
            SimulationConfig {
                minutes_per_tick: 720,
                water_spread_interval: 1,
                monster_spawn_interval: u64::MAX,
                ..SimulationConfig::default()
            },
        );

        assert!(matches!(
            state.challenge_status(),
            Some(ChallengeStatus::Won(MedalTier::Bronze))
        ));
        assert_eq!(state.water_level(TileCoord::new(1, 0)), 0);
    }

    #[test]
    fn worker_does_not_path_into_deep_water_goal() {
        let mut world = World::default();
        let mut state = GameState::new_with_worker(TileCoord::new(0, 0));
        state.start_flood_fortress(
            TileArea::single(TileCoord::new(4, 0)),
            vec![OldDam::new(TileCoord::new(8, 0))],
            vec![WaterSource::new(TileCoord::new(8, 1), 3)],
            100,
        );
        if let Some(challenge) = state.challenge.as_mut() {
            challenge.flood.water_levels.insert(TileCoord::new(1, 0), 3);
        }
        CommandDispatcher::dispatch(
            &world,
            &mut state,
            CommandEnvelope::human(GameCommand::Explore {
                area: TileArea::single(TileCoord::new(1, 0)),
            }),
        )
        .unwrap();

        run_ticks_with_config(
            &mut world,
            &mut state,
            6,
            SimulationConfig {
                max_path_nodes: 8,
                monster_spawn_interval: u64::MAX,
                ..SimulationConfig::default()
            },
        );

        assert_ne!(
            state.workers.values().next().map(|worker| worker.pos),
            Some(TileCoord::new(1, 0))
        );
    }

    #[test]
    fn channel_score_counts_near_flood_digs_only() {
        let mut world = World::default();
        let layer = world.active_layer.clone();
        world.set(&layer, -3, 0, TileKind::Wall);
        world.set(&layer, 20, 0, TileKind::Wall);
        let mut state = GameState::new_with_worker(TileCoord::new(-2, 0));
        state.start_flood_fortress(
            TileArea::single(TileCoord::new(4, 0)),
            vec![OldDam::new(TileCoord::new(-4, 0))],
            vec![WaterSource::new(TileCoord::new(-5, 0), 3)],
            100,
        );
        CommandDispatcher::dispatch(
            &world,
            &mut state,
            CommandEnvelope::human(GameCommand::Mine {
                area: TileArea::single(TileCoord::new(-3, 0)),
            }),
        )
        .unwrap();
        run_ticks_with_config(
            &mut world,
            &mut state,
            6,
            SimulationConfig {
                job_work_ticks: 1,
                monster_spawn_interval: u64::MAX,
                ..SimulationConfig::default()
            },
        );
        assert_eq!(
            state
                .challenge
                .as_ref()
                .map(|challenge| challenge.flood.stats.channels_dug),
            Some(1)
        );

        let mut far_state = GameState::new_with_worker(TileCoord::new(19, 0));
        far_state.start_flood_fortress(
            TileArea::single(TileCoord::new(4, 0)),
            vec![OldDam::new(TileCoord::new(-4, 0))],
            vec![WaterSource::new(TileCoord::new(-5, 0), 3)],
            100,
        );
        CommandDispatcher::dispatch(
            &world,
            &mut far_state,
            CommandEnvelope::human(GameCommand::Mine {
                area: TileArea::single(TileCoord::new(20, 0)),
            }),
        )
        .unwrap();
        run_ticks_with_config(
            &mut world,
            &mut far_state,
            6,
            SimulationConfig {
                job_work_ticks: 1,
                monster_spawn_interval: u64::MAX,
                ..SimulationConfig::default()
            },
        );
        assert_eq!(
            far_state
                .challenge
                .as_ref()
                .map(|challenge| challenge.flood.stats.channels_dug),
            Some(0)
        );
    }

    fn run_ticks(world: &mut World, state: &mut GameState, ticks: usize) -> TickResult {
        run_ticks_with_config(
            world,
            state,
            ticks,
            SimulationConfig {
                job_work_ticks: 2,
                monster_spawn_interval: u64::MAX,
                ..SimulationConfig::default()
            },
        )
    }

    fn run_ticks_with_config(
        world: &mut World,
        state: &mut GameState,
        ticks: usize,
        config: SimulationConfig,
    ) -> TickResult {
        let mut total = TickResult::default();
        for _ in 0..ticks {
            let result = tick_gameplay(world, state, config);
            total.jobs_completed += result.jobs_completed;
            total.jobs_failed += result.jobs_failed;
            total.tile_changes.extend(result.tile_changes);
        }
        total
    }
}
