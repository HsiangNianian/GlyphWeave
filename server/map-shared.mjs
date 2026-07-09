/**
 * Shared tilemap data and utilities.
 * No native dependencies — safe for Node.js and Cloudflare Workers.
 */
export const TILE_TYPES = {
  void:       { id: 'void',       category: 'terrain' },
  wall:       { id: 'wall',       category: 'wall' },
  floor:      { id: 'floor',      category: 'floor' },
  floorAlt:   { id: 'floorAlt',   category: 'floor' },
  door:       { id: 'door',       category: 'wall' },
  doorOpen:   { id: 'doorOpen',   category: 'wall' },
  water:      { id: 'water',      category: 'water' },
  deepWater:  { id: 'deepWater',  category: 'water' },
  lava:       { id: 'lava',       category: 'terrain' },
  tree:       { id: 'tree',       category: 'vegetation' },
  grass:      { id: 'grass',      category: 'vegetation' },
  bridge:     { id: 'bridge',     category: 'floor' },
  stairsDown: { id: 'stairsDown', category: 'special' },
  stairsUp:   { id: 'stairsUp',   category: 'special' },
  altar:      { id: 'altar',      category: 'furniture' },
  fountain:   { id: 'fountain',   category: 'furniture' },
  grave:      { id: 'grave',      category: 'decoration' },
  trap:       { id: 'trap',       category: 'decoration' },
  pillar:     { id: 'pillar',     category: 'wall' },
  treasure:   { id: 'treasure',   category: 'item' },
  shop:       { id: 'shop',       category: 'furniture' },
  table:      { id: 'table',      category: 'furniture' },
  throne:     { id: 'throne',     category: 'furniture' },
  cage:       { id: 'cage',       category: 'furniture' },
  blood:      { id: 'blood',      category: 'decoration' },
  bar:        { id: 'bar',        category: 'wall' },
}

/** ASCII display characters for each tile type (used by ASCII surface renderer). */
export const ASCII_GLYPHS = {
  void:       ' ',
  wall:       '#',
  floor:      '.',
  floorAlt:   ',',
  door:       '+',
  doorOpen:   "'",
  water:      '~',
  deepWater:  '≈',
  lava:       '~',
  tree:       '♣',
  grass:      '"',
  bridge:     '═',
  stairsDown: '>',
  stairsUp:   '<',
  altar:      '≡',
  fountain:   '♦',
  grave:      '☠',
  trap:       '^',
  pillar:     '0',
  treasure:   '$',
  shop:       'Σ',
  table:      '▤',
  throne:     'Ψ',
  cage:       '█',
  blood:      ';',
  bar:        '│',
}


