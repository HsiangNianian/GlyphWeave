# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users: **indie game developers** — they need to sketch and iterate on ASCII-style maps quickly for their own (roguelike / colony-sim) projects and export them as portable `.gemap` map assets. This also covers developers who design and test maps inside GlyphWeave's own challenge gameplay.

## Product Purpose

GlyphWeave is an open-source, infinite-canvas ASCII roguelike tilemap editor: every tile is an ASCII glyph (`#`, `.`, `~`, `♣`, …), and users "weave" dungeons and wilderness maps cell by cell — with preset rooms, instant dual-theme recoloring, multi-layer editing, undo/redo, a minimap, and `.gemap` v3 ZIP (sparse 3D voxel) import/export.

The product evolves along two implementations:

- **Web app** (`src/`, React 19 + Konva): production-ready with the full feature set; the reference implementation for behavior and visuals.
- **Bevy desktop port** (`bevy/`, Rust + Bevy 0.18): the active development direction — desktop-first, heading toward a real-time simulation/lighting engine, with a browser WASM preview.

Per `docs/game-plan.md`, the product vision is moving from "editor" to a playable 2D colony-challenge sandbox: draw the world → start the simulation → command the colonists → live with the consequences. The first vertical slice is **Flood Fortress** (an old-dam-breach flood survival challenge). The current-phase goal is to prove the manual loop, the `GameCommand` command architecture, and the large-map performance budget.

## Positioning

"Draw the world, start the simulation, issue commands, watch the consequences" — one product with two player identities. In the **creation phase** you are a god / story director / challenge designer: paint terrain, place hazards and limited entities, set scenario constraints. In the **play phase** you are a commander: you cannot mutate the live world; you issue area/goal commands while workers execute the details. The open `.gemap` v3 format is shared by both the web and Bevy runtimes — a mechanism a neighboring product could not truthfully copy.

## Operating Context

- Open-source repository (GitHub: HsiangNianian/GlyphWeave), MIT licensed, author Hsiang Nianian.
- Live demo: https://glyphweave.hydroroll.team (Cloudflare Workers + Static Assets); the Bevy WASM preview deploys as a separate Worker (`glyphweave-bevy`).
- Trilingual docs and UI: English / Chinese / Japanese (`README.md` / `README.zh.md` / `README.ja.md`, i18next).
- Built-in demo maps: "The Forgotten Catacombs" (80×48) and "Grand Realm of Aethra" (120×80, 3 layers). Flood Fortress official challenge seeds: Breach Night, Lowland Granary, Twin Rivers.
- Gallery community: users render their maps and submit them to the README gallery via PR.
- Development workflow: pnpm + Vite, `pnpm dev`; Conventional Commits + feature branches + squash merge; Vitest; `AGENTS.md` maintains the `src/` directory tree.

## Capabilities and Constraints

Confirmed features: 25 tile types, 25 preset rooms, two themes (ANSI 16 / Cogmind Dark) with instant recoloring, multi-layer editing (Terrain / Structures / Details), brush / eraser / flood-fill / pan / select tools, undo/redo (50 steps), `.gemap` v3 ZIP import/export, minimap, Render API (PNG/SVG), Convert API (image → map), in-app image import, ThemeWorkshop, and an AI chat panel (conversational map editing).

Architecture constraints:

- Every gameplay action must pass through a `GameCommand` envelope (human UI, keyboard shortcuts, the rule-based text source, future LLM/ASR — all produce the same command channel), validated by the dispatcher.
- Explicitly out of scope before Phase 6: local LLM runtime, ASR, free-form NPC conversation, multiplayer, infinite world generation, a deep Dwarf-Fortress-style economy simulation, an online sharing platform, Steam Workshop.
- Frontend state boundaries: map data lives in `map-store`, UI state in `ui-store`; the canvas reads the store without writing it, and all Konva interaction must go through the `useCanvas` hook.
- Command preview/rejection feedback and the post-run settlement screen (both shipped in Flood Fortress) are part of the gameplay experience.

**Design scope constraint (confirmed): design work covers the frontend only** — `server/`, the Node renderer, and API implementations are out of design scope.

## Brand Commitments

- Name meaning: Glyph (each tile is an ASCII glyph) + Weave (glyphs interlaced into a coherent map, strand by strand).
- All UI icons come from Lucide (`lucide-react`); Unicode emoji are banned as icons or decoration.
- Base UI elements use the shadcn/ui wrappers in `src/components/ui/`; no hand-styled native tags.
- The color baseline is the Tailwind zinc series unless a theme requires custom colors.
- UI copy is maintained in i18next across three languages (en/zh/ja).

## Evidence on Hand

- `README.md` / `README.zh.md` / `README.ja.md`: full feature list, API docs, gallery images.
- `docs/game-plan.md`, `docs/game-todo.md`: the game direction, the Flood Fortress slice, the phased plan, and explicit non-goals.
- `docs/superpowers/specs/`: the phased plan for the Bevy port.
- `media/`: finished map renders (aethra-mega, badlands-wadi, dragon_island, etc.).
- `examples/`: sample `.gemap` files (e.g. aethra-mega.gemap).
- Does not exist: testimonials, customer cases, press coverage — future work must not fabricate them.

## Product Principles

1. **Creation is play**: maps are not static assets — draw the world, then run the simulation; the "edit → play" switch should cost nothing.
2. **Two runtimes, one world**: the web app is the reference for `.gemap` format and behavior; the Bevy port follows it in features and visuals.
3. **Characters are the art**: ASCII glyphs are the product's core material; interface expression organizes around terminal/glyph aesthetics instead of hiding them.
4. **Open-source friendly**: the gallery, trilingual docs, and the PR workflow are part of the product; stay self-hostable and exportable.
5. **Restrained personality**: the AI assistant is an experimental aid and stays out of the core product story.
