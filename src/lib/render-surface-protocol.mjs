export const RENDER_SURFACE_PROTOCOL_VERSION = 1

export const TILE_SIZE = 24
export const MAX_OUTPUT_SIZE = 4096

export const UNKNOWN_TILE_COLORS = Object.freeze({
  fgColor: '#f472b6',
  bgColor: '#180b12',
})

const namespacedBlockPattern = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/u

export const TILE_SURFACES = Object.freeze({
  void: surface('void', 'glyphweave:air', 'Void', ' ', 'terrain', 0, ['air', 'transparent']),
  wall: surface('wall', 'glyphweave:wall', 'Wall', '#', 'wall', 1, ['solid', 'opaque']),
  floor: surface('floor', 'glyphweave:floor', 'Floor', '.', 'floor', 2, ['walkable']),
  floorAlt: surface('floorAlt', 'glyphweave:floor-alt', 'Floor Alt', ',', 'floor', 3, ['walkable']),
  door: surface('door', 'glyphweave:door', 'Door', '+', 'wall', 4, ['solid', 'opaque', 'door']),
  doorOpen: surface('doorOpen', 'glyphweave:door-open', 'Door Open', "'", 'wall', 5, ['walkable', 'door']),
  water: surface('water', 'glyphweave:water', 'Water', '~', 'water', 6, ['liquid', 'walkable']),
  deepWater: surface('deepWater', 'glyphweave:deep-water', 'Deep Water', '≈', 'water', 7, ['liquid', 'opaque']),
  lava: surface('lava', 'glyphweave:lava', 'Lava', '~', 'terrain', 8, ['liquid', 'hazard', 'emissive']),
  tree: surface('tree', 'glyphweave:tree', 'Tree', '♣', 'vegetation', 9, ['solid', 'opaque', 'organic']),
  grass: surface('grass', 'glyphweave:grass', 'Grass', '"', 'vegetation', 10, ['walkable', 'organic']),
  bridge: surface('bridge', 'glyphweave:bridge', 'Bridge', '═', 'floor', 11, ['walkable']),
  stairsDown: surface('stairsDown', 'glyphweave:stairs-down', 'Stairs Down', '>', 'special', 12, ['walkable', 'vertical']),
  stairsUp: surface('stairsUp', 'glyphweave:stairs-up', 'Stairs Up', '<', 'special', 13, ['walkable', 'vertical']),
  altar: surface('altar', 'glyphweave:altar', 'Altar', '≡', 'furniture', 14, ['solid']),
  fountain: surface('fountain', 'glyphweave:fountain', 'Fountain', '♦', 'furniture', 15, ['solid', 'liquid']),
  grave: surface('grave', 'glyphweave:grave', 'Grave', '☠', 'decoration', 16, ['solid']),
  trap: surface('trap', 'glyphweave:trap', 'Trap', '^', 'decoration', 17, ['hazard']),
  pillar: surface('pillar', 'glyphweave:pillar', 'Pillar', '0', 'wall', 18, ['solid', 'opaque']),
  treasure: surface('treasure', 'glyphweave:treasure', 'Treasure', '$', 'item', 19, ['item']),
  shop: surface('shop', 'glyphweave:shop', 'Shop', 'Σ', 'furniture', 20, ['solid']),
  table: surface('table', 'glyphweave:table', 'Table', '▤', 'furniture', 21, ['solid']),
  throne: surface('throne', 'glyphweave:throne', 'Throne', 'Ψ', 'furniture', 22, ['solid']),
  cage: surface('cage', 'glyphweave:cage', 'Cage', '█', 'furniture', 23, ['solid', 'opaque']),
  blood: surface('blood', 'glyphweave:blood', 'Blood', ';', 'decoration', 24, ['decal']),
  bar: surface('bar', 'glyphweave:bar', 'Bar', '│', 'wall', 25, ['solid']),
})

export const TILE_CATEGORIES = Object.freeze([
  { key: 'wall', label: 'Walls' },
  { key: 'floor', label: 'Floors' },
  { key: 'water', label: 'Water' },
  { key: 'terrain', label: 'Terrain' },
  { key: 'vegetation', label: 'Vegetation' },
  { key: 'furniture', label: 'Furniture' },
  { key: 'item', label: 'Items' },
  { key: 'decoration', label: 'Decorations' },
  { key: 'special', label: 'Special' },
])

