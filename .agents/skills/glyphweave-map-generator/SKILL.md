---
name: glyphweave-map-generator
description: Generates GlyphWeave tilemaps (.gemap format) from natural language descriptions. Use when the user asks to "generate a map", "create a dungeon", "make a tilemap", "设计一个地牢", "生成地图", "帮我画个地图", or describes a layout they want turned into a .gemap JSON file. Also for tasks like adding rooms/corridors to an existing map, converting an ASCII grid to gemap format, or explaining map design.
---

# GlyphWeave Map Generator

Generate valid GlyphWeave `.gemap` JSON tilemaps from natural language descriptions. This skill covers the map format, tile reference, design patterns, and generation workflow.

## 1. Map Format (.gemap JSON)

A GlyphWeave map is a JSON object. The only required field is `tiles` (flat) or `layerTiles + layers` (multi-layer).

```json
{
  "tiles":       { "0,0": "wall", "1,0": "floor", ... },
  "worldName":   "My Dungeon",
  "themeId":     "ansi-16",
  "version":     2
}
```

### Coordinate System

- Keys: `"{x},{y}"` — 0-indexed from top-left, no spaces
- Sparse: only non-void tiles need keys; omitted = void
- Negative coords are valid (bounds auto-detect)
- `null` value explicitly removes a tile

```json
{
  "tiles": {
    "0,0": "wall",
    "5,3": "floor",
    "10,7": "door",
    "2,4": null
  }
}
```

### Layer System (optional)

```json
{
  "layerTiles": {
    "ground": { "0,0": "wall", "1,0": "floor" },
    "decor":  { "1,0": "blood" }
  },
  "layers": [
    { "id": "ground", "name": "Ground", "visible": true, "locked": false },
    { "id": "decor",  "name": "Decor",  "visible": true, "locked": false }
  ]
}
```

- `layerTiles` requires matching `layers` array
- Render order: first layer = bottom, last = top
- Invisible layers (`visible: false`) are skipped during render

## 2. Tile Type Reference

All tile ID strings and their rendered characters:

### Walls
| ID | Char | Description |
|----|------|-------------|
| `wall` | `#` | Standard dungeon wall |
| `door` | `+` | Closed door |
| `doorOpen` | `'` | Open doorway |
| `pillar` | `0` | Support pillar |
| `bar` | `│` | Tavern bar / fence |

### Floors
| ID | Char | Description |
|----|------|-------------|
| `floor` | `.` | Standard floor |
| `floorAlt` | `,` | Alternate floor (variation) |
| `bridge` | `═` | Bridge over water/lava |

### Water
| ID | Char | Description |
|----|------|-------------|
| `water` | `~` | Shallow water |
| `deepWater` | `≈` | Deep water |

### Terrain
| ID | Char | Description |
|----|------|-------------|
| `lava` | `~` | Lava (rendered orange/red) |
| `void` | ` ` | Empty space (omit from tiles) |

### Vegetation
| ID | Char | Description |
|----|------|-------------|
| `tree` | `♣` | Tree |
| `grass` | `"` | Grass / undergrowth |

### Furniture
| ID | Char | Description |
|----|------|-------------|
| `altar` | `≡` | Ritual altar |
| `fountain` | `♦` | Fountain |
| `shop` | `Σ` | Merchant shop |
| `table` | `▤` | Table |
| `throne` | `Ψ` | Throne |
| `cage` | `█` | Prison cage |

### Items
| ID | Char | Description |
|----|------|-------------|
| `treasure` | `$` | Treasure pile |

### Decorations
| ID | Char | Description |
|----|------|-------------|
| `grave` | `☠` | Grave / tombstone |
| `trap` | `^` | Floor trap |
| `blood` | `;` | Bloodstain |

### Special
| ID | Char | Description |
|----|------|-------------|
| `stairsDown` | `>` | Stairs leading down |
| `stairsUp` | `<` | Stairs leading up |

## 3. Themes

| Theme ID | Name | Vibe |
|----------|------|------|
| `ansi-16` | ANSI 16 | Classic terminal 16-color — bold, vibrant |
| `cogmind` | Cogmind Dark | Low-light cyberpunk — muted, cold, atmospheric |

Each theme defines `fgColor` + `bgColor` for every tile type. Pass as `themeId` in the JSON or `?theme=` query parameter.

## 4. Design Principles

### Room Geometry
- **Small room**: 5x5 (wall border + 3x3 floor interior)
- **Medium room**: 7x7 (wall border + 5x5 floor interior)  
- **Large hall**: 11x11 (wall border + 9x9 floor interior)
- **Corridor**: 1-2 tiles wide, walls on both sides

### Layout Rules
- Every room needs a complete wall border
- Doors (`door`) go in wall openings between rooms and corridors
- Corridors connect doors to other rooms
- Decorations (`blood`, `grave`, `grass`) sit on floor tiles
- Stairs connect levels: entrance → `stairsDown`, deeper → `stairsUp`

### Coordinate Math (room generation)
A room at `(ox, oy)` with interior size `(w, h)`:

```
for y = oy to oy + h + 1:
  for x = ox to ox + w + 1:
    if x == ox or x == ox + w + 1 or y == oy or y == oy + h + 1:
      tile[x,y] = "wall"
    else:
      tile[x,y] = "floor"
```

For a door at the south wall midpoint:
```
doorX = ox + floor((w + 1) / 2)
tile[doorX, oy + h + 1] = "door"
```

