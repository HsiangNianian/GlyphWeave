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
- **Render API** — generate PNG/SVG images from any map via `GET /api/render` or `POST /api/render`.
- **Image import** — convert browser-decodable images into theme-matched GlyphWeave maps directly in the app.
- **Convert API** — convert PNG/JPEG/WebP images into theme-matched GlyphWeave maps and SVG output on Node-backed servers.
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

> The **Render API** and **Convert API** are available on the same port under `/api/` during development. In production, `pnpm start` serves the frontend plus Node-backed APIs on port 3001. Cloudflare Workers + Assets deployments support rendering and app-side browser image import; direct `/api/convert` remains Node-only.

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

The Render API converts tilemaps to images. It's available in three environments:

| Environment | Command | URL | Output |
|---|---|---|---|
| Development | `pnpm dev` | `http://localhost:5173/api/render` | PNG default or SVG (`?format=svg`) |
| Production (Node) | `pnpm build && pnpm start` | `http://localhost:3001/api/render` | PNG default or SVG (`?format=svg`) |
| Production (Cloudflare) | `pnpm deploy` | `https://glyphweave.hydroroll.team/api/render` | SVG |

### POST (recommended for large maps)

```bash
curl -X POST https://glyphweave.hydroroll.team/api/render \
  -H "Content-Type: application/json" \
  -d @my-map.gemap > map.svg
```

### GET (small maps)

```bash
DATA=$(echo -n '{"tiles":{"0,0":"wall"}}' | base64)
curl "https://glyphweave.hydroroll.team/api/render?data=$DATA" > map.svg
```

Parameters:

- `theme` — `ansi-16` (default) or `cogmind`
- `padding` — extra tiles around bounds (default: `1`)
- `scale` — pixels per tile (default: auto-fit ≤ 4096px)
- `format` — `svg` or `png`; PNG requires the Node renderer

### Local / Self-hosted

```bash
pnpm dev                           # dev server, http://localhost:5173
pnpm build && pnpm start           # production, http://localhost:3001

curl -X POST http://localhost:3001/api/render \
  -H "Content-Type: application/json" \
  -d @my-map.gemap > map.png

curl -X POST "http://localhost:3001/api/render?format=svg" \
  -H "Content-Type: application/json" \
  -d @my-map.gemap > map.svg
```

---

## Convert API

The Convert API samples an uploaded image into a GlyphWeave map by matching
each output cell to the nearest tile color in the supplied theme.

Cloudflare deployments still support image import in the app and `/api`
Playground by converting in the browser. Direct `/api/convert` requests require
the Node image renderer.

| Environment | Command | URL | Output |
|---|---|---|---|
| Development | `pnpm dev` | `http://localhost:5173/api/convert` | SVG default, PNG, `.gemap`, or JSON bundle |
| Production (Node) | `pnpm build && pnpm start` | `http://localhost:3001/api/convert` | SVG default, PNG, `.gemap`, or JSON bundle |
| Production (Cloudflare) | `pnpm deploy` | `https://glyphweave.hydroroll.team/api/convert` | Not available (`501`) |

`theme` or `themeId` is required because conversion uses the theme palette as
the tile classifier.

```bash
curl -X POST "http://localhost:3001/api/convert?themeId=ansi-16&width=160&format=svg" \
  -H "Content-Type: image/png" \
  --data-binary @input.png > converted.svg
```

Multipart uploads can pass a custom theme object:

```bash
curl -X POST "http://localhost:3001/api/convert?width=160&format=both" \
  -F "image=@input.webp" \
  -F "theme=@my-theme.json" > converted.json
```

Parameters:

- `themeId` — built-in theme ID such as `ansi-16` or `cogmind`
- `theme` — custom theme JSON object, or a built-in theme ID alias
- `width` / `height` — output map dimensions; default width is `160`, max side is `512`
- `format` — `svg` (default), `png`, `gemap`, or `both`
- `worldName` — map name in `.gemap` output
- `alphaThreshold` — transparent pixels at or below this alpha become void

---

## Demo Maps

| Map                     | Size   | Description                                                                                                                   |
| ----------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| The Forgotten Catacombs | 80×48  | Hand-curated dungeon with 25 preset rooms                                                                                     |
| Grand Realm of Aethra   | 120×80 | A sprawling 3-layer realm with mountains, lake, river, lava fissure, volcano, forest, village, walled city, park, and dungeon |

---

## Gallery

<p align="center">
  <img src="media/aethra-mega-hd-compressed.png" alt="Grand Realm of Aethra — mega HD render" width="720">
</p>
<p align="center"><em>Grand Realm of Aethra</em></p>

<p align="center">
  <img src="media/badlands-wadi-hd-compressed.png" alt="Badlands Wadi — HD render" width="720">
</p>
<p align="center"><em>Badlands Wadi</em></p>

### Show Off Your Maps

Built a dungeon, town, or wilderness you're proud of? Contributions are welcome — landscapes, themed vignettes, and unusual palettes are all fair game.

1. Render it via `/api/render` (SVG from Cloudflare, PNG from a Node server) or export straight from the editor.
2. Drop the image under `media/` (compress large renders — aim for under ~2 MB).
3. Open a PR adding it to the `## Gallery` section above with a one-line caption.

See [`AGENTS.md`](AGENTS.md) for repo conventions and the PR workflow.

---

## Why the Name?

**Glyph** — each tile is an ASCII glyph (`#`, `.`, `~`, `♣`, …).  
**Weave** — you interlace these glyphs into a coherent map, strand by strand.

---

## License

[![MIT](https://img.shields.io/badge/license-MIT-65a30d)](LICENSE)

MIT © Hsiang Nianian
