---
name: GlyphWeave
description: Infinite-canvas ASCII roguelike tilemap editor — zinc-black tool chrome where canvas glyphs are the only source of color.
colors:
  canvas-black: "#000000"
  chrome-base: "#09090b"
  surface-raised: "#18181b"
  surface-active: "#27272a"
  control-selected: "#3f3f46"
  hairline-strong: "#52525b"
  control-hover: "#71717a"
  text-secondary: "#a1a1aa"
  text-primary: "#d4d4d8"
  text-emphasis: "#f4f4f5"
  button-face: "#e5e5e5"
  popover-base: "#171717"
  focus-ring: "#737373"
  signal-amber: "#fbbf24"
  signal-amber-bright: "#fcd34d"
  destructive: "#f87171"
  signal-emerald: "#34d399"
  ansi-yellow: "#ffff00"
  ansi-green: "#00ff00"
  ansi-blue: "#0000ff"
  ansi-red: "#ff0000"
  ansi-magenta: "#ff00ff"
  ansi-cyan: "#00ffff"
  lava-orange: "#ff5500"
  ansi-gray: "#a0a0a0"
typography:
  display:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.33
    letterSpacing: "-0.025em"
  body:
    fontFamily: "'Geist Variable', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "'Geist Variable', sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.33
  caption:
    fontFamily: "'Geist Variable', sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.45
    letterSpacing: "0.05em"
  data:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.45
rounded:
  none: "0px"
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
spacing:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.button-face}"
    textColor: "{colors.popover-base}"
    rounded: "{rounded.lg}"
    height: "32px"
    padding: "0px 10px"
  button-primary-hover:
    backgroundColor: "rgba(229, 229, 229, 0.8)"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
    height: "32px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.lg}"
  hud-chip:
    backgroundColor: "rgba(0, 0, 0, 0.7)"
    textColor: "{colors.control-hover}"
    rounded: "{rounded.none}"
    height: "24px"
  tab-active:
    backgroundColor: "{colors.surface-active}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.none}"
    height: "32px"
  input-field:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text-emphasis}"
    rounded: "{rounded.md}"
    height: "36px"
  tile-cell:
    backgroundColor: "{colors.surface-raised}"
    rounded: "{rounded.md}"
    size: "48px"
  tile-cell-selected:
    backgroundColor: "{colors.control-selected}"
---

# Design System: GlyphWeave

## Overview

GlyphWeave is a dark, flat editor system with a temperament somewhere between "retro terminal" and "modern IDE": the tool chrome is fully achromatic (zinc grays + 1px hairline borders), and every color — ANSI yellow, lava orange, terminal green — lives only in the canvas glyphs. The interface is organized around one premise: **the map itself is the brightest element on screen**, and the chrome's job is to frame it quietly.

Typography makes the monospace voice the brand voice: the title, breadcrumbs, coordinate readouts, and zoom percentage are all monospace characters; body copy and forms use Geist Variable. Density runs high but never cramped — a 36px titlebar, 24px HUD readouts, 48px tile cells; no oversized whitespace anywhere, and nothing suffocating either.

**Key Characteristics:**

- Zero elevation shadows: hierarchy is carried entirely by 1px hairline borders (zinc-800) and brightness steps; floating layers use black-70% translucency + backdrop blur; the single exception is the amber self-glow on live-data indicator dots
- Achromatic editor chrome + amber as the only functional accent (live data, read-only state); the AI chat panel is the single surface exception with its own emerald accent, and red is reserved for destructive/error tones
- Monospace is the brand voice: brand name, paths, and data readouts are always mono
- Color belongs to glyphs: the UI never competes with the canvas for chromatic attention
- Icons are always Lucide, never emoji; desktop-first editor layout, full-viewport, no page scroll

## Colors

The palette has two layers: **the UI chrome is an achromatic zinc scale** (components hardcode Tailwind `zinc-*` utilities — this is the visible source of truth), and **canvas data colors come from the theme registry** (built-in ANSI 16 / Cogmind Dark / Fortress Pixel themes, 26 tiles each with an fg/bg pair), which drives glyph colors on the canvas and in the palette. The UI must never hardcode them.

A third layer of shadcn semantic tokens (neutral oklch values in `src/index.css`) drives popover/dialog Radix primitives alongside the zinc utilities. Dark is the only runtime mode (`index.html` hardcodes `class="dark"`); light tokens exist but are unused.

### Primary

