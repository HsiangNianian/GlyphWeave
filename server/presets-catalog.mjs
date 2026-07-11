/**
 * Presets Catalog — single source of truth for preset metadata used by the AI.
 *
 * When adding a new preset:
 * 1. Add the grid data to `src/constants/presets.ts`
 * 2. Add its metadata entry here
 *
 * Everything else (tool descriptions, system prompt, tile palette) is
 * auto-generated from this catalog — no manual string updates needed.
 */

/**
 * @typedef {Object} PresetMeta
 * @property {string}   id          — unique preset ID (matches presets.ts)
 * @property {string}   name        — human-readable name
 * @property {string}   description — one-line description
 * @property {string}   category    — rooms | corridors | features | dungeon | traps
 * @property {number}   width       — grid width in tiles
 * @property {number}   height      — grid height in tiles
 */

/** @type {PresetMeta[]} */
export const PRESETS_CATALOG = [
  // ── Rooms ──────────────────────────────────────────────
  { id: 'small-room',     name: 'Small Room',     description: 'A cozy 5×5 room.',                               category: 'rooms',      width: 5,  height: 5  },
  { id: 'medium-room',    name: 'Medium Room',    description: 'A spacious 7×7 room.',                            category: 'rooms',      width: 7,  height: 7  },
  { id: 'large-room',     name: 'Large Room',     description: 'A grand 11×11 hall.',                             category: 'rooms',      width: 11, height: 11 },
  { id: 'wide-room',      name: 'Wide Room',      description: 'A wide 13×7 rectangular room.',                   category: 'rooms',      width: 13, height: 7  },
  { id: 'cross-room',     name: 'Cross Room',     description: 'A cross-shaped chamber.',                         category: 'rooms',      width: 9,  height: 10 },
  { id: 'l-room',         name: 'L-Shape Room',   description: 'An L-shaped room.',                               category: 'rooms',      width: 8,  height: 8  },
  { id: 't-room',         name: 'T-Shape Room',   description: 'A T-shaped meeting room.',                        category: 'rooms',      width: 9,  height: 8  },
  { id: 'octagon-room',   name: 'Octagon Room',   description: 'An octagonal chamber.',                           category: 'rooms',      width: 9,  height: 9  },
  { id: 'pillared-hall',  name: 'Pillared Hall',  description: 'A hall with support pillars.',                    category: 'rooms',      width: 9,  height: 10 },

  // ── Corridors ─────────────────────────────────────────
  { id: 'corridor-h',       name: 'Horizontal Corridor', description: 'A straight 3×9 horizontal passage.',       category: 'corridors',  width: 9,  height: 3  },
  { id: 'corridor-v',       name: 'Vertical Corridor',   description: 'A straight 7×3 vertical passage.',         category: 'corridors',  width: 3,  height: 7  },
  { id: 'corridor-wide-h',  name: 'Wide H-Corridor',    description: 'A 2-tile-wide horizontal corridor (4×9).',  category: 'corridors',  width: 9,  height: 4  },
  { id: 't-junction',       name: 'T-Junction',         description: 'A three-way corridor junction.',            category: 'corridors',  width: 6,  height: 5  },
  { id: 'cross-junction',   name: 'Cross Junction',     description: 'A four-way corridor crossing.',             category: 'corridors',  width: 7,  height: 7  },
  { id: 'corner',           name: 'Corner',             description: 'An L-shaped corridor bend.',                category: 'corridors',  width: 5,  height: 4  },
  { id: 's-corridor',       name: 'S-Corridor',         description: 'A snaking S-shaped passage.',               category: 'corridors',  width: 5,  height: 7  },

  // ── Features ──────────────────────────────────────────
  { id: 'vault',          name: 'Treasure Vault',   description: 'A 5×5 heavily-walled treasure room.',          category: 'features',   width: 5,  height: 5  },
  { id: 'fountain-hall',  name: 'Fountain Hall',    description: 'A 7×7 room with a central fountain.',          category: 'features',   width: 7,  height: 7  },
  { id: 'lake',           name: 'Lake',             description: 'A small 7×7 body of water.',                   category: 'features',   width: 7,  height: 7  },
  { id: 'forest',         name: 'Forest Grove',     description: 'A 6×5 cluster of trees.',                      category: 'features',   width: 6,  height: 5  },
  { id: 'graveyard',      name: 'Graveyard',        description: 'A 7×7 burial ground with graves.',             category: 'features',   width: 7,  height: 7  },
  { id: 'altar-room',     name: 'Altar Room',       description: 'A 5×5 somber chamber with an altar.',          category: 'features',   width: 5,  height: 5  },

  // ── Dungeon ───────────────────────────────────────────
  { id: 'entrance-hall',  name: 'Entrance Hall',    description: 'A 7×7 grand entrance with stairs down.',        category: 'dungeon',    width: 7,  height: 7  },
  { id: 'prison',         name: 'Prison',           description: 'A 9×8 cell block with cages.',                  category: 'dungeon',    width: 9,  height: 8  },
  { id: 'bridge',         name: 'Bridge',           description: 'A 3×7 bridge crossing water.',                  category: 'dungeon',    width: 3,  height: 7  },
  { id: 'shop',           name: 'Shop',             description: 'A 7×7 merchant shop.',                          category: 'dungeon',    width: 7,  height: 7  },
  { id: 'kitchen',        name: 'Kitchen',          description: 'A 7×7 kitchen with tables.',                    category: 'dungeon',    width: 7,  height: 7  },
  { id: 'throne-room',    name: 'Throne Room',      description: 'A 9×9 royal throne chamber.',                   category: 'dungeon',    width: 9,  height: 9  },
  { id: 'stairs-set',     name: 'Stairs Set',       description: 'A 5×5 room with up and down stairs.',           category: 'dungeon',    width: 5,  height: 5  },

  // ── Traps ─────────────────────────────────────────────
  { id: 'trap-corridor',  name: 'Trapped Corridor', description: 'A 9×3 corridor lined with traps.',              category: 'traps',      width: 9,  height: 3  },
  { id: 'trap-room',      name: 'Trap Room',        description: 'A 7×7 room with a trapped floor.',              category: 'traps',      width: 7,  height: 7  },
]

/** Category display labels (matches PRESET_CATEGORIES in constants/presets.ts). */
export const PRESET_CATEGORIES = [
  { key: 'rooms',      label: 'Rooms' },
  { key: 'corridors',  label: 'Corridors' },
  { key: 'features',   label: 'Features' },
  { key: 'dungeon',    label: 'Dungeon' },
  { key: 'traps',      label: 'Traps' },
]
