<p align="center">
  <img src="media/map-ansi16-small.png" alt="GlyphWeave — 艾瑟拉宏大王国" width="700">
</p>

<h1 align="center">GlyphWeave</h1>

<p align="center">
  <em>无限画布的 ASCII Roguelike 地图编辑器。描绘地牢，编织 glyph。</em>
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
  <a href="README.md">English</a> · <b>中文</b> · <a href="README.ja.md">日本語</a>
</p>

---

## 这是什么

**GlyphWeave** 是一款开源的无限画布地图编辑器，专为 Roguelike ASCII 艺术设计。逐格描绘地牢、放置预设房间、切换复古终端主题，并将你的世界导出为便携的 `.gemap` 文件——全在浏览器中完成。

每个格子都是一个 ASCII glyph（`#`、`.`、`~`、`♣`……）。**编织**它们，一绺一绺地织成一张连贯的地图。

---

## 功能

- **无限画布** — 用 Konva 实现平移和缩放。中键或平移工具导航。
- **25 种格子类型** — 墙壁、地板、水、熔岩、树木、家具、装饰等。
- **25 种预设房间** — 房间、走廊、地牢特征、陷阱，即点即用。
- **双主题** — ANSI 16（经典终端）和 Cogmind Dark（赛博朋克低光）。切换主题即时重绘所有格子。
- **多层编辑** — 将地形、建筑、细节分层管理。自由隐藏、锁定、添加或删除图层。
- **笔刷 / 橡皮 / 填充 / 平移 / 选择** 工具。
- **撤销 / 重做**（Ctrl+Z / Ctrl+Shift+Z）— 回溯最近 50 步。
- **导出 / 导入** `.gemap` v3 ZIP 格式 — Web 与 Bevy 共用稀疏三维体素世界。
- **小地图** — 实时概览，带视口矩形。点击跳转。
- **视距** — 可配置的渲染边距，让平移更丝滑。
- **渲染 API** — 通过 `GET /api/render` 或 `POST /api/render` 将地图生成为 SVG 或 PNG 图片。
- **键盘快捷键** — `B` 笔刷、`E` 橡皮、`F` 填充、`P` 平移、`S` 选择、`G` 网格切换。
- **示例地图** — 加载"被遗忘的地下墓穴"或"艾瑟拉宏大王国"来探索。

---

## 快速开始

```bash
# 安装依赖
pnpm install

# 设置 git hooks（提交检查）
git config core.hooksPath .githooks

# 启动开发服务器
pnpm dev
```

打开 `http://localhost:5173` — 选择世界名称、格子大小和主题，然后开始绘制。

> **渲染 API** 在开发模式下自动同端口可用。v3 ZIP 使用 `POST /api/render?z=<高度>`；GET/base64 与 JSON POST 仅用于旧格式兼容。

### 检查 `.gemap` chunk

`.gemap` v3 文件是 ZIP 容器。chunk 负载是 palette 打包后的二进制，
可以用 Rust CLI 把世界坐标映射回 region、section、chunk hash、palette
以及解码后的非 air voxel：

```bash
cargo run --manifest-path bevy/Cargo.toml -p glyphweave-cli -- \
  dump-chunk --coord 0,0,0 --limit 8 examples/aethra-mega.gemap
```

也可以用 `--section cz,rx,ry,rcx,rcy` 直接定位 section；需要输出整个
chunk 时使用 `--all`。

## 键盘快捷键

| 键             | 功能     |
| -------------- | -------- |
| `B`            | 笔刷工具 |
| `E`            | 橡皮工具 |
| `F`            | 填充工具 |
| `P`            | 平移工具 |
| `S`            | 选择工具 |
| `Ctrl+Z`       | 撤销     |
| `Ctrl+Shift+Z` | 重做     |
| `G`            | 切换网格 |

---

## 渲染 API

渲染 API 将 v3 `.gemap` ZIP 的指定 z 切片转换为图像；兼容窗口内仍接受旧版 JSON。支持三种运行环境：

