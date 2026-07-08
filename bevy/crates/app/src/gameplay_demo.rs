//! Scripted gameplay walkthrough for the early Play mode.

use glyphweave_core::gameplay::{
    BuildBlueprint, BuildKind, CommandDispatcher, CommandEnvelope, CommandSource, GameCommand,
    GameState, ResourceKind, RuleBasedTextCommandSource, SimulationConfig, TileArea, TileCoord,
    tick_gameplay,
};
use glyphweave_core::tile::TileKind;
use glyphweave_core::world::World;

pub fn run() -> Result<(), String> {
    let mut world = demo_world();
    let mut state = GameState::default();
    state.spawn_worker("Mason", TileCoord::new(0, 0));
    let config = SimulationConfig {
        job_work_ticks: 2,
        monster_spawn_interval: u64::MAX,
        ..SimulationConfig::default()
    };

    println!("[glyphweave:demo] scripted Play mode walkthrough");
    println!("[glyphweave:demo] worker starts at 0,0; tree at 2,0; wall at -2,0");

    dispatch(
        &world,
        &mut state,
        GameCommand::SetStockpile {
            area: TileArea::centered(TileCoord::new(0, 0), 1),
        },
        "set stockpile",
    )?;

    dispatch_text(
        &world,
        &mut state,
        "砍树",
        TileCoord::new(2, 0),
        "text chop",
    )?;
    run_until(
        &mut world,
        &mut state,
        config,
        "chop tree",
        |world, state| {
            glyphweave_core::gameplay::rendered_tile_at(world, TileCoord::new(2, 0))
                == Some(TileKind::Grass)
                && state.item_piles.contains_key(&TileCoord::new(2, 0))
        },
    )?;

    let stockpile = state
        .stockpile_target()
        .ok_or_else(|| "missing stockpile target".to_string())?;
    dispatch(
        &world,
        &mut state,
        GameCommand::Haul {
            from: TileArea::single(TileCoord::new(2, 0)),
            to: stockpile,
        },
        "haul wood",
    )?;
    run_until(&mut world, &mut state, config, "store wood", |_, state| {
        state.inventory.get(ResourceKind::Wood) >= 1
    })?;

    dispatch_text(
        &world,
        &mut state,
        "挖掉这片墙",
        TileCoord::new(-2, 0),
        "text mine",
    )?;
    run_until(
        &mut world,
        &mut state,
        config,
        "mine wall",
        |world, state| {
            glyphweave_core::gameplay::rendered_tile_at(world, TileCoord::new(-2, 0))
                == Some(TileKind::Floor)
                && state.item_piles.contains_key(&TileCoord::new(-2, 0))
        },
    )?;

    dispatch(
        &world,
        &mut state,
        GameCommand::Haul {
            from: TileArea::single(TileCoord::new(-2, 0)),
            to: stockpile,
        },
        "haul stone",
    )?;
    run_until(&mut world, &mut state, config, "store stone", |_, state| {
        state.inventory.get(ResourceKind::Stone) >= 1
    })?;

    dispatch(
        &world,
        &mut state,
        GameCommand::Build {
            blueprint: BuildBlueprint {
                kind: BuildKind::Wall,
                area: TileArea::single(TileCoord::new(0, 2)),
            },
        },
        "build wall",
    )?;
    run_until(&mut world, &mut state, config, "finish wall", |world, _| {
        glyphweave_core::gameplay::rendered_tile_at(world, TileCoord::new(0, 2))
            == Some(TileKind::Wall)
    })?;

    dispatch(
        &world,
        &mut state,
        GameCommand::Build {
            blueprint: BuildBlueprint {
                kind: BuildKind::Door,
                area: TileArea::single(TileCoord::new(1, 2)),
            },
        },
        "build door",
    )?;
    run_until(&mut world, &mut state, config, "finish door", |world, _| {
        glyphweave_core::gameplay::rendered_tile_at(world, TileCoord::new(1, 2))
            == Some(TileKind::Door)
    })?;

    dispatch(
        &world,
        &mut state,
        GameCommand::Explore {
            area: TileArea::single(TileCoord::new(4, 3)),
        },
        "explore",
    )?;
    run_until(
        &mut world,
        &mut state,
        config,
        "explore target",
        |_, state| {
            state.fog.explored.contains(&TileCoord::new(4, 3)) && state.open_job_count() == 0
        },
    )?;

    println!(
        "[glyphweave:demo] final inventory: wood={} stone={} food={} ore={}",
        state.inventory.get(ResourceKind::Wood),
        state.inventory.get(ResourceKind::Stone),
        state.inventory.get(ResourceKind::Food),
        state.inventory.get(ResourceKind::Ore)
    );
    println!(
        "[glyphweave:demo] final tiles: tree_site={:?} mine_site={:?} wall={:?} door={:?}",
        glyphweave_core::gameplay::rendered_tile_at(&world, TileCoord::new(2, 0)),
        glyphweave_core::gameplay::rendered_tile_at(&world, TileCoord::new(-2, 0)),
        glyphweave_core::gameplay::rendered_tile_at(&world, TileCoord::new(0, 2)),
        glyphweave_core::gameplay::rendered_tile_at(&world, TileCoord::new(1, 2))
    );
    println!("[glyphweave:demo] recent events:");
    for event in state.events.iter().rev().take(8).rev() {
        println!("[glyphweave:demo]   #{} {}", event.tick, event.message);
    }
    println!("[glyphweave:demo] complete");

    Ok(())
}

