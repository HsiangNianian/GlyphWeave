# GlyphWeave Game Plan

GlyphWeave is moving from a tilemap editor toward a playable 2D colony
challenge sandbox inspired by Minecraft and Dwarf Fortress. The early product
goal is still not local LLM or ASR integration. The early goal is to prove the
manual loop, the command architecture, and the large-map performance budget.

## Product Shape

The sharpest version of GlyphWeave is:

> Draw the world, start the simulation, command the colonists, and watch the
> consequences.

The player has two identities:

- **Creation phase:** god, story director, or challenge designer. The player
  can draw terrain, place hazards, place limited entities, and set scenario
  constraints.
- **Play phase:** commander. The player cannot directly mutate the live world;
  they issue area/goal commands while colonists execute the details.

The first playable vertical slice is **Flood Fortress**. The player prepares a
small colony before an old dam fails, then survives by building flood walls,
digging channels, setting a core storehouse, and evacuating workers when needed.

## Core Loop

1. Pick or draw a challenge map.
2. Mark the core storehouse and initial resources.
3. Start Play mode.
4. The old dam breaches on a countdown.
5. Water spreads across tiles with shallow/deep water levels.
6. The player gives area commands: dig, chop, build, stockpile/core, evacuate.
7. Workers path, haul, build, dig, and avoid dangerous water.
8. The challenge ends with a bronze, silver, or gold result.

## Phase 1: Flood Fortress

Implemented vertical slice pieces:

- Flood Fortress challenge state, goals, score, and outcome status.
- Core storehouse and safe zone designations.
- Old dam breach countdown.
- Water sources and shallow/deep tile spread.
- Water-aware worker/monster pathfinding.
- Core flooding and all-workers-downed loss conditions.
- Bronze/silver/gold challenge scoring.
- Built-in official challenge seeds:
  - Breach Night
  - Lowland Granary
  - Twin Rivers
- `--flood-demo` scripted validation run.

## Non-Goals Before Phase 6

- No real local LLM runtime.
- No ASR runtime.
- No free-form NPC conversation.
- No multiplayer.
- No infinite world generation.
- No deep Dwarf Fortress economy simulation.
- No online sharing platform yet.
- No Steam Workshop yet.

## Architecture Rule

Every gameplay action must pass through `GameCommand`.

Human UI, keyboard shortcuts, typed text stubs, future ASR, and future local
LLM parsing all produce the same command envelopes. Current commands include:

- `GameCommand::Mine`
- `GameCommand::Chop`
- `GameCommand::Build`
- `GameCommand::Haul`
- `GameCommand::Explore`
- `GameCommand::SetStockpile`
- `GameCommand::SetCoreStorehouse`
- `GameCommand::Evacuate`
- `GameCommand::Cancel`

The command dispatcher validates the command and creates jobs or designations.
Simulation then owns execution. UI and model integrations must not mutate the
world directly.

## Current Implementation

The pure core gameplay layer lives under:

- `bevy/crates/core/src/gameplay/command.rs`
- `bevy/crates/core/src/gameplay/state.rs`
- `bevy/crates/core/src/gameplay/sim.rs`

The Bevy integration lives under:

- `bevy/crates/app/src/gameplay.rs`
- `bevy/crates/app/src/scenario.rs`
- `bevy/crates/app/src/gameplay_demo.rs`

The Bevy app now has:

- Edit/play mode.
- Play tab with order selection.
- Text command stub using a rule-based parser.
- Worker, item pile, monster, stockpile, core, safe-zone, dam, and job overlays.
- Tick-based worker/job simulation.
- Resource inventory and event log.
- Fog/time/hostile entity model in core simulation.
- Built-in Flood Fortress scenarios on the home screen.

## Phase 6 Interface

Phase 6 should not bypass the command layer. It should add new command sources:

- `VoiceCommandSource`: ASR text -> command source input.
- `LocalModelCommandSource`: text/world summary -> `GameCommand`.

The model should return structured commands, not arbitrary mutations. The
human player should see previews and rejections from the same validation path
used by manual play.

## Performance Policy

Large example maps must maintain at least 150 workload FPS during these scripted checks. The p95 frame time is reported for diagnostics, but the pass/fail gate is the workload FPS target.

Checks include:

- Static load.
- Pan.
- Zoom.
- Stress pan at low zoom.
- Fog overlay rendering.
- Gameplay entity overlay rendering.

Use:

```bash
pnpm bevy:fps
```

Useful overrides:

```bash
GLYPHWEAVE_FPS_WARMUP=1 GLYPHWEAVE_FPS_SAMPLE=2 pnpm bevy:fps
GLYPHWEAVE_FPS_FEATURE_CHECKS="fog entities" pnpm bevy:fps
GLYPHWEAVE_FPS_GAMEPLAY_ENTITIES=1000 pnpm bevy:fps
```