export const THEMES = {
  'ansi-16': {
    name: 'ANSI 16',
    colors: {
      void:       { fgColor: '#000000', bgColor: '#000000' },
      wall:       { fgColor: '#a0a0a0', bgColor: '#000000' },
      floor:      { fgColor: '#808080', bgColor: '#1a1a1a' },
      floorAlt:   { fgColor: '#666666', bgColor: '#141414' },
      door:       { fgColor: '#ffff00', bgColor: '#1a1a00' },
      doorOpen:   { fgColor: '#ffff88', bgColor: '#1a1a00' },
      water:      { fgColor: '#0000ff', bgColor: '#00001a' },
      deepWater:  { fgColor: '#000088', bgColor: '#000010' },
      lava:       { fgColor: '#ff5500', bgColor: '#1a0500' },
      tree:       { fgColor: '#00ff00', bgColor: '#001a00' },
      grass:      { fgColor: '#44aa44', bgColor: '#001a00' },
      bridge:     { fgColor: '#888866', bgColor: '#1a1a10' },
      stairsDown: { fgColor: '#ffffff', bgColor: '#333333' },
      stairsUp:   { fgColor: '#ffffff', bgColor: '#333333' },
      altar:      { fgColor: '#ff00ff', bgColor: '#1a001a' },
      fountain:   { fgColor: '#00ffff', bgColor: '#001a1a' },
      grave:      { fgColor: '#888888', bgColor: '#0a0a0a' },
      trap:       { fgColor: '#ff0000', bgColor: '#1a0000' },
      pillar:     { fgColor: '#aaaaaa', bgColor: '#222222' },
      treasure:   { fgColor: '#ffff00', bgColor: '#1a1a00' },
      shop:       { fgColor: '#ffaa00', bgColor: '#1a1000' },
      table:      { fgColor: '#8b6914', bgColor: '#1a1000' },
      throne:     { fgColor: '#ffd700', bgColor: '#1a1400' },
      cage:       { fgColor: '#888888', bgColor: '#111111' },
      blood:      { fgColor: '#aa0000', bgColor: '#1a0000' },
      bar:        { fgColor: '#8b4513', bgColor: '#1a0a00' },
    },
  },
  'cogmind': {
    name: 'Cogmind Dark',
    colors: {
      void:       { fgColor: '#000000', bgColor: '#000000' },
      wall:       { fgColor: '#404060', bgColor: '#0a0a14' },
      floor:      { fgColor: '#282840', bgColor: '#101020' },
      floorAlt:   { fgColor: '#202038', bgColor: '#0c0c1c' },
      door:       { fgColor: '#8080c0', bgColor: '#14142a' },
      doorOpen:   { fgColor: '#a0a0d0', bgColor: '#14142a' },
      water:      { fgColor: '#004080', bgColor: '#00081a' },
      deepWater:  { fgColor: '#002060', bgColor: '#000410' },
      lava:       { fgColor: '#ff4000', bgColor: '#1a0800' },
      tree:       { fgColor: '#006000', bgColor: '#001000' },
      grass:      { fgColor: '#204020', bgColor: '#001000' },
      bridge:     { fgColor: '#505068', bgColor: '#181828' },
      stairsDown: { fgColor: '#a0a0c0', bgColor: '#2a2a40' },
      stairsUp:   { fgColor: '#a0a0c0', bgColor: '#2a2a40' },
      altar:      { fgColor: '#800080', bgColor: '#100010' },
      fountain:   { fgColor: '#008080', bgColor: '#001010' },
      grave:      { fgColor: '#505050', bgColor: '#080808' },
      trap:       { fgColor: '#800000', bgColor: '#100000' },
      pillar:     { fgColor: '#585878', bgColor: '#18182a' },
      treasure:   { fgColor: '#c0c000', bgColor: '#141400' },
      shop:       { fgColor: '#c08000', bgColor: '#141000' },
      table:      { fgColor: '#605020', bgColor: '#100800' },
      throne:     { fgColor: '#b09800', bgColor: '#141000' },
      cage:       { fgColor: '#505060', bgColor: '#0c0c18' },
      blood:      { fgColor: '#600000', bgColor: '#0a0000' },
      bar:        { fgColor: '#604020', bgColor: '#0a0400' },
    },
  },
}


export const MAX_OUTPUT_SIZE = 4096
export const TILE_SIZE = 24


export function flattenTiles(data) {
  if (data.layerTiles && data.layers) {
    const result = {}
    for (const layer of data.layers) {
      const lt = data.layerTiles[layer.id]
      if (lt && layer.visible !== false) {
        for (const [key, id] of Object.entries(lt)) {
          if (id) result[key] = id
        }
      }
    }
    return result
  }
  if (data.tiles) return { ...data.tiles }
  return data  // assume already flat
}

/**
 * Compute bounds from a flat tiles record.
 */


export function computeBounds(tiles) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const key of Object.keys(tiles)) {
    const [sx, sy] = key.split(',')
    const x = parseInt(sx, 10)
    const y = parseInt(sy, 10)
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0, w: 1, h: 1 }
  return { minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

/**
 * Render a tilemap to a PNG buffer.
 *
 * @param {object} data       - Map data: { tiles?, layerTiles?, layers?, ... }
 * @param {object} options
 * @param {string} options.themeId  - Theme ID ('ansi-16' or 'cogmind')
 * @param {number} options.padding  - Extra tiles around bounds (default 1)
 * @param {number} options.scale    - Pixels per tile (default: auto-fit)
 * @returns {Buffer} PNG image buffer
 */
