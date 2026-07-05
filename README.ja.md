<p align="center">
  <img src="media/map-ansi16-small.png" alt="GlyphWeave — グランドレルム・オブ・エイスラ" width="700">
</p>

<h1 align="center">GlyphWeave</h1>

<p align="center">
  <em>無限キャンバスのASCIIローグライクタイルマップエディタ。ダンジョンを描き、グリフを紡ぐ。</em>
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
  <a href="README.md">English</a> · <a href="README.zh.md">中文</a> · <b>日本語</b>
</p>

---

## これは何？

**GlyphWeave** は、ローグライクASCIIアートのためのオープンソースの無限キャンバスタイルマップエディタです。タイルごとにダンジョンを描き、プリセットルームを配置し、レトロなターミナルテーマを切り替え、あなたの世界をポータブルな `.gemap` ファイルとしてエクスポートできます——すべてブラウザ上で。

各タイルはASCIIグリフ（`#`、`.`、`~`、`♣`……）です。それらを**紡いで**、ひとつの地図に織り上げます。

---

## 機能

- **無限キャンバス** — Konva によるパンとズーム。中クリックまたはパンツールで移動。
- **25種類のタイル** — 壁、床、水、溶岩、木、家具、装飾など。
- **25種類のプリセットルーム** — 部屋、廊下、ダンジョン設備、トラップをすぐに配置。
- **2つのテーマ** — ANSI 16（クラシックターミナル）と Cogmind Dark（サイバーパンク低照度）。テーマ切り替えですべてのタイルが瞬時に色替え。
- **マルチレイヤー編集** — 地形、建造物、詳細を別々のレイヤーに分割。非表示、ロック、追加、削除は自由自在。
- **ブラシ / 消しゴム / 塗りつぶし / パン / 選択** ツール。
- **元に戻す / やり直し**（Ctrl+Z / Ctrl+Shift+Z）— 過去50ステップまで。
- **エクスポート / インポート** `.gemap` JSON 形式 — レイヤー、テーマ、ワールド名を保持。
- **ミニマップ** — ビューポート矩形付きのリアルタイム概要。クリックでジャンプ。
- **視距離** — スムーズなパンのための設定可能なレンダリング余白。
- **レンダリングAPI** — `GET /render` または `POST /render` で地図をPNG画像に変換。
- **キーボードショートカット** — `B` ブラシ、`E` 消しゴム、`F` 塗りつぶし、`P` パン、`S` 選択、`G` グリッド切替。
- **デモマップ** — 「忘れられしカタコンベ」または「グランドレルム・オブ・エイスラ」を探索。

---

## クイックスタート

```bash
# 依存関係をインストール
pnpm install

# Gitフックを設定（コミットチェック）
git config core.hooksPath .githooks

# 開発サーバーを起動
pnpm dev
```

`http://localhost:5173` を開き、ワールド名、タイルサイズ、テーマを選択して描き始めましょう。

> **レンダリングAPI** は開発モードで自動的に同一ポートで利用可能です——`GET /render?data=<base64>` または `POST /render`（JSON body）。詳細は[サーバードキュメント](server/index.mjs)を参照。

## Render API

GlyphWeave には、タイルマップを PNG 画像に変換するスタンドアロンのレンダリングサーバーが付属しています。

```bash
# レンダリングサーバーを起動（開発モードでは自動統合済み）
pnpm render-server
```

### POST（大きなマップに推奨）

```bash
curl -X POST http://localhost:3001/render \
  -H "Content-Type: application/json" \
  -d @my-map.gemap > map.png
```

### GET（小さなマップ向け）

```bash
DATA=$(echo -n '{"tiles":{"0,0":"wall"}}' | base64)
curl "http://localhost:3001/render?data=$DATA" > map.png
```

パラメータ：

- `theme` — `ansi-16`（デフォルト）または `cogmind`
- `padding` — 境界外の余分タイル数（デフォルト `1`）
- `scale` — タイルあたりのピクセル数（デフォルトは自動フィット ≤ 4096px）

---

## デモマップ

| マップ                         | サイズ | 説明                                                                                          |
| ------------------------------ | ------ | --------------------------------------------------------------------------------------------- |
| 忘れられしカタコンベ           | 80×48  | 25のプリセットルームで構成された厳選ダンジョン                                                |
| グランドレルム・オブ・エイスラ | 120×80 | 山脈、湖、川、溶岩割れ目、火山、森、村、城塞都市、公園、ダンジョンに及ぶ3レイヤーの広大な世界 |

---

## 名前の由来

**Glyph** — 各タイルはASCIIグリフ（`#`、`.`、`~`、`♣`……）です。  
**Weave** — それらのグリフを織り交ぜて、ひとつの地図に紡ぎ上げます。

---

## ライセンス

[![MIT](https://img.shields.io/badge/license-MIT-65a30d)](LICENSE)

MIT © Hsiang Nianian
