/**
 * API documentation page shared across development, Node server, and Cloudflare Worker.
 */

export function apiDocPage(baseUrl) {
  const origin = baseUrl || 'https://glyphweave.hydroroll.team'

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>GlyphWeave — Render / Convert API &amp; Map Format</title>
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
.badge{display:inline-block;background:#2a2a2a;color:#888;padding:0 .4em;border-radius:3px;font-size:.8em;margin-left:6px}
.badge-md{background:#2a3a2a;color:#8f8}.badge-json{background:#3a3a2a;color:#ff8}.badge-js{background:#3a2a2a;color:#fa8}.badge-ts{background:#2a2a3a;color:#8af}.badge-img{background:#3a2a3a;color:#f8f}
.viewer-content .hl-kw{color:#ff79c6}.viewer-content .hl-str{color:#f1fa8c}.viewer-content .hl-com{color:#6272a4}
.viewer-content .hl-num{color:#bd93f9}.viewer-content .hl-section{color:#ffb86c;font-weight:bold}
.viewer-content .hl-link{color:#8be9fd;text-decoration:underline}
</style>
</head>
<body>

<h1>GlyphWeave Render / Convert API &amp; Map Format</h1>

<p>This page documents the GlyphWeave tilemap format (<strong>.gemap</strong>), Render API, and Convert API.
It is designed for both humans and LLMs to read and understand how to generate valid maps.</p>

<div id="playground" style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:1.5rem;margin:1.5rem 0">
<h2 style="color:#8cf;margin:0 0 .5rem 0;border:none;padding:0;font-size:1.1rem">Playground</h2>
<div style="display:flex;gap:.4rem;margin:0 0 1rem 0;flex-wrap:wrap">
  <button id="pg-tab-render" data-mode="render" style="background:#2563eb;color:#fff;border:1px solid #3774f0;border-radius:4px;padding:.45em .9em;font-size:.85em;cursor:pointer">Render Map</button>
  <button id="pg-tab-convert" data-mode="convert" style="background:#111;color:#8cf;border:1px solid #333;border-radius:4px;padding:.45em .9em;font-size:.85em;cursor:pointer">Convert Image</button>
</div>
<p id="pg-help" style="color:#888;font-size:.85em;margin:0 0 1rem 0">Edit the map JSON below and click Render to see the result. Try changing <code style="font-size:.9em">"wall"</code> to <code style="font-size:.9em">"lava"</code> or switching the theme.</p>

<div id="pg-render-panel">
  <div style="display:flex;gap:1rem;flex-wrap:wrap">
    <div style="flex:1;min-width:300px">
      <textarea id="pg-json" style="width:100%;height:260px;background:#111;color:#ccc;border:1px solid #333;border-radius:4px;padding:.6em;font-family:monospace;font-size:.82em;resize:vertical;tab-size:2" spellcheck="false"></textarea>
    </div>
    <div style="flex:1;min-width:200px;display:flex;flex-direction:column">
      <div id="pg-preview" style="flex:1;background:#000;border:1px solid #333;border-radius:4px;min-height:200px;display:flex;align-items:center;justify-content:center;overflow:hidden;padding:8px">
        <span style="color:#555;font-size:.85em">Click Render</span>
      </div>
    </div>
  </div>
  <div style="display:flex;gap:.8rem;margin-top:.8rem;align-items:center;flex-wrap:wrap">
    <label style="color:#888;font-size:.82em;display:flex;align-items:center;gap:.4em">
      Theme:
      <select id="pg-theme" style="background:#111;color:#ccc;border:1px solid #333;border-radius:3px;padding:.3em .5em;font-size:.9em">
        <option value="ansi-16">ansi-16</option>
        <option value="cogmind">cogmind</option>
      </select>
    </label>
    <label style="color:#888;font-size:.82em;display:flex;align-items:center;gap:.4em">
      Padding:
      <input id="pg-padding" type="number" min="0" max="10" value="1" style="background:#111;color:#ccc;border:1px solid #333;border-radius:3px;padding:.3em .5em;width:60px;font-size:.9em">
    </label>
    <label style="color:#888;font-size:.82em;display:flex;align-items:center;gap:.4em">
      Scale:
      <input id="pg-scale" type="number" min="0" max="96" placeholder="auto" style="background:#111;color:#ccc;border:1px solid #333;border-radius:3px;padding:.3em .5em;width:70px;font-size:.9em">
    </label>
    <button id="pg-render" style="background:#2563eb;color:#fff;border:none;border-radius:4px;padding:.5em 1.2em;font-size:.85em;cursor:pointer">Render</button>
    <button id="pg-examples" style="background:#1a3a5a;color:#8cf;border:1px solid #2a4a6a;border-radius:4px;padding:.5em .8em;font-size:.82em;cursor:pointer;margin-left:auto">Load Example</button>
  </div>
</div>

<div id="pg-convert-panel" hidden>
  <div style="display:flex;gap:1rem;flex-wrap:wrap">
    <div style="flex:1;min-width:300px;display:flex;flex-direction:column;gap:.8rem">
      <label style="color:#888;font-size:.82em;display:flex;flex-direction:column;gap:.35em">
        Image:
        <input id="pg-image" type="file" accept="image/png,image/jpeg,image/webp" style="background:#111;color:#ccc;border:1px solid #333;border-radius:3px;padding:.45em;font-size:.9em">
      </label>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:.7rem">
        <label style="color:#888;font-size:.82em;display:flex;flex-direction:column;gap:.35em">
          Theme ID:
          <select id="pg-convert-theme" style="background:#111;color:#ccc;border:1px solid #333;border-radius:3px;padding:.4em .5em;font-size:.9em">
            <option value="ansi-16">ansi-16</option>
            <option value="cogmind">cogmind</option>
          </select>
        </label>
        <label style="color:#888;font-size:.82em;display:flex;flex-direction:column;gap:.35em">
          Width:
          <input id="pg-convert-width" type="number" min="1" max="512" value="160" style="background:#111;color:#ccc;border:1px solid #333;border-radius:3px;padding:.4em .5em;font-size:.9em">
        </label>
        <label style="color:#888;font-size:.82em;display:flex;flex-direction:column;gap:.35em">
          Height:
          <input id="pg-convert-height" type="number" min="1" max="512" placeholder="auto" style="background:#111;color:#ccc;border:1px solid #333;border-radius:3px;padding:.4em .5em;font-size:.9em">
        </label>
        <label style="color:#888;font-size:.82em;display:flex;flex-direction:column;gap:.35em">
          Output:
          <select id="pg-convert-format" style="background:#111;color:#ccc;border:1px solid #333;border-radius:3px;padding:.4em .5em;font-size:.9em">
            <option value="svg">svg</option>
            <option value="gemap">gemap</option>
            <option value="both">both</option>
            <option value="png">png</option>
          </select>
        </label>
      </div>
      <label style="color:#888;font-size:.82em;display:flex;flex-direction:column;gap:.35em">
        Custom theme JSON (optional):
        <textarea id="pg-convert-custom-theme" placeholder='{"id":"custom","colors":{...}}' style="width:100%;height:92px;background:#111;color:#ccc;border:1px solid #333;border-radius:4px;padding:.6em;font-family:monospace;font-size:.82em;resize:vertical;tab-size:2" spellcheck="false"></textarea>
      </label>
      <div style="display:flex;gap:.6rem;align-items:center;flex-wrap:wrap">
        <button id="pg-convert" style="background:#2563eb;color:#fff;border:none;border-radius:4px;padding:.5em 1.2em;font-size:.85em;cursor:pointer">Convert</button>
        <a id="pg-download" href="#" download="converted.svg" style="display:none;color:#8cf;font-size:.85em">Download result</a>
      </div>
    </div>
    <div style="flex:1;min-width:240px;display:flex;flex-direction:column;gap:.7rem">
      <div id="pg-convert-preview" style="background:#000;border:1px solid #333;border-radius:4px;min-height:200px;display:flex;align-items:center;justify-content:center;overflow:hidden;padding:8px">
        <span style="color:#555;font-size:.85em">Choose an image</span>
      </div>
      <textarea id="pg-convert-output" readonly style="width:100%;height:110px;background:#111;color:#888;border:1px solid #333;border-radius:4px;padding:.6em;font-family:monospace;font-size:.78em;resize:vertical;tab-size:2" spellcheck="false"></textarea>
    </div>
  </div>
</div>
</div>

<script>
(function() {
  var origin = '${origin}';
  var examples = [
    {
      name: '3×3 Room',
      json: JSON.stringify({"tiles":{"0,0":"wall","1,0":"wall","2,0":"wall","0,1":"wall","1,1":"floor","2,1":"wall","0,2":"wall","1,2":"wall","2,2":"wall"},"themeId":"ansi-16"}, null, 2)
    },
    {
      name: 'Dungeon Entrance',
      json: JSON.stringify({"tiles":{"0,0":"wall","1,0":"wall","2,0":"wall","3,0":"wall","4,0":"wall","0,1":"wall","1,1":"floor","2,1":"floor","3,1":"floor","4,1":"wall","0,2":"wall","1,2":"floor","2,2":"stairsDown","3,2":"floor","4,2":"wall","0,3":"wall","1,3":"floor","2,3":"floor","3,3":"floor","4,3":"wall","0,4":"wall","1,4":"door","2,4":"wall","3,4":"wall","4,4":"wall"},"themeId":"ansi-16"}, null, 2)
    },
    {
      name: 'Lava Cave',
      json: JSON.stringify({"layerTiles":{"terrain":{"0,0":"wall","1,0":"wall","2,0":"wall","3,0":"wall","4,0":"wall","0,1":"wall","1,1":"lava","2,1":"lava","3,1":"lava","4,1":"wall","0,2":"wall","1,2":"lava","2,2":"lava","3,2":"lava","4,2":"wall","0,3":"wall","1,3":"lava","2,3":"lava","3,3":"lava","4,3":"wall","0,4":"wall","1,4":"wall","2,4":"wall","3,4":"wall","4,4":"wall"},"structures":{"1,1":"bridge","1,2":"bridge","1,3":"bridge"}},"layers":[{"id":"terrain","name":"Terrain","visible":true,"locked":false},{"id":"structures","name":"Structures","visible":true,"locked":false}],"themeId":"ansi-16"}, null, 2)
    },
    {
      name: 'Forest Clearing',
      json: JSON.stringify({"tiles":{"-2,-2":"tree","-1,-2":"tree","0,-2":"tree","-2,-1":"tree","-1,-1":"grass","0,-1":"tree","-2,0":"grass","-1,0":"fountain","0,0":"grass","-2,1":"tree","-1,1":"grass","0,1":"tree","-2,2":"tree","-1,2":"tree","0,2":"tree"},"themeId":"cogmind"}, null, 2)
    }
  ];
  var exampleIdx = 0;

  var textarea = document.getElementById('pg-json');
  var preview = document.getElementById('pg-preview');
  var themeSelect = document.getElementById('pg-theme');
  var paddingInput = document.getElementById('pg-padding');
  var scaleInput = document.getElementById('pg-scale');
  var renderBtn = document.getElementById('pg-render');
  var examplesBtn = document.getElementById('pg-examples');
  var helpText = document.getElementById('pg-help');
  var renderPanel = document.getElementById('pg-render-panel');
  var convertPanel = document.getElementById('pg-convert-panel');
  var tabRender = document.getElementById('pg-tab-render');
  var tabConvert = document.getElementById('pg-tab-convert');
  var imageInput = document.getElementById('pg-image');
  var convertPreview = document.getElementById('pg-convert-preview');
  var convertOutput = document.getElementById('pg-convert-output');
  var convertTheme = document.getElementById('pg-convert-theme');
  var convertWidth = document.getElementById('pg-convert-width');
  var convertHeight = document.getElementById('pg-convert-height');
  var convertFormat = document.getElementById('pg-convert-format');
  var convertCustomTheme = document.getElementById('pg-convert-custom-theme');
  var convertBtn = document.getElementById('pg-convert');
  var downloadLink = document.getElementById('pg-download');
  var activeDownloadUrl = null;

  // Set default example
  textarea.value = examples[0].json;
  themeSelect.value = 'ansi-16';

  function clearDownload() {
    if (activeDownloadUrl) URL.revokeObjectURL(activeDownloadUrl);
    activeDownloadUrl = null;
    downloadLink.style.display = 'none';
    downloadLink.removeAttribute('href');
  }

  function setDownload(blob, filename) {
    clearDownload();
    activeDownloadUrl = URL.createObjectURL(blob);
    downloadLink.href = activeDownloadUrl;
    downloadLink.download = filename;
    downloadLink.style.display = 'inline';
  }

  function setTabButton(button, active) {
    button.style.background = active ? '#2563eb' : '#111';
    button.style.color = active ? '#fff' : '#8cf';
    button.style.borderColor = active ? '#3774f0' : '#333';
  }

  function setMode(mode) {
    var isConvert = mode === 'convert';
    renderPanel.hidden = isConvert;
    convertPanel.hidden = !isConvert;
    setTabButton(tabRender, !isConvert);
    setTabButton(tabConvert, isConvert);
    helpText.innerHTML = isConvert
      ? 'Upload an image, choose a theme, and convert it into a GlyphWeave map using nearest theme-color tile matching.'
      : 'Edit the map JSON below and click Render to see the result. Try changing <code style="font-size:.9em">"wall"</code> to <code style="font-size:.9em">"lava"</code> or switching the theme.';
  }

  function showBlobImage(container, blob, alt) {
    var imageUrl = URL.createObjectURL(blob);
    container.innerHTML = '<img src="' + imageUrl + '" alt="' + alt + '" style="max-width:100%;max-height:320px;border-radius:2px">';
    var image = container.querySelector('img');
    if (image) image.onload = function() { URL.revokeObjectURL(imageUrl); };
  }

  function render() {
    clearDownload();
    var json;
    try {
      json = JSON.parse(textarea.value);
    } catch(e) {
      preview.innerHTML = '<span style="color:#f88;font-size:.82em">JSON Error: ' + e.message + '</span>';
      return;
    }

    // Apply controls — query params override body fields
    if (themeSelect.value) json.themeId = themeSelect.value;
    var pad = parseInt(paddingInput.value, 10);
    if (!isNaN(pad)) json.padding = pad;
    var sc = parseFloat(scaleInput.value);
    if (!isNaN(sc)) json.scale = sc;

    preview.innerHTML = '<span style="color:#555;font-size:.85em">Rendering...</span>';

    fetch(origin + '/api/render?format=svg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(json)
    })
      .then(function(response) {
        if (!response.ok) {
          return response.text().then(function(message) {
            throw new Error('Error ' + response.status + ': ' + (message || 'unknown'));
          });
        }
        return response.blob();
      })
      .then(function(blob) {
        showBlobImage(preview, blob, 'rendered map');
      })
      .catch(function(error) {
        preview.innerHTML = '<span style="color:#f88;font-size:.82em">' + error.message + '</span>';
      });
  }

  function convertImage() {
    clearDownload();
    convertOutput.value = '';
    if (!imageInput.files || !imageInput.files[0]) {
      convertPreview.innerHTML = '<span style="color:#f88;font-size:.82em">Choose an image first</span>';
      return;
    }

    var params = new URLSearchParams();
    params.set('width', convertWidth.value || '160');
    if (convertHeight.value) params.set('height', convertHeight.value);
    params.set('format', convertFormat.value || 'svg');

    var form = new FormData();
    form.append('image', imageInput.files[0]);
    if (convertCustomTheme.value.trim()) {
      form.append('theme', convertCustomTheme.value.trim());
    } else {
      form.append('themeId', convertTheme.value || 'ansi-16');
    }

    convertPreview.innerHTML = '<span style="color:#555;font-size:.85em">Converting...</span>';

    fetch(origin + '/api/convert?' + params.toString(), {
      method: 'POST',
      body: form
    })
      .then(function(response) {
        if (!response.ok) {
          return response.text().then(function(message) {
            throw new Error('Error ' + response.status + ': ' + (message || 'unknown'));
          });
        }
        return response.blob().then(function(blob) {
          return { blob: blob, contentType: response.headers.get('Content-Type') || '' };
        });
      })
      .then(function(result) {
        var format = convertFormat.value || 'svg';
        if (result.contentType.indexOf('image/') === 0) {
          showBlobImage(convertPreview, result.blob, 'converted map');
          convertOutput.value = result.contentType + ' · ' + result.blob.size + ' bytes';
          setDownload(result.blob, format === 'png' ? 'converted.png' : 'converted.svg');
          return;
        }

        return result.blob.text().then(function(text) {
          convertOutput.value = text;
          setDownload(new Blob([text], { type: 'application/json' }), format === 'gemap' ? 'converted.gemap' : 'converted.json');
          try {
            var parsed = JSON.parse(text);
            if (parsed.svg) {
              showBlobImage(convertPreview, new Blob([parsed.svg], { type: 'image/svg+xml' }), 'converted map');
            } else {
              convertPreview.innerHTML = '<span style="color:#8cf;font-size:.82em">Map JSON generated</span>';
            }
          } catch (_err) {
            convertPreview.innerHTML = '<span style="color:#8cf;font-size:.82em">Response generated</span>';
          }
        });
      })
      .catch(function(error) {
        convertPreview.innerHTML = '<span style="color:#f88;font-size:.82em">' + error.message + '</span>';
      });
  }

  renderBtn.addEventListener('click', render);
  convertBtn.addEventListener('click', convertImage);
  tabRender.addEventListener('click', function() { setMode('render'); });
  tabConvert.addEventListener('click', function() { setMode('convert'); });
  imageInput.addEventListener('change', function() {
    clearDownload();
    convertOutput.value = '';
    if (imageInput.files && imageInput.files[0]) {
      convertPreview.innerHTML = '<span style="color:#8cf;font-size:.82em">' + imageInput.files[0].name + ' ready</span>';
    }
  });

  examplesBtn.addEventListener('click', function() {
    exampleIdx = (exampleIdx + 1) % examples.length;
    var ex = examples[exampleIdx];
    textarea.value = ex.json;
    examplesBtn.textContent = 'Load Example (' + ex.name + ')';
    // Auto-render on example load
    setTimeout(render, 50);
  });

  // Auto-render on load
  setMode('render');
  setTimeout(render, 100);

  // Keyboard shortcut: Ctrl+Enter to render
  textarea.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      render();
    }
  });
})();
</script>
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

<h3>Tile ID Quick Reference (for LLMs)</h3>

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
<h2>3. Layer System (Multi-layer Maps)</h2>

<p>Maps can have multiple layers. When layers are used, the renderer flattens them:
visible layers are composited top-to-bottom, with later layers overwriting earlier ones at the same coordinates.</p>

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

<p>For simple single-layer maps, just use the flat <code>tiles</code> field.</p>

<!-- ============================================================ -->
<h2>4. API Endpoints</h2>

<table>
<thead><tr><th>Path</th><th>Methods</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>/api/render</code></td><td>GET, POST</td><td>Render a tilemap to PNG or SVG</td></tr>
<tr><td><code>/api/convert</code></td><td>POST</td><td>Convert an image to a theme-matched GlyphWeave map</td></tr>
<tr><td><code>/api/health</code></td><td>GET</td><td><code>{"ok":true,"version":1}</code></td></tr>
<tr><td><code>/api</code></td><td>GET</td><td>This documentation page</td></tr>
</tbody>
</table>

<h3>POST /api/render (recommended, any size map)</h3>
<pre><code>POST ${origin}/api/render
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
<tr><td><code>format</code></td><td>string</td><td>environment</td><td><code>png</code> or <code>svg</code>; PNG requires Node</td></tr>
</tbody>
</table>

<h3>GET /api/render (small maps, via base64)</h3>
<pre><code>GET ${origin}/api/render?data=&lt;base64-urlencoded-json&gt;&amp;theme=ansi-16</code></pre>

<p>The <code>data</code> parameter is the entire map JSON, base64-encoded and URL-encoded.
Best for small maps; use POST for larger maps.</p>

<h3>GET /api/health</h3>
<pre><code>GET ${origin}/api/health</code></pre>

<p>Returns <code>{"ok":true,"version":1}</code>.</p>

<h3>POST /api/convert (image to GlyphWeave map)</h3>
<pre><code>POST ${origin}/api/convert?themeId=ansi-16&amp;width=160&amp;format=svg
Content-Type: image/png

&lt;binary image bytes&gt;</code></pre>

<p>The converter samples the image into a tile grid, then picks the nearest tile
color from the supplied theme. Either <code>themeId</code> or <code>theme</code> is required.</p>

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Default</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>themeId</code></td><td>string</td><td>required</td><td>Built-in theme ID, such as <code>ansi-16</code> or <code>cogmind</code></td></tr>
<tr><td><code>theme</code></td><td>object/string</td><td>required</td><td>Custom theme JSON object, or a built-in theme ID alias</td></tr>
<tr><td><code>width</code></td><td>integer</td><td><code>160</code></td><td>Output map width, max 512</td></tr>
<tr><td><code>height</code></td><td>integer</td><td>auto</td><td>Output map height, max 512</td></tr>
<tr><td><code>format</code></td><td>string</td><td><code>svg</code></td><td><code>svg</code>, <code>png</code>, <code>gemap</code>, or <code>both</code></td></tr>
<tr><td><code>worldName</code></td><td>string</td><td><code>converted-image</code></td><td>Name stored in generated map JSON</td></tr>
<tr><td><code>alphaThreshold</code></td><td>number</td><td><code>16</code></td><td>Pixels at or below this alpha become void</td></tr>
</tbody>
</table>

<p>Supported request bodies: raw <code>image/png</code>, <code>image/jpeg</code>, or
<code>image/webp</code>; <code>multipart/form-data</code> with an <code>image</code> file
and theme fields; or JSON with <code>imageBase64</code>.</p>

<h3>GET /api</h3>
<p>This page.</p>

<!-- ============================================================ -->
<h2>5. curl Examples</h2>

<h3>Render a map from a .gemap file</h3>
<pre><code>curl -X POST "${origin}/api/render?format=svg" \\
  -H "Content-Type: application/json" \\
  -d @my-map.gemap > my-map.svg</code></pre>

<h3>Render with theme override</h3>
<pre><code>curl -X POST "${origin}/api/render?theme=cogmind&amp;format=svg" \\
  -H "Content-Type: application/json" \\
  -d @my-map.gemap > my-map-cogmind.svg</code></pre>

<h3>Render a small inline map (GET)</h3>
<pre><code># Generate the base64 data first:
echo -n '{"tiles":{"0,0":"wall"}}' | base64 -w0

curl "${origin}/api/render?data=eyJ0aWxlcyI6eyIwLDAiOiJ3YWxsIn19&amp;theme=ansi-16&amp;format=svg" > tiny.svg</code></pre>

<h3>Render inline JSON (POST)</h3>
<pre><code>curl -X POST "${origin}/api/render?format=svg" \\
  -H "Content-Type: application/json" \\
  -d '{"tiles":{"0,0":"wall","1,0":"floor","0,1":"floor","1,1":"floor"},"themeId":"ansi-16"}' \\
  > 2x2.svg</code></pre>

<h3>Convert an image to SVG</h3>
<pre><code>curl -X POST "${origin}/api/convert?themeId=ansi-16&amp;width=160&amp;format=svg" \\
  -H "Content-Type: image/png" \\
  --data-binary @input.png > converted.svg</code></pre>

<h3>Convert an image to map JSON and SVG</h3>
<pre><code>curl -X POST "${origin}/api/convert?width=160&amp;format=both" \\
  -F "image=@input.webp" \\
  -F "theme=@my-theme.json" > converted.json</code></pre>

<h3>Using with pipes (convert to PNG on the client)</h3>
<pre><code># With rsvg-convert (Linux)
curl -s -X POST "${origin}/api/render?format=svg" \\
  -H "Content-Type: application/json" \\
  -d @map.gemap | rsvg-convert > map.png

# With Inkscape
curl -s -X POST "${origin}/api/render?format=svg" \\
  -H "Content-Type: application/json" \\
  -d @map.gemap | inkscape --pipe --export-type=png -o map.png</code></pre>

<!-- ============================================================ -->
<h2>6. Complete Map Examples</h2>

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
<h2>7. Themes</h2>

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
<h2>8. LLM Authoring Guide</h2>

<div class="note">
<strong>For LLMs generating maps:</strong> Follow these guidelines to produce valid, visually coherent maps.
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
<h2>9. Preset Building Blocks</h2>

<p>Below are some common grid patterns (W=wall, F=floor, _=void):</p>

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

</footer>

</body></html>`
}
