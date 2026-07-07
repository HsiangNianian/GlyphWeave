# GlyphWeave Game TODO

## Phase 1: Core Manual Loop

- [x] Add edit/play mode.
- [x] Add manual play orders for mine, chop, build, haul, explore, stockpile,
  and cancel.
- [x] Show gameplay status in the Bevy UI.
- [x] Add event log.
- [ ] Add scenario goals for the first outpost demo.
- [ ] Add loss conditions.

## Phase 2: Command Layer

- [x] Add `GameCommand`.
- [x] Add command envelopes and source kinds.
- [x] Add dispatcher validation.
- [x] Add a rule-based text command source as the future LLM/ASR seam.
- [x] Route Bevy play input through the dispatcher.
- [ ] Add command preview rendering before confirmation.
- [ ] Add richer rejection messages in the Play tab.

## Phase 3: Workers And Jobs

- [x] Add workers.
- [x] Add job queue.
- [x] Add mine, chop, build, haul, and explore jobs.
- [x] Add pathfinding-based worker movement.
- [x] Add item piles.
- [x] Add worker/entity overlays.
- [ ] Add worker selection and detail panel.
- [ ] Add job priority and suspension.

## Phase 4: World Simulation

- [x] Add tile passability/mining/chopping/build costs.
- [x] Add resources and stockpiles.
- [x] Add fog memory and visibility reveal.
- [x] Add game time and day/night state.
- [x] Add hunger and simple food consumption.
- [x] Add lightweight hostile entities and attacks.
- [ ] Add food production.
- [ ] Add better monster spawn rules.
- [ ] Add save/load for gameplay state, not only the tilemap.

## Phase 5: Performance Guardrails

- [x] Keep terrain rendering chunked.
- [x] Keep static, pan, zoom, and stress pan FPS checks.
- [x] Add perf coverage for fog overlay rendering.
- [x] Add perf coverage for gameplay entity overlays.
- [x] Keep default threshold at 150 workload FPS.
- [ ] Add CI wiring for the release FPS script.
- [ ] Add a low-end profile with smaller entity counts.

## Phase 6: Local Model And ASR

Do not start this until the manual game loop is fun enough to keep.

- [ ] Add ASR adapter that emits text only.
- [ ] Add local 1-2B model adapter that emits structured commands only.
- [ ] Add command preview/confirm UI for model-generated commands.
- [ ] Add world-summary context builder for the model.
- [ ] Add model regression fixtures for command parsing.
