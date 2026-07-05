import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path, { resolve } from 'path'
import fs, { readdirSync, readFileSync, statSync } from 'fs'
import { renderMap } from './server/map-render.mjs'

/**
 * Vite plugin: serves the agents directory browser + map doc at /api.
 * JSON endpoints at /api/agents/list and /api/agents/read for ~/.agents/.
 */
function agentsBrowserPlugin(): Plugin {
  const AGENTS_DIR = resolve(process.env.HOME || '/home/hsiangnianian', '.agents')

  function listEntries(relPath: string) {
    const abs = resolve(AGENTS_DIR, relPath)
    if (!abs.startsWith(AGENTS_DIR)) return []
    try {
      return readdirSync(abs, { withFileTypes: true })
        .filter(d => d.name !== '.git')
        .map(d => ({ name: d.name, type: d.isDirectory() ? 'directory' as const : 'file' as const, path: relPath ? relPath + '/' + d.name : d.name }))
        .sort((a, b) => a.type !== b.type ? (a.type === 'directory' ? -1 : 1) : a.name.localeCompare(b.name))
    } catch { return [] }
  }

  function readFileContent(relPath: string) {
    const abs = resolve(AGENTS_DIR, relPath)
    if (!abs.startsWith(AGENTS_DIR)) return null
    try {
      const s = statSync(abs)
      if (!s.isFile() || s.size > 524288) return null
      const buf = readFileSync(abs)
      if (buf.includes(0)) return null
      return { content: buf.toString('utf-8'), size: s.size }
    } catch { return null }
  }
 
  // ── HTML info page ──
  const agentsInfoPage = (baseUrl: string) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>GlyphWeave — Map Format &amp; Agent Skills</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;background:#111;color:#ccc;padding:2rem;max-width:960px;margin:auto;line-height:1.6}
h1{color:#fff;border-bottom:2px solid #333;padding-bottom:.5em}
h2{color:#8cf;margin-top:2em;border-bottom:1px solid #333;padding-bottom:.3em}
h3{color:#afa;margin-top:1.5em}
a{color:#8af}
code{background:#222;padding:.15em .4em;border-radius:3px;font-size:.9em}
pre{background:#1a1a1a;border:1px solid #333;padding:1em;border-radius:6px;overflow-x:auto;font-size:.85em;line-height:1.4}
table{border-collapse:collapse;width:100%;margin:1em 0}
th,td{border:1px solid #333;padding:.5em .8em;text-align:left}
th{background:#1a1a1a;color:#8cf}
tr:nth-child(even){background:#161616}
.tag{display:inline-block;background:#2a2a2a;color:#888;padding:0 .4em;border-radius:3px;font-size:.8em;margin-right:.3em}
.tag-req{background:#3a1a1a;color:#f88}
.tag-opt{background:#1a2a1a;color:#8f8}
.tag-string{color:#8f8}
.tag-number{color:#8cf}
.tag-object{color:#fc8}
.note{background:#1a1a2a;border-left:3px solid #48f;padding:.8em 1em;border-radius:0 6px 6px 0;margin:1em 0}
.map-legend{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:6px;margin:1em 0}
.legend-item{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:4px;padding:.4em .6em;font-size:.85em;display:flex;align-items:center;gap:.6em}
.legend-item .char{font-family:monospace;font-size:1.2em;min-width:1.5em;text-align:center}
.legend-item .id{color:#888;font-size:.8em}
.category-label{color:#8cf;font-weight:bold;margin:1em 0 .3em 0}
</style>
</head>
<body>

<h1>GlyphWeave Render API &amp; Map Format</h1>

<p>This page documents the GlyphWeave tilemap format (<strong>.gemap</strong>) and the Render API endpoint.
It is designed for both humans and LLMs (AI agents) to read and understand how to generate valid maps.</p>

<!-- ============================================================ -->
<h2>1. Map Data Format (.gemap JSON)</h2>

<p>A GlyphWeave map is a JSON object with the following structure. The only strictly required field is <code>tiles</code> or <code>layerTiles</code>.</p>

<h3>Top-level Schema</h3>
<pre><code>{
  "tiles":       {&lt;coord&gt;: &lt;tileId&gt;|null, ...},   // Flat tile map (required unless layerTiles used)
  "layerTiles":  {&lt;layerId&gt;: {&lt;coord&gt;: &lt;tileId&gt;|null, ...}, ...},  // Per-layer tiles
  "layers":      [{&lt;layer&gt;}, ...],               // Layer definitions
  "worldName":   "My Dungeon",                     // Map name (optional)
  "tileSize":    24,                               // Pixels per tile (optional, default 24)
  "themeId":     "ansi-16",                         // Theme ID (optional, default "ansi-16")
  "version":     2                                  // Format version (optional)
}</code></pre>

<div class="note">
<strong>LLM Note:</strong> The simplest valid map only needs a <code>tiles</code> object.
Omitted/void tiles render as empty space. All coordinates not present in <code>tiles</code> are treated as void.
</div>

<h3>Coordinate System</h3>
<pre><code>"{x},{y}": "{tileId}"

Examples:
"0,0": "wall"       // Top-left corner, a wall tile
"5,3": "floor"      // Column 5, row 3, a floor tile
"10,7": "door"      // A door at (10, 7)
"2,4": null          // Erase tile at (2, 4) — set to void</code></pre>

<ul>
  <li>Coordinates are integer grid positions, <strong>0-indexed</strong> from the top-left</li>
  <li>Key format: <code>"{x},{y}"</code> (no spaces)</li>
  <li>Negative coordinates are valid — the map bounds auto-detect from min/max keys</li>
  <li>The <code>tiles</code> object is sparse: only non-void tiles need to be listed</li>
  <li>Setting a tile to <code>null</code> explicitly removes it (same as omitting it)</li>
</ul>

<!-- ============================================================ -->
<h2>2. Tile Type Reference</h2>

<p>Each tile in the map references a <strong>tile type ID</strong>. Below is the complete list.
The <code>char</code> column shows the glyph rendered on the map.
The <code>category</code> groups tiles by function.</p>

<!-- wall -->
<div class="category-label">Walls</div>
<div class="map-legend">
<div class="legend-item"><span class="char" style="color:#a0a0a0">#</span><span>wall</span><span class="id">wall</span></div>
<div class="legend-item"><span class="char" style="color:#ffff00">+</span><span>door</span><span class="id">door</span></div>
<div class="legend-item"><span class="char" style="color:#c0c000">'</span><span>door (open)</span><span class="id">doorOpen</span></div>
<div class="legend-item"><span class="char" style="color:#a0a0a0">0</span><span>pillar</span><span class="id">pillar</span></div>
<div class="legend-item"><span class="char" style="color:#8b7355">│</span><span>bar</span><span class="id">bar</span></div>
</div>

<div class="category-label">Floors</div>
<div class="map-legend">
<div class="legend-item"><span class="char" style="color:#808080">.</span><span>floor</span><span class="id">floor</span></div>
<div class="legend-item"><span class="char" style="color:#606060">,</span><span>floor (alt)</span><span class="id">floorAlt</span></div>
<div class="legend-item"><span class="char" style="color:#8b7355">═</span><span>bridge</span><span class="id">bridge</span></div>
</div>

<div class="category-label">Water</div>
<div class="map-legend">
<div class="legend-item"><span class="char" style="color:#0000ff">~</span><span>water</span><span class="id">water</span></div>
<div class="legend-item"><span class="char" style="color:#0000aa">≈</span><span>deep water</span><span class="id">deepWater</span></div>
</div>

<div class="category-label">Terrain</div>
<div class="map-legend">
<div class="legend-item"><span class="char" style="color:#ff5500">~</span><span>lava</span><span class="id">lava</span></div>
<div class="legend-item"><span class="char" style="color:#000"> </span><span>void (empty)</span><span class="id">void</span></div>
</div>

<div class="category-label">Vegetation</div>
<div class="map-legend">
<div class="legend-item"><span class="char" style="color:#00ff00">♣</span><span>tree</span><span class="id">tree</span></div>
<div class="legend-item"><span class="char" style="color:#00aa00">"</span><span>grass</span><span class="id">grass</span></div>
</div>

<div class="category-label">Furniture</div>
<div class="map-legend">
<div class="legend-item"><span class="char" style="color:#ff00ff">≡</span><span>altar</span><span class="id">altar</span></div>
<div class="legend-item"><span class="char" style="color:#00ffff">♦</span><span>fountain</span><span class="id">fountain</span></div>
<div class="legend-item"><span class="char" style="color:#ffff55">Σ</span><span>shop</span><span class="id">shop</span></div>
<div class="legend-item"><span class="char" style="color:#8b4513">▤</span><span>table</span><span class="id">table</span></div>
<div class="legend-item"><span class="char" style="color:#ffd700">Ψ</span><span>throne</span><span class="id">throne</span></div>
<div class="legend-item"><span class="char" style="color:#c0c0c0">█</span><span>cage</span><span class="id">cage</span></div>
</div>

<div class="category-label">Items</div>
<div class="map-legend">
<div class="legend-item"><span class="char" style="color:#ffff00">$</span><span>treasure</span><span class="id">treasure</span></div>
</div>

<div class="category-label">Decorations</div>
<div class="map-legend">
<div class="legend-item"><span class="char" style="color:#808080">☠</span><span>grave</span><span class="id">grave</span></div>
<div class="legend-item"><span class="char" style="color:#ff0000">^</span><span>trap</span><span class="id">trap</span></div>
<div class="legend-item"><span class="char" style="color:#aa0000">;</span><span>blood</span><span class="id">blood</span></div>
</div>

<div class="category-label">Special</div>
<div class="map-legend">
<div class="legend-item"><span class="char" style="color:#ffffff">&gt;</span><span>stairs down</span><span class="id">stairsDown</span></div>
<div class="legend-item"><span class="char" style="color:#ffffff">&lt;</span><span>stairs up</span><span class="id">stairsUp</span></div>
</div>

<!-- ============================================================ -->
<h2>3. Tile ID Quick Reference (for LLMs)</h2>

<p>Use these exact string values when setting tiles in your JSON map:</p>

<pre><code>// ── Walls ──
"wall"       // #  — Standard dungeon wall
"door"       // +  — Closed door
"doorOpen"   // '  — Open doorway
"pillar"     // 0  — Support pillar
"bar"        // │  — Tavern bar / fence

// ── Floors ──
"floor"      // .  — Standard floor
"floorAlt"   // ,  — Alternate floor (variation)
"bridge"     // ═  — Bridge over water/lava

// ── Water ──
"water"      // ~  — Shallow water
"deepWater"  // ≈  — Deep water

// ── Terrain ──
"lava"       // ~  — Lava (rendered in orange/red)
"void"       //    — Empty space (omit from tiles to use)

// ── Vegetation ──
"tree"       // ♣  — Tree
"grass"      // "  — Grass / undergrowth

// ── Furniture ──
"altar"      // ≡  — Ritual altar
"fountain"   // ♦  — Fountain
"shop"       // Σ  — Merchant shop
"table"      // ▤  — Table
"throne"     // Ψ  — Throne
"cage"       // █  — Prison cage

// ── Items ──
"treasure"   // $  — Treasure pile

// ── Decorations ──
"grave"      // ☠  — Grave / tombstone
"trap"       // ^  — Floor trap
"blood"      // ;  — Bloodstain

// ── Special ──
"stairsDown" // >  — Stairs leading down
"stairsUp"   // <  — Stairs leading up</code></pre>

<!-- ============================================================ -->
<h2>4. Layer System (Multi-layer Maps)</h2>

<p>Maps can have multiple layers. When layers are used, the renderer flattens them:
visible layers are composited top-to-bottom, with later layers overwriting earlier ones at the same coordinates.</p>

<h3>Layer Structure</h3>
<pre><code>{
  "layerTiles": {
    "ground-layer": {
      "0,0": "wall",
      "1,0": "floor",
      "0,1": "floor"
    },
    "decor-layer": {
      "1,0": "blood"     // Blood on top of the floor
    }
  },
  "layers": [
    { "id": "ground-layer", "name": "Ground",  "visible": true, "locked": false },
    { "id": "decor-layer",  "name": "Decor",   "visible": true, "locked": false }
  ]
}</code></pre>

<p><strong>Important:</strong> If you use <code>layerTiles</code>, you MUST also provide a matching <code>layers</code> array
with the correct layer IDs and visibility flags. The <code>layers</code> array order determines render order
(first = bottom, last = top).</p>

<p>For simple single-layer maps, just use the flat <code>tiles</code> field:</p>
<pre><code>{
  "tiles": {
    "0,0": "wall",
    "1,0": "floor",
    "0,1": "floor"
  }
}</code></pre>

<!-- ============================================================ -->
<h2>5. Complete Map Examples</h2>

<h3>Minimal: A 3×3 Room</h3>
<pre><code>{
  "tiles": {
    "0,0": "wall", "1,0": "wall", "2,0": "wall",
    "0,1": "wall", "1,1": "floor", "2,1": "wall",
    "0,2": "wall", "1,2": "wall", "2,2": "wall"
  },
  "themeId": "ansi-16"
}</code></pre>

<h3>Dungeon Entrance</h3>
<pre><code>{
  "tiles": {
    "0,0": "wall",  "1,0": "wall",  "2,0": "wall",  "3,0": "wall",  "4,0": "wall",
    "0,1": "wall",  "1,1": "floor", "2,1": "floor", "3,1": "floor", "4,1": "wall",
    "0,2": "wall",  "1,2": "floor", "2,2": "stairsDown", "3,2": "floor", "4,2": "wall",
    "0,3": "wall",  "1,3": "floor", "2,3": "floor", "3,3": "floor", "4,3": "wall",
    "0,4": "wall",  "1,4": "door",  "2,4": "wall",  "3,4": "wall",  "4,4": "wall"
  },
  "themeId": "ansi-16"
}</code></pre>

<h3>Lava Cave with Bridge (multi-layer)</h3>
<pre><code>{
  "layerTiles": {
    "terrain": {
      "0,0": "wall", "1,0": "wall", "2,0": "wall", "3,0": "wall", "4,0": "wall",
      "0,1": "wall", "1,1": "lava", "2,1": "lava", "3,1": "lava", "4,1": "wall",
      "0,2": "wall", "1,2": "lava", "2,2": "lava", "3,2": "lava", "4,2": "wall",
      "0,3": "wall", "1,3": "lava", "2,3": "lava", "3,3": "lava", "4,3": "wall",
      "0,4": "wall", "1,4": "wall", "2,4": "wall", "3,4": "wall", "4,4": "wall"
    },
    "structures": {
      "1,1": "bridge", "1,2": "bridge", "1,3": "bridge"
    }
  },
  "layers": [
    { "id": "terrain",    "name": "Terrain",    "visible": true, "locked": false },
    { "id": "structures", "name": "Structures", "visible": true, "locked": false }
  ],
  "themeId": "ansi-16"
}</code></pre>

<h3>Throne Room (medium dungeon room)</h3>
<pre><code>{
  "tiles": {
    "0,0": "wall", "1,0": "wall", "2,0": "wall", "3,0": "wall", "4,0": "wall", "5,0": "wall", "6,0": "wall", "7,0": "wall",
    "0,1": "wall", "1,1": "floor", "2,1": "floor", "3,1": "floor", "4,1": "floor", "5,1": "floor", "6,1": "floor", "7,1": "wall",
    "0,2": "wall", "1,2": "floor", "2,2": "floor", "3,2": "floor", "4,2": "floor", "5,2": "floor", "6,2": "floor", "7,2": "wall",
    "0,3": "wall", "1,3": "floor", "2,3": "floor", "3,3": "throne", "4,3": "throne", "5,3": "floor", "6,3": "floor", "7,3": "wall",
    "0,4": "wall", "1,4": "floor", "2,4": "floor", "3,4": "throne", "4,4": "throne", "5,4": "floor", "6,4": "floor", "7,4": "wall",
    "0,5": "wall", "1,5": "floor", "2,5": "floor", "3,5": "floor", "4,5": "floor", "5,5": "floor", "6,5": "floor", "7,5": "wall",
    "0,6": "wall", "1,6": "floor", "2,6": "floor", "3,6": "floor", "4,6": "floor", "5,6": "floor", "6,6": "floor", "7,6": "wall",
    "0,7": "wall", "1,7": "wall", "2,7": "wall", "3,7": "wall", "4,7": "wall", "5,7": "wall", "6,7": "wall", "7,7": "wall"
  },
  "themeId": "ansi-16"
}</code></pre>

<h3>Forest Clearing (using negative coords)</h3>
<pre><code>{
  "tiles": {
    "-2,-2": "tree", "-1,-2": "tree", "0,-2": "tree",
    "-2,-1": "tree", "-1,-1": "grass", "0,-1": "tree",
    "-2,0":  "grass", "-1,0": "fountain", "0,0": "grass",
    "-2,1":  "tree", "-1,1": "grass", "0,1": "tree",
    "-2,2":  "tree", "-1,2": "tree", "0,2": "tree"
  },
  "themeId": "cogmind"
}</code></pre>

<!-- ============================================================ -->
<h2>6. Themes</h2>

<table>
<thead><tr><th>Theme ID</th><th>Name</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>ansi-16</code></td><td>ANSI 16</td><td>Classic ANSI terminal 16-color palette — bold, vibrant, iconic.</td></tr>
<tr><td><code>cogmind</code></td><td>Cogmind Dark</td><td>Low-light cyberpunk terminal — muted, cold, atmospheric.</td></tr>
</tbody>
</table>

<p>Each theme defines foreground and background colors for every tile type.
The theme ID is passed as a top-level field in the map JSON or as a query parameter.</p>

<!-- ============================================================ -->
<h2>7. API Endpoints</h2>

<h3>POST /api/render (recommended, any size map)</h3>
<pre><code>POST ${baseUrl}/api/render
Content-Type: application/json

{
  "tiles": { "0,0": "wall", "1,0": "floor", ... },
  "themeId": "ansi-16",
  "padding": 1,
  "scale": 24
}</code></pre>

<p>Query parameters override JSON body fields:</p>
<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Default</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>theme</code></td><td>string</td><td><code>ansi-16</code></td><td>Theme ID for rendering colors</td></tr>
<tr><td><code>padding</code></td><td>number</td><td><code>1</code></td><td>Extra tile-width border around the map bounds</td></tr>
<tr><td><code>scale</code></td><td>number</td><td>auto</td><td>Pixels per tile (auto-fits to ≤4096px output)</td></tr>
</tbody>
</table>

<h3>GET /api/render (small maps, via base64)</h3>
<pre><code>GET ${baseUrl}/api/render?data=&lt;base64-urlencoded-json&gt;&amp;theme=ansi-16</code></pre>

<p>The <code>data</code> parameter is the entire map JSON, base64-encoded and URL-encoded.
Best for small maps; use POST for larger maps.</p>

<h3>GET /api/health</h3>
<pre><code>GET ${baseUrl}/api/health</code></pre>

<p>Returns <code>{"ok":true,"version":1,"renderLoaded":true|false}</code>.</p>

<h3>GET /api</h3>
<p>This page.</p>

<!-- ============================================================ -->
<h2>8. curl Examples</h2>

<h3>Render a map from a .gemap file</h3>
<pre><code>curl -X POST ${baseUrl}/api/render \
  -H "Content-Type: application/json" \
  -d @my-map.gemap > my-map.png</code></pre>

<h3>Render with theme override</h3>
<pre><code>curl -X POST ${baseUrl}/api/render?theme=cogmind \
  -H "Content-Type: application/json" \
  -d @my-map.gemap > my-map-cogmind.png</code></pre>

<h3>Render a small inline map (GET)</h3>
<pre><code># Generate the base64 data first:
# echo -n '{"tiles":{"0,0":"wall"}}' | base64 -w0

curl "${baseUrl}/api/render?data=eyJ0aWxlcyI6eyIwLDAiOiJ3YWxsIn19&theme=ansi-16" > tiny.png</code></pre>

<h3>Render inline JSON (POST)</h3>
<pre><code>curl -X POST ${baseUrl}/api/render \
  -H "Content-Type: application/json" \
  -d '{"tiles":{"0,0":"wall","1,0":"floor","0,1":"floor","1,1":"floor"},"themeId":"ansi-16"}' \
  > 2x2.png</code></pre>

<!-- ============================================================ -->
<h2>9. LLM Authoring Guide</h2>

<div class="note">
<strong>For AI agents generating maps:</strong> Follow these guidelines to produce valid, visually coherent maps.
</div>

<h3>Design Principles</h3>
<ul>
  <li><strong>Enclose rooms with walls</strong> — every room should have a complete wall border</li>
  <li><strong>Use floors for walkable areas</strong> — <code>floor</code> (.) for standard, <code>floorAlt</code> (,) for variety</li>
  <li><strong>Doors connect spaces</strong> — place <code>door</code> (+) in wall openings between rooms and corridors</li>
  <li><strong>Corridors are 1-2 tiles wide</strong> — with walls on both sides flanking the floor</li>
  <li><strong>Decorations add atmosphere</strong> — <code>blood</code>, <code>grave</code>, <code>trap</code>, <code>grass</code> on top of floors</li>
  <li><strong>Stairs connect levels</strong> — entrance halls have <code>stairsDown</code> deeper floors have <code>stairsUp</code></li>
</ul>

<h3>Common Room Patterns</h3>
<ul>
  <li><strong>Small room:</strong> 5×5 tiles (walls + 3×3 floor interior)</li>
  <li><strong>Medium room:</strong> 7×7 tiles (walls + 5×5 floor interior)</li>
  <li><strong>Large hall:</strong> 11×11 tiles (walls + 9×9 floor interior)</li>
  <li><strong>Corridor:</strong> 3 tiles wide (wall | floor | wall), any length</li>
</ul>

<h3>Coordinate Mathematics</h3>
<pre><code># Room: top-left corner at (ox, oy), interior width w, height h
# Generate wall border and floor interior:

for y from oy to oy+h+1:
  for x from ox to ox+w+1:
    if x==ox or x==ox+w+1 or y==oy or y==oy+h+1:
      tiles["{x},{y}"] = "wall"
    else:
      tiles["{x},{y}"] = "floor"

# Add a door at the south wall midpoint:
doorX = ox + floor((w+1)/2)
# wall at (doorX, oy+h+1) becomes a door
tiles["{doorX},{oy+h+1}"] = "door"</code></pre>

<h3>Map Scale Guidelines</h3>
<ul>
  <li>Small dungeon: ~20×20 tiles, 3-5 rooms with corridors</li>
  <li>Medium dungeon: ~40×30 tiles, 6-10 rooms with varied features</li>
  <li>Large dungeon: ~80×48 tiles, 10-20 rooms with multiple themes</li>
  <li>Render output auto-scales to fit within 4096×4096px</li>
  <li>For detail, set <code>scale: 24</code> (1 tile = 24px in output)</li>
</ul>

<!-- ============================================================ -->
<h2>10. Preset Building Blocks</h2>

<p>The GlyphWeave editor includes pre-defined room presets.
LLMs can generate these patterns or similar ones programmatically.
Below are some common grid patterns (W=wall, F=floor, _=void):</p>

<pre><code>// Small Room (5×5, interior 3×3)
//   0 1 2 3 4
// 0 W W W W W
// 1 W F F F W
// 2 W F F F W
// 3 W F F F W
// 4 W W W W W

// T-Junction Corridor
//   _ W F W _
//   _ W F W _
//   F F F F F F
//   _ W F W _
//   _ W F W _

// Treasure Vault
//   W W W W W
//   W F F F W
//   W F $ F W
//   W F F F W
//   W W W W W</code></pre>

<!-- ============================================================ -->
<h2>11. Agent Skills Directory</h2>

<p>Browse the <code>~/.agents/</code> directory tree below. Click a folder to expand, click a file to preview its contents.</p>

<style>
#agents-browser{display:flex;gap:0;border:1px solid #333;border-radius:6px;margin:1em 0;min-height:480px;max-height:70vh;background:#1a1a1a;overflow:hidden}
#agents-tree{width:300px;min-width:300px;overflow-y:auto;border-right:1px solid #333;padding:8px 0;font-size:.85em;background:#161616}
#agents-viewer{flex:1;overflow-y:auto;padding:0}
.tree-node{display:flex;align-items:center;gap:6px;padding:3px 12px;cursor:pointer;color:#ccc;white-space:nowrap;user-select:none}
.tree-node:hover{background:#2a2a2a}
.tree-node.selected{background:#2a3a5a;color:#fff}
.tree-node .arrow{display:inline-block;width:14px;text-align:center;color:#666;font-size:.75em;flex-shrink:0}
.tree-node .arrow.empty{visibility:hidden}
.tree-node .icon{flex-shrink:0;font-size:1em;width:18px;text-align:center}
.tree-node .label{overflow:hidden;text-overflow:ellipsis}
.tree-children{display:none}
.tree-children.open{display:block}
.viewer-header{display:flex;align-items:center;gap:8px;padding:8px 16px;background:#1a1a1a;border-bottom:1px solid #333;font-size:.82em;color:#888;position:sticky;top:0;z-index:1}
.viewer-header .file-path{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.viewer-header .file-size{color:#555;flex-shrink:0}
.viewer-content{padding:0;margin:0;overflow-x:auto}
.viewer-content pre{margin:0;padding:12px 16px;background:#111;font-size:.82em;line-height:1.5;tab-size:2}
.viewer-content pre code{background:transparent;padding:0;font-family:'Cascadia Code','Fira Code','JetBrains Mono','Consolas',monospace}
.viewer-empty{display:flex;align-items:center;justify-content:center;height:100%;color:#555;font-size:.9em;padding:2em;text-align:center}
.tree-loading{padding:12px;color:#555;text-align:center;font-size:.85em}
.badge{display:inline-block;background:#2a2a2a;color:#888;padding:0 .4em;border-radius:3px;font-size:.8em;margin-left:6px}
.badge-md{background:#2a3a2a;color:#8f8}.badge-json{background:#3a3a2a;color:#ff8}.badge-js{background:#3a2a2a;color:#fa8}.badge-ts{background:#2a2a3a;color:#8af}.badge-img{background:#3a2a3a;color:#f8f}
.viewer-content .hl-kw{color:#ff79c6}.viewer-content .hl-str{color:#f1fa8c}.viewer-content .hl-com{color:#6272a4}
.viewer-content .hl-num{color:#bd93f9}.viewer-content .hl-section{color:#ffb86c;font-weight:bold}
.viewer-content .hl-link{color:#8be9fd;text-decoration:underline}
</style>

<div id="agents-browser">
  <div id="agents-tree"><div class="tree-loading">Loading...</div></div>
  <div id="agents-viewer">
    <div class="viewer-empty">Select a file to preview</div>
  </div>
</div>

<script>
(function(){
  var API = '/api/agents';
  var expanded = {};
  var selectedPath = null;
  var treeEl = document.getElementById('agents-tree');
  var viewerEl = document.getElementById('agents-viewer');

  function listDir(relPath, cb) {
    var x = new XMLHttpRequest();
    x.open('GET', API + '/list?path=' + encodeURIComponent(relPath), true);
    x.onload = function() { if (x.status===200) cb(null, JSON.parse(x.responseText).entries); else cb(new Error(String(x.status))); };
    x.onerror = function() { cb(new Error('Network error')); };
    x.send();
  }
  function readFile(relPath, cb) {
    var x = new XMLHttpRequest();
    x.open('GET', API + '/read?path=' + encodeURIComponent(relPath), true);
    x.onload = function() { if (x.status===200) cb(null, JSON.parse(x.responseText)); else cb(new Error(String(x.status))); };
    x.onerror = function() { cb(new Error('Network error')); };
    x.send();
  }

  function fileIcon(name) {
    var ext = name.split('.').pop().toLowerCase();
    if (['md','markdown'].includes(ext)) return '\uD83D\uDCC4';
    if (['json'].includes(ext)) return '\uD83D\uDCCB';
    if (['js','mjs','cjs'].includes(ext)) return '\uD83D\uDCDC';
    if (['ts','tsx'].includes(ext)) return '\uD83D\uDCD8';
    if (['yml','yaml','toml'].includes(ext)) return '\u2699\uFE0F';
    if (['html','css','scss'].includes(ext)) return '\uD83C\uDFA8';
    if (['png','jpg','jpeg','gif','svg','webp'].includes(ext)) return '\uD83D\uDDBC\uFE0F';
    if (['sh','bash','zsh'].includes(ext)) return '\uD83D\uDCBB';
    if (['py','rb','go','rs','java'].includes(ext)) return '\uD83D\uDD27';
    if (['txt','log'].includes(ext)) return '\uD83D\uDCDD';
    return '\uD83D\uDCC4';
  }

  function escapeHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function highlightCode(s) {
    return escapeHtml(s)
      .replace(/\b(const|let|var|function|return|import|export|if|else|for|while|class|async|await|new|throw|try|catch|typeof|interface|type|enum|extends|implements|private|public|static|abstract|package|module)\b/g,'<span class="hl-kw">$1</span>')
      .replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,'<span class="hl-str">$1</span>')
      .replace(/\b(\d+\.?\d*)\b/g,'<span class="hl-num">$1</span>')
      .replace(/\/\/[^\n]*/g,'<span class="hl-com">$&</span>');
  }

  function highlightMD(s) {
    return escapeHtml(s)
      .replace(/^#{1,6}\s+.+$/gm,'<span class="hl-section">$&</span>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<span class="hl-link">[$1]($2)</span>')
      .replace(/\`\`\`[\s\S]*?\`\`\`/g,function(m){return '<span class="hl-com">'+m+'</span>';})
      .replace(/\`[^\`]+\`/g,'<span class="hl-str">$&</span>');
  }

  function renderViewer(filePath) {
    viewerEl.innerHTML = '<div class="tree-loading">Loading...</div>';
    readFile(filePath, function(err, data) {
      if (err || !data) { viewerEl.innerHTML = '<div class="viewer-empty">Failed to load</div>'; return; }
      var ext = filePath.split('.').pop().toLowerCase();
      var hl = (['md','markdown'].includes(ext)) ? highlightMD(data.content) : highlightCode(data.content);
      var sizeStr = data.size < 1024 ? data.size + ' B' : (data.size / 1024).toFixed(1) + ' KB';
      var h = '<div class="viewer-header"><span class="file-path">' + fileIcon(filePath) + ' ' + escapeHtml(filePath) + '</span><span class="file-size">' + sizeStr + '</span></div>';
      h += '<div class="viewer-content"><pre><code>' + hl + '</code></pre></div>';
      viewerEl.innerHTML = h;
    });
  }

  function renderTree(relPath, parentEl) {
    parentEl.innerHTML = '<div class="tree-loading">Loading...</div>';
    listDir(relPath, function(err, entries) {
      if (err) { parentEl.innerHTML = ''; return; }
      parentEl.innerHTML = '';
      var depth = relPath ? relPath.split('/').length : 0;
      for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        var isDir = e.type === 'directory';
        var isExp = expanded[e.path] === true;
        (function(entry, dir, exp) {
          var node = document.createElement('div');
          node.className = 'tree-node';
          if (selectedPath === entry.path) node.classList.add('selected');
          node.style.paddingLeft = (12 + depth * 16) + 'px';
          var arrow = document.createElement('span');
          arrow.className = 'arrow' + (dir ? '' : ' empty');
          if (dir) arrow.textContent = exp ? '\u25BC' : '\u25B6';
          node.appendChild(arrow);
          var icon = document.createElement('span');
          icon.className = 'icon';
          icon.textContent = dir ? '\uD83D\uDCC1' : fileIcon(entry.name);
          node.appendChild(icon);
          var label = document.createElement('span');
          label.className = 'label';
          label.textContent = entry.name;
          node.appendChild(label);
          parentEl.appendChild(node);

          if (dir) {
            var ch = document.createElement('div');
            ch.className = 'tree-children' + (exp ? ' open' : '');
            parentEl.appendChild(ch);
            if (exp) renderTree(entry.path, ch);
            node.addEventListener('click', function(ev) {
              ev.stopPropagation();
              selectedPath = entry.path;
              document.querySelectorAll('.tree-node.selected').forEach(function(n){n.classList.remove('selected')});
              node.classList.add('selected');
              if (expanded[entry.path]) {
                expanded[entry.path] = false;
                ch.classList.remove('open');
                arrow.textContent = '\u25B6';
              } else {
                expanded[entry.path] = true;
                ch.classList.add('open');
                arrow.textContent = '\u25BC';
                if (ch.children.length === 0 || (ch.children.length === 1 && ch.children[0].className === 'tree-loading')) {
                  renderTree(entry.path, ch);
                }
              }
            });
          } else {
            node.addEventListener('click', function(ev) {
              ev.stopPropagation();
              selectedPath = entry.path;
              document.querySelectorAll('.tree-node.selected').forEach(function(n){n.classList.remove('selected')});
              node.classList.add('selected');
              renderViewer(entry.path);
            });
          }
        })(e, isDir, isExp);
      }
    });
  }

  renderTree('', treeEl);
})();
</script>

<hr>
<footer style="color:#555;font-size:.85em;margin-top:3em">
GlyphWeave — Tilemap editor and renderer.
Source: <a href="https://github.com/HsiangNianian/GlyphWeave">github.com/HsiangNianian/GlyphWeave</a>
</footer>

</body></html>`

  return {
    name: 'agents-browser',
    configureServer(server) {
      // ── Health check ──
      server.middlewares.use('/api/health', (_req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.end(JSON.stringify({ ok: true, version: 1 }))
      })

      // ── Render API (POST + GET) ──
      server.middlewares.use('/api/render', async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*')
        try {
          const u = new URL(req.url || '/', 'http://' + (req.headers.host || 'localhost'))
          const query = Object.fromEntries(u.searchParams)
          let data, themeId, padding, scale
          if (req.method === 'POST') {
            const chunks = []
            for await (const chunk of req) chunks.push(chunk)
            const body = Buffer.concat(chunks)
            const parsed = JSON.parse(body.toString('utf-8'))
            data = parsed
            themeId = query.theme || parsed.theme || parsed.themeId || 'ansi-16'
            padding = parseInt(query.padding, 10) || parseInt(parsed.padding, 10) || 1
            scale = query.scale ? parseFloat(query.scale) : (parsed.scale ? parseFloat(parsed.scale) : undefined)
          } else if (req.method === 'GET') {
            if (!query.data) { res.statusCode = 400; res.end('Missing "data" parameter'); return }
            const json = Buffer.from(query.data, 'base64').toString('utf-8')
            data = JSON.parse(json)
            themeId = query.theme || 'ansi-16'
            padding = parseInt(query.padding, 10) || 1
            scale = query.scale ? parseFloat(query.scale) : undefined
          } else {
            res.statusCode = 405; res.end('Method not allowed'); return
          }
          const pngBuffer = renderMap(data, { themeId, padding, scale })
          res.writeHead(200, {
            'Content-Type': 'image/png',
            'Content-Length': pngBuffer.length,
            'Cache-Control': 'public, max-age=3600',
          })
          res.end(pngBuffer)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          res.statusCode = 400
          res.end(`Error: ${msg}`)
        }
      })

      // ── Agents directory listing ──
      server.middlewares.use('/api/agents/list', (req, res, _next) => {
        const url = new URL(req.url || '/', 'http://' + (req.headers.host || 'localhost'))
        const relPath = url.searchParams.get('path') || ''
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.end(JSON.stringify({ entries: listEntries(relPath) }))
      })

      // ── Agents file reader ──
      server.middlewares.use('/api/agents/read', (req, res, _next) => {
        const url = new URL(req.url || '/', 'http://' + (req.headers.host || 'localhost'))
        const relPath = url.searchParams.get('path') || ''
        const result = readFileContent(relPath)
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Access-Control-Allow-Origin', '*')
        if (result) {
          res.end(JSON.stringify(result))
        } else {
          res.statusCode = 404
          res.end(JSON.stringify({ error: 'File not found or binary' }))
        }
      })

      // ── Main /api page (doc + tree browser) ──
      server.middlewares.use('/api', (req, res, next) => {
        const pathname = req.url || '/'
        if (pathname === '/' || pathname === '') {
          const addr = server.httpServer?.address()
          const port = addr && typeof addr !== 'string' ? addr.port : 5173
          res.writeHead(200, { 'Content-Type': 'text/html' })
          res.end(agentsInfoPage('http://localhost:' + port))
          return
        }
        next()
      })
    },

    writeBundle() {
      const outDir = path.resolve(__dirname, 'dist')
      const apiDir = path.join(outDir, 'api')
      const baseUrl = process.env.CF_PAGES_URL || process.env.PUBLIC_URL || 'https://[your-domain]'
      fs.mkdirSync(apiDir, { recursive: true })
      fs.writeFileSync(path.join(apiDir, 'index.html'), agentsInfoPage(baseUrl))
      console.log('[Agents] Generated api/index.html (baseUrl=' + baseUrl + ')')
    },
  }
}

export default defineConfig({
  server: {
    host: '0.0.0.0',
  },
  plugins: [react(), tailwindcss(), agentsBrowserPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
