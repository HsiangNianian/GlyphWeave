/**
 * ASCII glyph mapping.
 * Maps each logical tile type ID to its display character when
 * rendering with the ASCII surface style.
 *
 * This is independent of TileType and Theme — it's purely the
 * glyph layer of the ASCII surface style.
 */
export const ASCII_GLYPHS: Record<string, string> = {
  void: ' ',
  wall: '#',
  floor: '.',
  floorAlt: ',',
  door: '+',
  doorOpen: "'",
  water: '~',
  deepWater: '≈',
  lava: '~',
  tree: '♣',
  grass: '"',
  bridge: '═',
  stairsDown: '>',
  stairsUp: '<',
  altar: '≡',
  fountain: '♦',
  grave: '☠',
  trap: '^',
  pillar: '0',
  treasure: '$',
  shop: 'Σ',
  table: '▤',
  throne: 'Ψ',
  cage: '█',
  blood: ';',
  bar: '│',
}