export const DEFAULT_RENDER_THEMES = Object.freeze({
  'ansi-16': theme('ansi-16', 'ANSI 16', 'Classic ANSI terminal 16-color palette — bold, vibrant, iconic.', undefined, {
    void:      { fgColor: '#000000', bgColor: '#000000' },
    wall:      { fgColor: '#a0a0a0', bgColor: '#000000' },
    floor:     { fgColor: '#808080', bgColor: '#1a1a1a' },
    floorAlt:  { fgColor: '#606060', bgColor: '#151515' },
    door:      { fgColor: '#ffff00', bgColor: '#1a1a00' },
    doorOpen:  { fgColor: '#c0c000', bgColor: '#151500' },
    water:     { fgColor: '#0000ff', bgColor: '#00001a' },
    deepWater: { fgColor: '#0000aa', bgColor: '#00000a' },
    lava:      { fgColor: '#ff5500', bgColor: '#1a0500' },
    tree:      { fgColor: '#00ff00', bgColor: '#001a00' },
    grass:     { fgColor: '#00aa00', bgColor: '#000a00' },
    bridge:    { fgColor: '#8b7355', bgColor: '#1a1410' },
    stairsDown:{ fgColor: '#ffffff', bgColor: '#1a1a1a' },
    stairsUp:  { fgColor: '#ffffff', bgColor: '#1a1a1a' },
    altar:     { fgColor: '#ff00ff', bgColor: '#1a001a' },
    fountain:  { fgColor: '#00ffff', bgColor: '#001a1a' },
    grave:     { fgColor: '#808080', bgColor: '#0a0a0a' },
    trap:      { fgColor: '#ff0000', bgColor: '#1a0000' },
    pillar:    { fgColor: '#a0a0a0', bgColor: '#050505' },
    treasure:  { fgColor: '#ffff00', bgColor: '#1a1a00' },
    shop:      { fgColor: '#ffff55', bgColor: '#1a1a0a' },
    table:     { fgColor: '#8b4513', bgColor: '#1a0a00' },
    throne:    { fgColor: '#ffd700', bgColor: '#1a1400' },
    cage:      { fgColor: '#c0c0c0', bgColor: '#050505' },
    blood:     { fgColor: '#aa0000', bgColor: '#0a0000' },
    bar:       { fgColor: '#8b7355', bgColor: '#000000' },
  }),
  cogmind: theme('cogmind', 'Cogmind Dark', 'Low-light cyberpunk terminal — muted, cold, atmospheric.', undefined, {
    void:      { fgColor: '#000000', bgColor: '#000000' },
    wall:      { fgColor: '#708090', bgColor: '#0a0a0a' },
    floor:     { fgColor: '#404050', bgColor: '#121216' },
    floorAlt:  { fgColor: '#353545', bgColor: '#0e0e12' },
    door:      { fgColor: '#daa520', bgColor: '#141408' },
    doorOpen:  { fgColor: '#b8960e', bgColor: '#101006' },
    water:     { fgColor: '#4488cc', bgColor: '#06061a' },
    deepWater: { fgColor: '#3366aa', bgColor: '#040410' },
    lava:      { fgColor: '#ff4400', bgColor: '#1a0600' },
    tree:      { fgColor: '#33aa55', bgColor: '#0a140a' },
    grass:     { fgColor: '#227744', bgColor: '#060e06' },
    bridge:    { fgColor: '#6b5b45', bgColor: '#141008' },
    stairsDown:{ fgColor: '#88ccff', bgColor: '#0a1420' },
    stairsUp:  { fgColor: '#88ccff', bgColor: '#0a1420' },
    altar:     { fgColor: '#cc66cc', bgColor: '#140a14' },
    fountain:  { fgColor: '#66cccc', bgColor: '#0a1414' },
    grave:     { fgColor: '#556655', bgColor: '#080808' },
    trap:      { fgColor: '#cc4444', bgColor: '#140808' },
    pillar:    { fgColor: '#606070', bgColor: '#060606' },
    treasure:  { fgColor: '#ddbb33', bgColor: '#141006' },
    shop:      { fgColor: '#ccaa44', bgColor: '#141008' },
    table:     { fgColor: '#6b3a1a', bgColor: '#140800' },
    throne:    { fgColor: '#ccaa00', bgColor: '#141000' },
    cage:      { fgColor: '#8888aa', bgColor: '#040408' },
    blood:     { fgColor: '#882222', bgColor: '#080000' },
    bar:       { fgColor: '#6b5b45', bgColor: '#000000' },
  }),
  'fortress-pixel': theme('fortress-pixel', 'Fortress Pixel', 'Painterly pixel dungeon tiles — carved stone, moss, water, and magma.', 'pixel', {
    void:      { fgColor: '#050403', bgColor: '#050403' },
    wall:      { fgColor: '#9b9587', bgColor: '#34322f' },
    floor:     { fgColor: '#7f745f', bgColor: '#443d32' },
    floorAlt:  { fgColor: '#6f624e', bgColor: '#393226' },
    door:      { fgColor: '#b8793e', bgColor: '#402515' },
    doorOpen:  { fgColor: '#8a5a34', bgColor: '#20150d' },
    water:     { fgColor: '#5ca7c8', bgColor: '#173d55' },
    deepWater: { fgColor: '#2f6b93', bgColor: '#0b2337' },
    lava:      { fgColor: '#ffb04a', bgColor: '#5a1a0e' },
    tree:      { fgColor: '#5f9d50', bgColor: '#23351e' },
    grass:     { fgColor: '#769b47', bgColor: '#2f3d23' },
    bridge:    { fgColor: '#a16f42', bgColor: '#3f2a18' },
    stairsDown:{ fgColor: '#b4aa92', bgColor: '#302a22' },
    stairsUp:  { fgColor: '#d0c4a6', bgColor: '#3b3327' },
    altar:     { fgColor: '#b7adc8', bgColor: '#342f3c' },
    fountain:  { fgColor: '#79b7c4', bgColor: '#263f43' },
    grave:     { fgColor: '#8f958c', bgColor: '#2d302b' },
    trap:      { fgColor: '#c55345', bgColor: '#3a211d' },
    pillar:    { fgColor: '#b0aa9a', bgColor: '#3a3834' },
    treasure:  { fgColor: '#f0c85a', bgColor: '#4a3514' },
    shop:      { fgColor: '#d4a04e', bgColor: '#4a321b' },
    table:     { fgColor: '#9b6238', bgColor: '#322012' },
    throne:    { fgColor: '#d3b15f', bgColor: '#4b3516' },
    cage:      { fgColor: '#9aa0a1', bgColor: '#242525' },
    blood:     { fgColor: '#9c2f2d', bgColor: '#2c1210' },
    bar:       { fgColor: '#8c8578', bgColor: '#151412' },
  }),
})