### Corridor Carving
**Horizontal** (at row `y`, from `x` for `len` tiles):
```
for dx = 0 to len - 1:
  tile[x + dx, y]     = "floor"
  tile[x + dx, y - 1] = "wall"  (if not already something else)
  tile[x + dx, y + 1] = "wall"  (if not already something else)
```

**Vertical** (at column `x`, from `y` for `len` tiles):
```
for dy = 0 to len - 1:
  tile[x, y + dy]     = "floor"
  tile[x - 1, y + dy] = "wall"  (if not already something else)
  tile[x + 1, y + dy] = "wall"  (if not already something else)
```

## 5. Generation Workflow

When the user asks for a map, follow this process:

### Step 1: Clarify requirements
Ask (or infer if clear from the request):
- Map size / number of rooms
- Theme / atmosphere
- Special features (water, lava, traps, treasure)
- Multi-level or single-level

### Step 2: Plan the layout
Sketch a rough layout in terms of rooms and corridors:
```
Entrance Hall → corridor → Cross Hub (center)
                         ↙ ↓ ↘
              Throne Room  Shop  Prison
                         |
                      Stairs Down
```

### Step 3: Generate tiles
- Assign coordinates to each room/corridor
- Generate walls, floors, doors
- Add decorations and features

### Step 4: Assemble JSON
```json
{
  "tiles": {
    "0,0": "wall", "1,0": "wall", ...
  },
  "themeId": "ansi-16",
  "worldName": "Generated Dungeon"
}
```

### Step 5: Offer to preview
Let the user know they can render the map via:
```
curl -X POST http://localhost:5173/api/render \
  -H "Content-Type: application/json" \
  -d @map.gemap > map.png
```
Or if using gh-pages:
```
curl -X POST https://hsiangnianian.github.io/GlyphWeave/api/render \
  -H "Content-Type: application/json" \
  -d @map.gemap > map.png
```

## 6. Common Room Patterns (ASCII Grids)

These patterns show the tile layout (W=wall, F=floor, D=door, _=void):

### Small Room
```
W W W W W
W F F F W
W F F F W
W F F F W
W W W W W
```

### Entrance Hall
```
W W W W W W W
D F F F F F D
W F F F F F W
W F F s F F W
W F F F F F W
D F F F F F D
W W W W W W W
```
(s = stairsDown)

### Cross Junction
```
_ _ W F W _ _
_ _ W F W _ _
F F F F F F F
W F W W F W W
F F F F F F F
_ _ W F W _ _
_ _ W F W _ _
```

### Treasure Vault
```
W W W W W
W F F F W
W F $ F W
W F F F W
W W W W W
```

### Lake
```
_ _ w w w _ _
_ w w w w w _
w w w w w w w
w w w w w w w
w w w w w w w
_ w w w w w _
_ _ w w w _ _
```

## 7. Map Scale Guidelines

| Scale | Grid Size | Rooms | Complexity |
|-------|-----------|-------|------------|
| Small | ~20x20 | 3-5 | Simple layout, 1-2 features |
| Medium | ~40x30 | 6-10 | Multiple rooms + corridors, varied tiles |
| Large | ~80x48 | 10-20 | Full dungeon with themed areas |

Render output auto-scales to fit ≤4096px. For crisp detail, suggest `scale: 24`.

## 8. Example: Complete Dungeon

A 5-room dungeon with central hub:

```json
{
  "tiles": {
    "2,2": "wall", "3,2": "wall", "4,2": "wall", "5,2": "wall", "6,2": "wall",
    "2,3": "wall", "3,3": "floor", "4,3": "floor", "5,3": "floor", "6,3": "wall",
    "2,4": "wall", "3,4": "stairsDown", "4,4": "floor", "5,4": "floor", "6,4": "wall",
    "2,5": "wall", "3,5": "floor", "4,5": "floor", "5,5": "floor", "6,5": "wall",
    "2,6": "wall", "3,6": "door", "4,6": "wall", "5,6": "wall", "6,6": "wall",
    "3,7": "floor", "4,7": "floor", "5,7": "floor",
    "3,8": "floor", "4,8": "floor", "5,8": "floor",
    "2,9": "wall", "3,9": "door", "4,9": "wall", "5,9": "wall", "6,9": "wall",
    "2,10": "wall", "3,10": "floor", "4,10": "floor", "5,10": "floor", "6,10": "wall",
    "2,11": "wall", "3,11": "floor", "4,11": "throne", "5,11": "floor", "6,11": "wall",
    "2,12": "wall", "3,12": "floor", "4,12": "floor", "5,12": "floor", "6,12": "wall",
    "2,13": "wall", "3,13": "wall", "4,13": "wall", "5,13": "wall", "6,13": "wall"
  },
  "themeId": "ansi-16"
}
```

This generates:
- Entrance room (top) with stairs down
- 3-tile vertical corridor
- Throne room (bottom) with throne feature
- Doors connecting corridor to rooms

## 9. Working with Existing Maps

When the user provides an existing `.gemap` JSON:
1. Parse the `tiles` (or `layerTiles`) to understand current layout
2. Identify empty/void areas where new rooms can fit
3. Generate new rooms with corridors connecting to existing doors/openings
4. Merge new tiles into the existing object (avoiding overwrites unless requested)
5. Return the updated JSON

To add a corridor from `(x1, y1)` to `(x2, y2)`:
- Horizontal then vertical (or vice versa), 1 tile wide
- Flank with walls on outer edges
- If crossing existing void, walls fill the sides
