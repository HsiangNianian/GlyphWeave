# GlyphWeave Game Plan

GlyphWeave is moving from a tilemap editor toward a 2D sandbox colony game
inspired by Minecraft and Dwarf Fortress. The early product goal is not local
LLM or ASR integration. The early goal is to prove the manual sandbox loop,
the command architecture, and the large-map performance budget.

## Product Shape

The player edits and inhabits a large tile world. They can designate work,
watch workers execute jobs, collect resources, build structures, explore
fogged space, and survive lightweight world pressure.

The core loop is:

1. Explore nearby tiles.
2. Designate mining, chopping, hauling, and building.
3. Workers claim jobs and move through the map.
4. Resources become item piles, then enter stockpiles.
5. Stored resources fund more construction.
6. Time, hunger, fog, and hostile entities add pressure.

## Non-Goals Before Phase 6

- No real local LLM runtime.
- No ASR runtime.
- No free-form NPC conversation.
- No multiplayer.
- No infinite world generation.
- No deep Dwarf Fortress economy simulation.

## Architecture Rule

Every gameplay action must pass through `GameCommand`.

Human UI, keyboard shortcuts, typed text stubs, future ASR, and future local
LLM parsing all produce the same command envelopes:

- `GameCommand::Mine`
- `GameCommand::Chop`
- `GameCommand::Build`
- `GameCommand::Haul`
- `GameCommand::Explore`
- `GameCommand::SetStockpile`
- `GameCommand::Cancel`

The command dispatcher validates the command and creates jobs. Simulation then
owns execution. UI and model integrations must not mutate the world directly.

## Current Implementation

The pure core gameplay layer lives under:

- `bevy/crates/core/src/gameplay/command.rs`
- `bevy/crates/core/src/gameplay/state.rs`
- `bevy/crates/core/src/gameplay/sim.rs`

The Bevy integration lives under:

- `bevy/crates/app/src/gameplay.rs`

The Bevy app now has:

- Edit/play mode.
- Play tab with order selection.
- Text command stub using a rule-based parser.
- Worker, item pile, monster, stockpile, and job overlays.
- Tick-based worker/job simulation.
- Resource inventory and event log.
- Fog/time/hostile entity model in core simulation.

## Phase 6 Interface

Phase 6 should not bypass the command layer. It should add new command sources:

- `VoiceCommandSource`: ASR text -> command source input.
- `LocalModelCommandSource`: text/world summary -> `GameCommand`.

The model should return structured commands, not arbitrary mutations. The
human player should see previews and rejections from the same validation path
used by manual play.

## Performance Policy

Large example maps must maintain at least 150 workload FPS during:

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
