<p align="center">
  <img src="media/map-ansi16-small.png" alt="GlyphWeave — Grand Realm of Aethra" width="700">
</p>

<h1 align="center">GlyphWeave</h1>

<p align="center">
  <em>An infinite-canvas ASCII roguelike tilemap editor. Paint dungeons, weave glyphs.</em>
</p>

<p align="center">
  <a href="https://github.com/HsiangNianian/GlyphWeave"><img src="https://img.shields.io/github/stars/HsiangNianian/GlyphWeave?logo=github" alt="GitHub stars"></a>
  <a href="https://github.com/HsiangNianian/GlyphWeave/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-65a30d?style=flat" alt="MIT license"></a>
  <a href="https://glyphweave.hydroroll.team"><img src="https://img.shields.io/badge/demo-glyphweave.hydroroll.team-000?style=flat&logo=cloudflare" alt="Demo"></a>
  <br>
  <img src="https://img.shields.io/badge/React_19-000?style=flat&logo=react" alt="React 19">
  <img src="https://img.shields.io/badge/Konva-000?style=flat&logo=canvas" alt="Konva">
  <img src="https://img.shields.io/badge/Tailwind_CSS_v4-000?style=flat&logo=tailwindcss" alt="Tailwind CSS v4">
  <img src="https://img.shields.io/badge/Zustand-000?style=flat&logo=react" alt="Zustand">
  <img src="https://img.shields.io/badge/TypeScript-000?style=flat&logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/Vite-000?style=flat&logo=vite" alt="Vite">
  <img src="https://img.shields.io/badge/pnpm-000?style=flat&logo=pnpm" alt="pnpm">
</p>

<p align="center">
  <b>English</b> · <a href="README.zh.md">中文</a> · <a href="README.ja.md">日本語</a>
</p>

---

## What Is This

**GlyphWeave** is an open-source, infinite-canvas tilemap editor designed for roguelike ASCII art. Paint dungeons tile by tile, place preset rooms, switch between retro terminal themes, and export your worlds as portable `.gemap` files — all in the browser.

Each tile is an ASCII glyph (`#`, `.`, `~`, `♣`, …). **Weave** them into a coherent map, strand by strand.

---

## Features

- **Infinite canvas** — pan and zoom with Konva. Middle-click or Pan tool to navigate.
- **25 tile types** — walls, floors, water, lava, trees, furniture, decorations, and more.
- **25 preset rooms** — rooms, corridors, dungeon features, traps, ready to place.
- **Dual themes** — ANSI 16 (classic terminal) and Cogmind Dark (cyberpunk low-light). Switching theme instantly recolors every tile.
- **Multi-layer editing** — separate Terrain, Structures, and Details onto different layers. Hide, lock, add, or delete layers freely.
- **Brush / Eraser / Flood Fill / Pan / Select** tools.
- **Undo / Redo** (Ctrl+Z / Ctrl+Shift+Z) — step back through your last 50 edits.
- **Export / Import** as `.gemap` JSON — preserves layers, theme, and world name.
- **Minimap** — real-time overview with viewport rectangle. Click to jump.
- **View Distance** — configurable render padding for smooth panning.
- **Render API** — generate PNG images from any map via `GET /api/render` or `POST /api/render`.
- **Keyboard shortcuts** — `B` brush, `E` eraser, `F` flood fill, `P` pan, `S` select, `G` grid toggle.
- **Demo maps** — load "The Forgotten Catacombs" or "Grand Realm of Aethra" to explore.

---

## Quick Start

```bash
# Install dependencies
pnpm install

# Set up git hooks (commit checks)
git config core.hooksPath .githooks

# Start development server
pnpm dev
```

Open `http://localhost:5173` — choose a world name, tile size, and theme, then start painting. Or click **Load Demo Map** to explore a pre-built dungeon.

> The **Render API** is automatically available on the same port under `/api/` — `GET /api/render?data=<base64>` or `POST /api/render` with a JSON body. See the [render server docs](server/index.mjs) for details.

## Keyboard Shortcuts

| Key            | Action      |
| -------------- | ----------- |
| `B`            | Brush tool  |
| `E`            | Eraser tool |
| `F`            | Flood fill  |
| `P`            | Pan tool    |
| `S`            | Select tool |
| `Ctrl+Z`       | Undo        |
| `Ctrl+Shift+Z` | Redo        |
| `G`            | Toggle grid |

---

## Render API

GlyphWeave ships with a standalone render server that converts tilemaps to PNG images.

```bash
# Start the render server (optional, already available in dev mode)
pnpm render-server
```

### POST (recommended for large maps)

```bash
curl -X POST http://localhost:3001/api/render \
  -H "Content-Type: application/json" \
  -d @my-map.gemap > map.png
```

### GET (small maps)

```bash
DATA=$(echo -n '{"tiles":{"0,0":"wall"}}' | base64)
curl "http://localhost:3001/api/render?data=$DATA" > map.png
```

Parameters:

- `theme` — `ansi-16` (default) or `cogmind`
- `padding` — extra tiles around bounds (default: `1`)
- `scale` — pixels per tile (default: auto-fit ≤ 4096px)

---

## Demo Maps

| Map                     | Size   | Description                                                                                                                   |
| ----------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| The Forgotten Catacombs | 80×48  | Hand-curated dungeon with 25 preset rooms                                                                                     |
| Grand Realm of Aethra   | 120×80 | A sprawling 3-layer realm with mountains, lake, river, lava fissure, volcano, forest, village, walled city, park, and dungeon |

---

## Why the Name?

**Glyph** — each tile is an ASCII glyph (`#`, `.`, `~`, `♣`, …).  
**Weave** — you interlace these glyphs into a coherent map, strand by strand.

---

## License

[![MIT](https://img.shields.io/badge/license-MIT-65a30d)](LICENSE)

MIT © Hsiang Nianian