| 环境 | 命令 | 地址 | 输出 |
|---|---|---|---|
| 开发 | `pnpm dev` | `http://localhost:5173/api/render` | PNG (`@napi-rs/canvas`) |
| 生产 (Node) | `pnpm build && pnpm start` | `http://localhost:3001/api/render` | PNG (`@napi-rs/canvas`) |
| 生产 (Cloudflare) | `pnpm deploy` | `https://glyphweave.hydroroll.team/api/render` | SVG |

### POST v3 `.gemap` ZIP

```bash
# 默认 SVG 输出
curl -X POST "https://glyphweave.hydroroll.team/api/render?z=0" \
  -H "Content-Type: application/vnd.glyphweave.gemap+zip" \
  --data-binary @my-map.gemap > map.svg

# PNG 输出
curl -X POST "http://localhost:3001/api/render?z=0&format=png" \
  -H "Content-Type: application/zip" \
  --data-binary @my-map.gemap > map.png
```

### GET（仅限小型旧版 JSON 地图）

```bash
DATA=$(echo -n '{"tiles":{"0,0":"wall"}}' | base64)
curl "https://glyphweave.hydroroll.team/api/render?data=$DATA" > map.svg
```

参数：

- `z` — v3 ZIP 必填的 int32 高度切片
- `theme` — `ansi-16`（默认）或 `cogmind`
- `padding` — 边界外额外格子数（默认 `1`）
- `scale` — 每格像素（默认自适应 ≤ 4096px）
- `format` — `svg` 或 `png`；PNG 仅 Node 环境支持

### 自托管

```bash
pnpm dev                           # 开发服务器, http://localhost:5173
pnpm build && pnpm start           # 生产服务器, http://localhost:3001

curl -X POST "http://localhost:3001/api/render?z=0" \
  -H "Content-Type: application/vnd.glyphweave.gemap+zip" \
  --data-binary @my-map.gemap > map.png
```

---

## 示例地图

| 地图             | 尺寸   | 描述                                                                               |
| ---------------- | ------ | ---------------------------------------------------------------------------------- |
| 被遗忘的地下墓穴 | 80×48  | 精心编排的迷宫，包含 25 个预设房间                                                 |
| 艾瑟拉宏大王国   | 120×80 | 横跨三层的宏大世界：山脉、湖泊、河流、熔岩裂隙、火山、森林、村庄、城池、公园和地牢 |

---

## 画廊

<p align="center">
  <img src="media/aethra-mega-hd-compressed.png" alt="艾瑟拉宏大王国 — mega HD 渲染" width="720">
</p>
<p align="center"><em>艾瑟拉宏大王国</em></p>

<p align="center">
  <img src="media/badlands-wadi-hd-compressed.png" alt="Badlands Wadi — HD 渲染" width="720">
</p>
<p align="center"><em>Badlands Wadi</em></p>

<p align="center">
  <img src="media/dragon_island.png" alt="Dragon Archipelago — HD 渲染" width="720">
</p>
<p align="center"><em>Dragon Archipelago — 参考图描摹</em></p>

### 展示你的地图

精心构筑了地牢、城镇或荒野？欢迎向画廊投稿 —— 风景图、主题小景、奇特色板都欢迎。

1. 通过 `/api/render`（Cloudflare 出 SVG，Node 出 PNG）渲染，或直接从编辑器导出。
2. 把图片放到 `media/` 目录（建议压缩到 2 MB 以内）。
3. 提交 PR，在上面的 `## 画廊` 部分加一行说明。

仓库约定与 PR 流程参见 [`AGENTS.md`](AGENTS.md)。

---

## 为什么叫 GlyphWeave？

**Glyph** — 每个格子都是一个 ASCII glyph（`#`、`.`、`~`、`♣`……）。  
**Weave** — 你将这些 glyph 交织成一幅连贯的地图，一丝一缕。

---

## 许可证

[![MIT](https://img.shields.io/badge/license-MIT-65a30d)](LICENSE)

MIT © Hsiang Nianian