- **Chrome Base** (chrome-base #09090b / zinc-950): the background of the titlebar, toolbar, side panels, and the home card. The UI's "structural black" — half a step brighter than the canvas black (#000000), so the canvas reads as the deepest plane.
- **Canvas Black** (canvas-black #000000): the Konva stage and page background. Pure black — the deepest point in the system.

### Neutral

- **Surface Raised** (surface-raised #18181b / zinc-900): input backgrounds, default tile cells, tab strip background. The first raised plane.
- **Surface Active** (surface-active #27272a / zinc-800): hover fills, active tab fill, and nearly every 1px border. zinc-800 doubles as "the border gray" — almost every line in the system is this one color.
- **Control Selected** (control-selected #3f3f46 / zinc-700): selected tile cell fill, home import-button outlines. The third raised plane.
- **Hairline Strong** (hairline-strong #52525b / zinc-600): scrollbars, resize-handle hover.
- **Control Hover** (control-hover #71717a / zinc-500): scrollbar hover, placeholder text, shortcut hints.
- **Text Secondary** (text-secondary #a1a1aa / zinc-400): secondary labels, default icon color.
- **Text Primary** (text-primary #d4d4d8 / zinc-300): brand text, breadcrumbs, titlebar copy.
- **Text Emphasis** (text-emphasis #f4f4f5 / zinc-100): home headline, input text.
- **Button Face** (button-face #e5e5e5 / shadcn dark `--primary`): the primary button's light face — the only large bright control in the dark UI.
- **Popover Base** (popover-base #171717 / oklch(0.205 0 0)): background of shadcn popover/dialog/select primitives (semantic token layer).
- **Focus Ring** (focus-ring #737373 / oklch(0.556 0 0)): keyboard focus ring base, 3px at 50% opacity.

### Secondary

- **Signal Amber** (signal-amber #fbbf24 / amber-400; text uses signal-amber-bright #fcd34d / amber-300): the only functional accent in the editor chrome. It marks live data (Z-level readout, layer icon) and state warnings (the "view only" badge on non-ASCII surfaces). It tags *living data* — it is not decoration.
- **Signal Emerald** (signal-emerald #34d399 / emerald-400; assistant bubbles use emerald-600/80): the accent of the AI chat panel only — assistant avatar, message bubbles, typing indicator, read receipt, input focus ring, send button. Emerald belongs to the companion surface and never appears in editor chrome. Red covers destructive/error tones (the destructive button treatment, the chat panel's experiment notice).

### Tertiary (canvas data colors · ANSI 16 anchors)

These are the most recognizable anchors of the default ANSI 16 theme (the full 26-tile × 3-theme set lives in `src/lib/render-surface-protocol.mjs`):

- **Terminal Yellow** (ansi-yellow #ffff00): doors, treasure — the classic terminal highlight.
- **Terminal Green** (ansi-green #00ff00): trees, grass.
- **Terminal Blue** (ansi-blue #0000ff): water glyphs.
- **Terminal Red** (ansi-red #ff0000): traps, blood.
- **Terminal Magenta** (ansi-magenta #ff00ff): altars.
- **Terminal Cyan** (ansi-cyan #00ffff): fountains.
- **Lava Orange** (lava-orange #ff5500): lava.
- **Wall Gray** (ansi-gray #a0a0a0): walls — the classic terminal gray.

### Named Rules

**The Amber Signal Rule.** In the editor chrome the only functional color is amber, and it may only appear on *live data* (level readouts, real-time state, read-only warnings). Amber never exceeds 1% of any screen; every other emphasis is done with brightness. The single surface exception is the AI chat panel, which carries its own emerald accent (see Signal Emerald) — emerald never leaks into editor chrome, and red is reserved for destructive/error tones. All remaining color belongs to glyphs.

**The Flat Surface Rule.** The system has zero elevation shadows — the single exception is the amber self-glow on live-data indicator dots (see Shadow Vocabulary). Hierarchy = 1px hairline borders + surface brightness steps (zinc-950 → 900 → 800 → 700); floating layers = black 70% + backdrop blur, never drop shadows.

## Typography

**Display/Brand Font:** Tailwind `font-mono` stack (ui-monospace → SFMono-Regular → Menlo → Consolas → monospace)
**Body Font:** Geist Variable (`@fontsource-variable/geist`, sans-serif fallback)
**Canvas Glyph Font** (0.75× tile size in both paths): the normal `TileCell` renderer uses JetBrains Mono → Fira Code → Courier New → monospace; the high-performance batch renderer (`TileBatchLayer`, surface renderers) uses Geist → Noto Sans SC → Microsoft YaHei → PingFang SC → monospace

**Character:** monospace carries "the machine's voice" — brand name, world-name paths, coordinates, zoom percentage, shortcut hints; Geist carries "the human voice" — body copy, labels, forms. The two voices have distinct jobs and never swap contexts.

### Hierarchy

- **Display** (mono, 700, 24px / 32px, tracking -0.025em): home headline (the app name) only.
- **Body** (Geist, 400, 14px / 20px): form inputs, primary button text, secondary copy.
- **Label** (Geist, 500, 12px / 16px): form labels, tab text, small button text.
- **Caption** (Geist, 500, 11px, letter-spacing 0.05em, uppercase): panel section headers (WALLS / FLOORS…) — all-caps + widened tracking is the fixed section marker.
- **Data** (mono, 400, 10–11px, tabular-nums): HUD readouts (Z level, zoom %), breadcrumbs, shortcut hints like `[B]`. Numbers must align in tabular figures.

### Named Rules

**The Monospace Voice Rule.** Anything with the nature of "machine output" — brand, paths, data readouts, shortcuts, coordinates — is always monospace; anything that is "someone speaking" — body copy, labels, descriptions — is always Geist. The test is context, not position.

## Layout

Desktop-first, full-viewport editor: `html/body/#root` are 100% width/height with `overflow: hidden`; the app manages its own scrolling (in-panel `scrollbar-custom`, 6px slim scrollbars, zinc-600/500).

Editor skeleton (left → right):

1. **Toolbar rail**: a vertical column of 36px icon buttons (zinc-950 fill, right border zinc-800, 12px padding, 6px gaps), with a separator between tools and undo/redo;
2. **Canvas**: takes all remaining space, pure black; HUD elements float absolutely positioned — slice readout top-left, minimap top-right, zoom cluster bottom-left, panel toggles bottom-right, all 12px off the edges;
3. **Side panel**: 320px by default, draggable 240–600px (6px handle, `ew-resize` cursor, hover zinc-600 / active zinc-500, rAF throttled); square tab strip inside (36px, bottom border) feeds each panel; panel content padding 8–12px, 16px between sections.

The home page is a single centered card: `max-width 512px` on a black centered backdrop, card padding 24px, 24px between blocks.

Spacing follows the Tailwind 4px base with habitual steps at 4 / 6 / 8 / 12 / 24px.

## Elevation & Depth

Completely flat, zero elevation shadows (the single exception is documented in Shadow Vocabulary). Depth is expressed three ways:

1. **Brightness steps**: zinc-950 (structure) → zinc-900 (controls) → zinc-800 (hover) → zinc-700 (selected) — one plane per step;
2. **Hairline borders**: nearly every boundary is a 1px zinc-800 line; zinc-700 when separation must get louder;
3. **Floating layers**: HUD over the canvas uses `rgba(0,0,0,0.7)` + `backdrop-blur-sm`, earning lift through blur rather than shadow; dialog/popover (shadcn primitives) use the semantic tokens' standard overlay and floats, also without decorative shadow.

### Shadow Vocabulary

The system's single sanctioned `box-shadow`:

- **Live-Signal Glow** (`box-shadow: 0 0 10px rgba(251, 191, 36, 0.35)`): reserved for dot-shaped indicators of live state; its only current use is the "current Z" node in the layers panel. It is not elevation — it is the amber signal's halo, letting live data read as one sliver of the canvas's light leaking into the chrome. Beyond it, every box-shadow used for depth, elevation, or lift is banned.

### Named Rules

**The Blur-Not-Shadow Rule.** Floats over the canvas have exactly one lift language: black-70% translucency + backdrop blur; elevation/lift box-shadows are banned, with the single exception of the live-signal amber glow. When in doubt about hierarchy, answer with borders and brightness first.

## Shapes

Radii come in three working sizes: **controls 10px** (buttons, inputs, icon buttons — `rounded-lg`, base `--radius: 0.625rem`); **containers 8px** (tile cells, theme cards, zoom cluster — `rounded-md`); **small elements 6px** (scrollbars at 3px, mini badges). The one all-square zone is the **tab strip and HUD readout bars** (`rounded-none`) — they are "instrument readouts," not "pressable controls," and the square corners are the deliberate distinction.

Borders are always 1px solid, never double-stroked; focus = border color shift + 3px translucent focus ring (ring at 50%). Pressed buttons nudge down 1px (`translate-y-px`) — the only directional motion in the system.

## Components

### Buttons

Quiet small controls: ≤36px tall, 10px radius, no shadows, a subtle sink on press.

- **Shape:** radius 10px (`rounded-lg`); height ladder 24 / 28 / 32 / 36px; icon buttons are squares
- **Primary:** light face (button-face #e5e5e5) with dark text (popover-base #171717), hover drops to 80% opacity; the brightest control in the dark UI, reserved for the current primary action
- **Outline:** transparent fill + 1px zinc-700 border, hover fill zinc-800; secondary actions like import/export
- **Ghost:** no fill, no border, text/icon zinc-400, hover fill zinc-800 + text zinc-200; the default form for toolbar, HUD, and titlebar
- **Destructive:** a 10% red tint fill + red text (#f87171) — tinted, never solid red
- **Hover / Focus:** hover swaps fill (150ms transition-all); focus-visible = border shift + 3px ring (50%); active sinks 1px
- **Disabled:** 50% opacity + pointer-events disabled

### Tabs (square tab strip)

- **Shape:** square corners (rounded-none), 32px tall, 12px text; container 36px, bottom border zinc-800, left-aligned, horizontally scrollable
- **State:** active = zinc-800 fill; inactive = transparent + zinc-400 text; icon-only tabs (export/settings) use a 14px icon
- The square corners are identity: tabs are readout slots, not buttons

### Tile Palette Cell (signature)

The palette's elementary particle and the system's best footnote on "color belongs to glyphs": a 48px square whose own fill is zinc, with the only color coming from the central 16px themed glyph (fg color) and the 9px zinc-500 name.

- **Shape:** 8px radius, 48px fixed width, auto-fill grid, 4px gaps
- **Background:** default zinc-900; hover zinc-800; selected zinc-700 + 1px inset zinc-400 ring
- **Content:** glyph color = theme fgColor (never hardcoded); name 9px zinc-500, truncated

### HUD Chip (signature)

- **Style:** square corners (or 6px), 1px zinc-800 border, black 70% + backdrop-blur, inner 10–11px mono + tabular-nums
- **State:** default text zinc-500; live values (Z level) amber-300 semibold; non-ASCII surfaces raise an amber-400 "view only" badge
- Lives at the canvas corners, 12px off the edges, mostly `pointer-events-none` (zoom cluster excepted)

### Theme Card

- **Style:** 8px radius, 12px padding, 1px border; left row of five 20px glyph swatches (rendered live from theme data), name 14px + description 11px in the middle, selection dot at right
- **State:** unselected = zinc-900/50 fill + zinc-800 border; selected = zinc-800/50 fill + zinc-500 border + 2px dot
- Key behavior: swatches always render live theme data — the card is its own preview

### Inputs

- **Style:** zinc-900 fill, 1px zinc-700 border, 8px radius, 36px tall, zinc-100 text at 14px
- **Focus:** border shift + 3px translucent ring; no glow
- **Label:** 12px zinc-400, 8px above the input

### Tooltips

Dark fill (zinc-900 family), 11–12px text; shortcuts append in zinc-500 as `[B]`. Toolbar tooltips open to the right; everything else defaults below.

## Do's and Don'ts

### Do:

- **Do** express all hierarchy with the zinc brightness ladder + 1px borders; think borders first, everything else second
- **Do** let canvas glyph colors always come from the theme registry (`resolveTheme`); UI data swatches render live theme values
- **Do** set data readouts in mono + `tabular-nums`, with live values in amber-300
- **Do** use Lucide for every icon (14–16px; `w-4 h-4` / `w-3.5 h-3.5` are the habitual sizes)
- **Do** set panel section headers in 11px uppercase + 0.05em tracking
- **Do** respect `prefers-reduced-motion` (shimmer and friends already degrade)

### Don't:

- **Don't** use box-shadow for elevation or lift (floats use black 70% + backdrop-blur); the only legal box-shadow is the amber self-glow on live-data indicator dots (`0 0 10px rgba(251,191,36,0.35)`)
- **Don't** introduce new colors into the editor chrome (amber belongs to live data, emerald belongs to the chat surface, red belongs to destructive/error tones; canvas colors belong to themes)
- **Don't** use Unicode emoji as icons or decoration (explicit repo ban — always lucide-react)
- **Don't** hardcode canvas glyph colors (they must go through themes)
- **Don't** round the tab strip or HUD readouts — square corners are their identity
- **Don't** hand-style native `<button>`/`<input>` elements — always go through the shadcn wrappers in `src/components/ui/` (known legacy exception: the `ThemeWorkshop` tile-list button, to be migrated)