fn demo_world() -> World {
    let mut world = World {
        world_name: "Scripted Outpost Demo".into(),
        theme_id: "fortress-pixel".into(),
        ..World::default()
    };
    let layer = world.active_layer.clone();
    world.set(&layer, 2, 0, TileKind::Tree);
    world.set(&layer, -2, 0, TileKind::Wall);
    world
}

fn dispatch(
    world: &World,
    state: &mut GameState,
    command: GameCommand,
    label: &'static str,
) -> Result<(), String> {
    let receipt = CommandDispatcher::dispatch(world, state, CommandEnvelope::human(command))
        .map_err(|err| format!("{label}: {err:?}"))?;
    println!(
        "[glyphweave:demo] {:<14} jobs={} canceled={} stockpiles={}",
        label, receipt.jobs_created, receipt.jobs_canceled, receipt.stockpiles_created
    );
    Ok(())
}

fn dispatch_text(
    world: &World,
    state: &mut GameState,
    text: &str,
    focus: TileCoord,
    label: &'static str,
) -> Result<(), String> {
    let mut source = RuleBasedTextCommandSource::from_text(text, focus)
        .map_err(|err| format!("{label}: {err}"))?;
    let Some(envelope) = source.next_command(world, state) else {
        return Err(format!("{label}: no command produced"));
    };
    let receipt = CommandDispatcher::dispatch(world, state, envelope)
        .map_err(|err| format!("{label}: {err:?}"))?;
    println!(
        "[glyphweave:demo] {:<14} {:?} -> jobs={}",
        label, text, receipt.jobs_created
    );
    Ok(())
}

fn run_until(
    world: &mut World,
    state: &mut GameState,
    config: SimulationConfig,
    label: &'static str,
    done: impl Fn(&World, &GameState) -> bool,
) -> Result<(), String> {
    for tick in 1..=160 {
        tick_gameplay(world, state, config);
        if done(world, state) {
            let worker = state
                .workers
                .values()
                .next()
                .map(|worker| format!("{},{}", worker.pos.x, worker.pos.y))
                .unwrap_or_else(|| "--".into());
            println!(
                "[glyphweave:demo] {:<14} done in {:>3} ticks worker={} open_jobs={}",
                label,
                tick,
                worker,
                state.open_job_count()
            );
            return Ok(());
        }
    }
    Err(format!("{label}: timed out"))
}