const blockToTile = new Map(
  Object.values(TILE_SURFACES).map((surfaceDef) => [surfaceDef.blockName, surfaceDef.tileId]),
)

export const TILE_TYPES = Object.freeze(Object.fromEntries(
  Object.values(TILE_SURFACES).map((surfaceDef) => [
    surfaceDef.tileId,
    {
      id: surfaceDef.tileId,
      name: surfaceDef.name,
      char: surfaceDef.glyph,
      category: surfaceDef.category,
      sortOrder: surfaceDef.sortOrder,
    },
  ]),
))

export const TILE_TYPE_LIST = Object.freeze(
  Object.values(TILE_TYPES).toSorted((left, right) => left.sortOrder - right.sortOrder),
)

export function tileTokenToBlockName(tileToken) {
  if (tileToken === 'void') return null
  const surfaceDef = TILE_SURFACES[tileToken]
  if (surfaceDef) return surfaceDef.blockName === 'glyphweave:air' ? null : surfaceDef.blockName
  return namespacedBlockPattern.test(tileToken) ? tileToken : null
}

export function blockNameToTileToken(blockName) {
  if (blockName === 'glyphweave:air') return null
  return blockToTile.get(blockName) ?? (namespacedBlockPattern.test(blockName) ? blockName : null)
}

export function normalizeRenderTileToken(tileToken) {
  if (typeof tileToken !== 'string' || tileToken.length === 0 || tileToken === 'void') return null
  return tileToken
}

export function renderSurfaceForTileToken(tileToken) {
  const normalized = normalizeRenderTileToken(tileToken)
  if (normalized === null) return null
  return TILE_SURFACES[normalized] ?? {
    tileId: normalized,
    blockName: namespacedBlockPattern.test(normalized) ? normalized : `legacy:${normalized}`,
    name: normalized,
    glyph: '?',
    category: 'special',
    sortOrder: 10_000,
    traits: ['unknown'],
  }
}

export function glyphForTileToken(tileToken) {
  return renderSurfaceForTileToken(tileToken)?.glyph ?? ''
}

export function colorsForTileToken(theme, tileToken) {
  const surfaceDef = renderSurfaceForTileToken(tileToken)
  if (surfaceDef === null) return null
  return theme?.colors?.[surfaceDef.tileId] ?? UNKNOWN_TILE_COLORS
}

export function resolveTileRenderStyle(theme, tileToken) {
  const surfaceDef = renderSurfaceForTileToken(tileToken)
  if (surfaceDef === null) return null
  return {
    colors: theme?.colors?.[surfaceDef.tileId] ?? UNKNOWN_TILE_COLORS,
    surface: surfaceDef,
  }
}

function surface(tileId, blockName, name, glyph, category, sortOrder, traits) {
  return Object.freeze({ tileId, blockName, name, glyph, category, sortOrder, traits: Object.freeze(traits) })
}

function theme(id, name, description, renderMode, colors) {
  return Object.freeze({
    id,
    name,
    description,
    ...(renderMode ? { renderMode } : {}),
    colors: Object.freeze(colors),
  })
}
