/**
 * API documentation page shared across development, Node server, and Cloudflare Worker.
 */

export function apiDocPage(baseUrl) {
  const origin = baseUrl || 'http://localhost:3001'

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>GlyphWeave — Render API &amp; Map Format</title>
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
.note{background:#1a1a2a;border-left:3px solid #48f;padding:.8em 1em;border-radius:0 6px 6px 0;margin:1em 0}
.map-legend{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:6px;margin:1em 0}
.legend-item{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:4px;padding:.4em .6em;font-size:.85em;display:flex;align-items:center;gap:.6em}
.legend-item .char{font-family:monospace;font-size:1.2em;min-width:1.5em;text-align:center}
.legend-item .id{color:#888;font-size:.8em}
.category-label{color:#8cf;font-weight:bold;margin:1em 0 .3em 0}
.tag{display:inline-block;background:#2a2a2a;color:#888;padding:0 .4em;border-radius:3px;font-size:.8em;margin-right:.3em}
.tag-req{background:#3a1a1a;color:#f88}
.tag-opt{background:#1a2a1a;color:#8f8}
.tag-string{color:#8f8}
.tag-number{color:#8cf}
.tag-object{color:#fc8}
</style>
</head>
<body>

<h1>GlyphWeave Render API &amp; Map Format</h1>

<p>This page documents the GlyphWeave tilemap format (<strong>.gemap</strong>) and the Render API endpoint.</p>

<!-- ============================================================ -->
<h2>1. Map Data Format (.gemap JSON)</h2>

<p>A GlyphWeave map is a JSON object with the following structure.</p>

<h3>Top-level Schema</h3>
<pre><code>{
  "tiles":       {&lt;coord&gt;: &lt;tileId&gt;|null, ...},   // Flat tile map (required unless layerTiles used)
  "layerTiles":  {&lt;layerId&gt;: {&lt;coord&gt;: &lt;tileId&gt;|null, ...}, ...},
  "layers":      [{&lt;layer&gt;}, ...],
  "worldName":   "My Dungeon",
  "tileSize":    24,
  "themeId":     "ansi-16",
  "version":     2
}</code></pre>

<div class="note">
<strong>Note:</strong> The simplest valid map only needs a <code>tiles</code> object.
Coordinates not present in <code>tiles</code> are treated as void (empty space).
</div>

<h3>Coordinate System</h3>
<pre><code>"{x},{y}": "{tileId}"

Examples:
"0,0": "wall"       // Top-left corner
"5,3": "floor"      // Column 5, row 3
"10,7": "door"      // A door at (10, 7)
"2,4": null          // Erase tile at (2, 4)</code></pre>

<ul>
  <li>Coordinates are 0-indexed from top-left, format <code>"{x},{y}"</code></li>
  <li>Negative coordinates are valid — bounds auto-detect</li>
  <li>Setting a tile to <code>null</code> explicitly removes it</li>
</ul>

<!-- ============================================================ -->
<h2>2. Tile Type Reference</h2>

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
<h2>3. Layer System (Multi-layer Maps)</h2>

<pre><code>{
  "layerTiles": {
    "ground": { "0,0": "wall", "1,0": "floor" },
    "decor":  { "1,0": "blood" }
  },
  "layers": [
    { "id": "ground", "name": "Ground", "visible": true, "locked": false },
    { "id": "decor",  "name": "Decor",  "visible": true, "locked": false }
  ]
}</code></pre>

<p>Layer order determines render order (first = bottom). Flat <code>tiles</code> can be used instead for single-layer maps.</p>

<!-- ============================================================ -->
<h2>4. API Endpoints</h2>

<table>
<thead><tr><th>Path</th><th>Methods</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>/api/render</code></td><td>GET, POST</td><td>Render a tilemap to SVG (default) or PNG (<code>?format=png</code>)</td></tr>
<tr><td><code>/api/health</code></td><td>GET</td><td><code>{"ok":true,"version":1}</code></td></tr>
<tr><td><code>/api</code></td><td>GET</td><td>This documentation page</td></tr>
</tbody>
</table>

<h3>POST /api/render (any size)</h3>
<pre><code>POST ${origin}/api/render
Content-Type: application/json

{
  "tiles": { "0,0": "wall", "1,0": "floor", ... },
  "themeId": "ansi-16",
  "padding": 1,
  "scale": 24
}</code></pre>

<h3>GET /api/render (small maps, base64)</h3>
<pre><code>GET ${origin}/api/render?data=&lt;base64&gt;&amp;theme=ansi-16</code></pre>

<h3>Parameters</h3>
<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Default</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>theme</code></td><td>string</td><td><code>ansi-16</code></td><td>Theme ID (<code>ansi-16</code> or <code>cogmind</code>)</td></tr>
<tr><td><code>padding</code></td><td>number</td><td><code>1</code></td><td>Extra tile border</td></tr>
<tr><td><code>scale</code></td><td>number</td><td>auto</td><td>Pixels per tile (auto-fit ≤4096px)</td></tr>
<tr><td><code>format</code></td><td>string</td><td><code>svg</code></td><td>Output format (<code>svg</code> or <code>png</code>)</td></tr>
</tbody>
</table>

<h3>Examples</h3>
<pre><code># Render to SVG (default)
curl -X POST ${origin}/api/render \\
  -H "Content-Type: application/json" \\
  -d @my-map.gemap > map.svg

# Render to PNG
curl -X POST "${origin}/api/render?format=png" \\
  -H "Content-Type: application/json" \\
  -d @my-map.gemap > map.png</code></pre>

<!-- ============================================================ -->
<h2>5. Complete Map Examples</h2>

<h3>Minimal: 3×3 Room</h3>
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
    "terrain": { "0,0": "wall", "1,1": "lava", "1,2": "lava", ... },
    "structures": { "1,1": "bridge", "1,2": "bridge", "1,3": "bridge" }
  },
  "layers": [
    { "id": "terrain",    "name": "Terrain",    "visible": true, "locked": false },
    { "id": "structures", "name": "Structures", "visible": true, "locked": false }
  ],
  "themeId": "ansi-16"
}</code></pre>

<h3>Forest Clearing (negative coords)</h3>
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
<tr><td><code>ansi-16</code></td><td>ANSI 16</td><td>Classic ANSI terminal 16-color palette</td></tr>
<tr><td><code>cogmind</code></td><td>Cogmind Dark</td><td>Low-light cyberpunk terminal</td></tr>
</tbody>
</table>

<h2>7. LLM Authoring Guide</h2>

<div class="note">
<strong>For AI agents generating maps:</strong>
</div>

<h3>Design Principles</h3>
<ul>
  <li><strong>Enclose rooms with walls</strong> — every room needs a complete wall border</li>
  <li><strong>Use floors for walkable areas</strong> — <code>floor</code> (.) / <code>floorAlt</code> (,)</li>
  <li><strong>Doors connect spaces</strong> — place <code>door</code> (+) in wall openings</li>
  <li><strong>Corridors are 1-2 tiles wide</strong> — walls on both sides</li>
  <li><strong>Decorations add atmosphere</strong> — <code>blood</code>, <code>grave</code>, <code>trap</code></li>
  <li><strong>Stairs connect levels</strong> — <code>stairsDown</code> / <code>stairsUp</code></li>
</ul>

<h3>Common Room Patterns</h3>
<ul>
  <li><strong>Small room:</strong> 5×5 (3×3 interior)</li>
  <li><strong>Medium room:</strong> 7×7 (5×5 interior)</li>
  <li><strong>Large hall:</strong> 11×11 (9×9 interior)</li>
</ul>

<h3>Coordinate Mathematics</h3>
<pre><code># Room at (ox, oy), interior w×h
for y from oy to oy+h+1:
  for x from ox to ox+w+1:
    if border: tiles["{x},{y}"] = "wall"
    else:      tiles["{x},{y}"] = "floor"
# Door at south wall midpoint:
tiles["{ox+floor((w+1)/2)},{oy+h+1}"] = "door"</code></pre>

<hr>
<footer style="color:#555;font-size:.85em;margin-top:3em">
GlyphWeave &mdash; Tilemap editor and renderer.
Source: <a href="https://github.com/HsiangNianian/GlyphWeave">github.com/HsiangNianian/GlyphWeave</a>
</footer>

</body></html>`
}
