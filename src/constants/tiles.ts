import type { TileType } from '@/types'

export const TILE_TYPES: Record<string, TileType> = {
  void: { id: 'void', name: 'Void', category: 'terrain', sortOrder: 0 },
  wall: { id: 'wall', name: 'Wall', category: 'wall', sortOrder: 1 },
  floor: { id: 'floor', name: 'Floor', category: 'floor', sortOrder: 2 },
  floorAlt: { id: 'floorAlt', name: 'Floor Alt', category: 'floor', sortOrder: 3 },
  door: { id: 'door', name: 'Door', category: 'wall', sortOrder: 4 },
  doorOpen: { id: 'doorOpen', name: 'Door Open', category: 'wall', sortOrder: 5 },
  water: { id: 'water', name: 'Water', category: 'water', sortOrder: 6 },
  deepWater: { id: 'deepWater', name: 'Deep Water', category: 'water', sortOrder: 7 },
  lava: { id: 'lava', name: 'Lava', category: 'terrain', sortOrder: 8 },
  tree: { id: 'tree', name: 'Tree', category: 'vegetation', sortOrder: 9 },
  grass: { id: 'grass', name: 'Grass', category: 'vegetation', sortOrder: 10 },
  bridge: { id: 'bridge', name: 'Bridge', category: 'floor', sortOrder: 11 },
  stairsDown: { id: 'stairsDown', name: 'Stairs Down', category: 'special', sortOrder: 12 },
  stairsUp: { id: 'stairsUp', name: 'Stairs Up', category: 'special', sortOrder: 13 },
  altar: { id: 'altar', name: 'Altar', category: 'furniture', sortOrder: 14 },
  fountain: { id: 'fountain', name: 'Fountain', category: 'furniture', sortOrder: 15 },
  grave: { id: 'grave', name: 'Grave', category: 'decoration', sortOrder: 16 },
  trap: { id: 'trap', name: 'Trap', category: 'decoration', sortOrder: 17 },
  pillar: { id: 'pillar', name: 'Pillar', category: 'wall', sortOrder: 18 },
  treasure: { id: 'treasure', name: 'Treasure', category: 'item', sortOrder: 19 },
  shop: { id: 'shop', name: 'Shop', category: 'furniture', sortOrder: 20 },
  table: { id: 'table', name: 'Table', category: 'furniture', sortOrder: 21 },
  throne: { id: 'throne', name: 'Throne', category: 'furniture', sortOrder: 22 },
  cage: { id: 'cage', name: 'Cage', category: 'furniture', sortOrder: 23 },
  blood: { id: 'blood', name: 'Blood', category: 'decoration', sortOrder: 24 },
  bar: { id: 'bar', name: 'Bar', category: 'wall', sortOrder: 25 },
}

export const TILE_TYPE_LIST = Object.values(TILE_TYPES).sort((a, b) => a.sortOrder - b.sortOrder)

export const TILE_CATEGORIES: { key: TileType['category']; label: string }[] = [
  { key: 'wall', label: 'Walls' },
  { key: 'floor', label: 'Floors' },
  { key: 'water', label: 'Water' },
  { key: 'terrain', label: 'Terrain' },
  { key: 'vegetation', label: 'Vegetation' },
  { key: 'furniture', label: 'Furniture' },
  { key: 'item', label: 'Items' },
  { key: 'decoration', label: 'Decorations' },
  { key: 'special', label: 'Special' },
]
