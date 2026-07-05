extends RefCounted
## TileTypes — 25 tile type definitions.
## Replaces src/constants/tiles.ts

class TileType:
	var id: String
	var name: String
	var char: String
	var category: String
	var sort_order: int
	var fg_color: String  # set by theme at runtime
	var bg_color: String  # set by theme at runtime

	func _init(p_id: String, p_name: String, p_char: String, p_category: String, p_sort: int) -> void:
		id = p_id; name = p_name; char = p_char; category = p_category; sort_order = p_sort


static func all() -> Dictionary:
	return {
		"void":       TileType.new("void",       "Void",        " ", "terrain",    0),
		"wall":       TileType.new("wall",       "Wall",         "#", "wall",      1),
		"floor":      TileType.new("floor",      "Floor",        ".", "floor",     2),
		"floorAlt":   TileType.new("floorAlt",   "Floor Alt",    ",", "floor",     3),
		"door":       TileType.new("door",       "Door",         "+", "wall",      4),
		"doorOpen":   TileType.new("doorOpen",   "Door Open",    "'", "wall",      5),
		"water":      TileType.new("water",      "Water",        "~", "water",     6),
		"deepWater":  TileType.new("deepWater",  "Deep Water",   "≈", "water",     7),
		"lava":       TileType.new("lava",       "Lava",         "~", "terrain",   8),
		"tree":       TileType.new("tree",       "Tree",         "♣", "vegetation",9),
		"grass":      TileType.new("grass",      "Grass",        "\"", "vegetation",10),
		"bridge":     TileType.new("bridge",     "Bridge",       "═", "floor",     11),
		"stairsDown": TileType.new("stairsDown", "Stairs Down",  ">", "special",   12),
		"stairsUp":   TileType.new("stairsUp",   "Stairs Up",    "<", "special",   13),
		"altar":      TileType.new("altar",      "Altar",        "≡", "furniture", 14),
		"fountain":   TileType.new("fountain",   "Fountain",     "♦", "furniture", 15),
		"grave":      TileType.new("grave",      "Grave",        "☠", "decoration",16),
		"trap":       TileType.new("trap",       "Trap",         "^", "decoration",17),
		"pillar":     TileType.new("pillar",     "Pillar",       "0", "wall",      18),
		"treasure":   TileType.new("treasure",   "Treasure",     "$", "item",      19),
		"shop":       TileType.new("shop",       "Shop",         "Σ", "furniture", 20),
		"table":      TileType.new("table",      "Table",        "▤", "furniture", 21),
		"throne":     TileType.new("throne",     "Throne",       "Ψ", "furniture", 22),
		"cage":       TileType.new("cage",       "Cage",         "█", "furniture", 23),
		"blood":      TileType.new("blood",      "Blood",        ";", "decoration",24),
		"bar":        TileType.new("bar",        "Bar",          "│", "wall",      25),
	}

static func sorted_list() -> Array:
	var d := all()
	var arr: Array = []
	for v in d.values():
		arr.append(v)
	arr.sort_custom(func(a, b): return a.sort_order < b.sort_order)
	return arr

static var CATEGORIES: Array[Dictionary] = [
	{ "key": "wall",       "label": "Walls" },
	{ "key": "floor",      "label": "Floors" },
	{ "key": "water",      "label": "Water" },
	{ "key": "terrain",    "label": "Terrain" },
	{ "key": "vegetation", "label": "Vegetation" },
	{ "key": "furniture",  "label": "Furniture" },
	{ "key": "item",       "label": "Items" },
	{ "key": "decoration", "label": "Decorations" },
	{ "key": "special",    "label": "Special" },
]
