# GlyphWeave Game TODO

## Phase 1: Flood Fortress Vertical Slice

- [x] Define Flood Fortress as the first playable challenge.
- [x] Add core storehouse designation.
- [x] Add safe-zone / evacuation designation.
- [x] Add old dam entities with a breach countdown.
- [x] Add water sources.
- [x] Add shallow/deep water tile spread.
- [x] Make pathfinding aware of shallow/deep water.
- [x] Add core flooding loss condition.
- [x] Add all-workers-downed loss condition.
- [x] Add bronze/silver/gold scoring.
- [x] Add built-in Flood Fortress scenarios.
- [x] Add scripted `--flood-demo` validation.
- [ ] Add explicit budget UI for Challenge mode.
- [ ] Add a post-run settlement/score screen instead of only Play-tab status.
- [ ] Add clearer command preview/rejection UI.

## Phase 2: Command Layer

- [x] Add `GameCommand`.
- [x] Add command envelopes and source kinds.
- [x] Add dispatcher validation.
- [x] Add a rule-based text command source as the future LLM/ASR seam.
- [x] Route Bevy play input through the dispatcher.
- [x] Add core storehouse and evacuation commands.
- [ ] Add command preview rendering before confirmation.
- [ ] Add richer rejection messages in the Play tab.

## Phase 3: Workers And Jobs

- [x] Add workers.
- [x] Add job queue.
- [x] Add mine, chop, build, haul, explore, and evacuate jobs.
- [x] Add pathfinding-based worker movement.
- [x] Add item piles.
- [x] Add worker/entity overlays.
- [x] Add water-aware movement penalties and blocking.
- [ ] Add worker selection and detail panel.
- [ ] Add job priority and suspension.
- [ ] Add more visible black-humor colonist barks.

## Phase 4: World Simulation

- [x] Add tile passability/mining/chopping/build costs.
- [x] Add resources and stockpiles.
- [x] Add fog memory and visibility reveal.
- [x] Add game time and day/night state.
- [x] Add hunger and simple food consumption.
- [x] Add lightweight hostile entities and attacks.
- [x] Add first flood simulation.
- [ ] Add food production.
- [ ] Add better monster spawn rules.
- [ ] Add save/load for gameplay state, not only the tilemap.
- [ ] Add water receding/drain behavior.
- [ ] Add structural damage from sustained flood pressure.

## Phase 5: Performance Guardrails

- [x] Keep terrain rendering chunked.
- [x] Keep static, pan, zoom, and stress pan FPS checks.
- [x] Add perf coverage for fog overlay rendering.
- [x] Add perf coverage for gameplay entity overlays.
- [x] Keep default threshold at 150 workload FPS.
- [ ] Add CI wiring for the release FPS script.
- [ ] Add a low-end profile with smaller entity counts.
- [ ] Add perf coverage for Flood Fortress water overlays once water visuals grow.

## Phase 6: Local Model And ASR

Do not start this until the manual game loop is fun enough to keep.

- [ ] Add ASR adapter that emits text only.
- [ ] Add local 1-2B model adapter that emits structured commands only.
- [ ] Add command preview/confirm UI for model-generated commands.
- [ ] Add world-summary context builder for the model.
- [ ] Add model regression fixtures for command parsing.
