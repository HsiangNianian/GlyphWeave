extends Node
## MapData — Core tilemap data store (autoload singleton).
## Replaces src/stores/map-store.ts

const MAX_HISTORY := 50

# ── tile type tools ──
enum Tool { BRUSH, ERASE, PAN, FILL, SELECT }

# ── layer descriptor ──
class LayerInfo:
	var id: String
	var name: String
	var visible: bool
	var locked: bool

	func _init(p_id: String, p_name: String, p_visible := true, p_locked := false) -> void:
		id = p_id; name = p_name; visible = p_visible; locked = p_locked

	func duplicate() -> LayerInfo:
		return LayerInfo.new(id, name, visible, locked)

# ── state ──
var tiles: Dictionary = {}           # { layer_id: { "x,y": tile_type_id } }
var layers: Array[LayerInfo] = []
var active_layer: int = 0
var active_tile_type: String = "wall"
var current_tool: Tool = Tool.BRUSH
var active_preset_id: String = ""
var world_name: String = "Untitled"
var tile_size: int = 24
var theme_id: String = "ansi-16"
var history: Array[String] = []
var history_index: int = -1

var _layer_counter: int = 1

# ── signals ──
signal tiles_changed()
signal theme_changed()
signal layers_changed()
signal history_changed()
signal world_initialized()

# ── helpers ──

func _next_layer_id() -> String:
	_layer_counter += 1
	return "layer-%d" % _layer_counter

func active_layer_id() -> String:
	if active_layer >= 0 and active_layer < layers.size():
		return layers[active_layer].id
	return "layer-1"

func active_layer_locked() -> bool:
	if active_layer >= 0 and active_layer < layers.size():
		return layers[active_layer].locked
	return false

func _key(x: int, y: int) -> String:
	return "%d,%d" % [x, y]

func _snapshot() -> String:
	return JSON.stringify(tiles)

# ── history ──

func push_history() -> void:
	var snap := _snapshot()
	history = history.slice(0, history_index + 1)
	history.append(snap)
	while history.size() > MAX_HISTORY:
		history.pop_front()
		history_index -= 1
	history_index = history.size() - 1
	history_changed.emit()

func undo() -> void:
	if history_index < 0:
		return
	var snap := history[history_index]
	tiles = JSON.parse_string(snap) if typeof(snap) == TYPE_STRING else snap
	history_index -= 1
	history_changed.emit()
	tiles_changed.emit()

func redo() -> void:
	if history_index >= history.size() - 2:
		return
	var snap := history[history_index + 2]
	tiles = JSON.parse_string(snap) if typeof(snap) == TYPE_STRING else snap
	history_index += 1
	history_changed.emit()
	tiles_changed.emit()

# ── tile access ──

func get_tile(x: int, y: int) -> String:
	# From top visible layer down
	for i in range(layers.size() - 1, -1, -1):
		var l := layers[i]
		if l.visible and tiles.has(l.id):
			var tid = tiles[l.id].get(_key(x, y))
			if tid and tid != "":
				return tid
	return ""

func get_tile_on_layer(x: int, y: int, layer_id: String) -> String:
	if tiles.has(layer_id):
		return tiles[layer_id].get(_key(x, y), "")
	return ""

func set_tile(x: int, y: int, tile_type_id: String) -> void:
	var lid := active_layer_id()
	if lid == "" or active_layer_locked():
		return
	push_history()
	if not tiles.has(lid):
		tiles[lid] = {}
	var k := _key(x, y)
	if tile_type_id == "" or tile_type_id == "void":
		tiles[lid].erase(k)
	else:
		tiles[lid][k] = tile_type_id
	tiles_changed.emit()

func set_tiles_batch(entries: Array) -> void:
	# entries: [[x, y, tile_type_id], ...]
	var lid := active_layer_id()
	if lid == "" or active_layer_locked():
		return
	push_history()
	if not tiles.has(lid):
		tiles[lid] = {}
	for entry in entries:
		var x: int = entry[0]; var y: int = entry[1]; var tid: String = entry[2]
		var k := _key(x, y)
		if tid == "" or tid == "void":
			tiles[lid].erase(k)
		else:
			tiles[lid][k] = tid
	tiles_changed.emit()

# ── flood fill (BFS) ──

func flood_fill(start_x: int, start_y: int, fill_id: String) -> void:
	var lid := active_layer_id()
	if lid == "" or active_layer_locked():
		return
	if not tiles.has(lid):
		tiles[lid] = {}
	var k := _key(start_x, start_y)
	var target_id = tiles[lid].get(k, "")
	if target_id == "" or target_id == fill_id:
		return

	push_history()
	var visited: Array[String] = []
	var queue: Array = [[start_x, start_y]]
	var dirs := [[0, -1], [0, 1], [-1, 0], [1, 0]]
	var entries: Array = []

	while not queue.is_empty():
		var cur: Array = queue.pop_front()
		var cx: int = cur[0]; var cy: int = cur[1]
		var ck := _key(cx, cy)
		if ck in visited:
			continue
		visited.append(ck)

		var current_type = tiles[lid].get(ck, "")
		if current_type != target_id:
			continue

		entries.append([cx, cy, fill_id])

		for d in dirs:
			var nx := cx + d[0]
			var ny := cy + d[1]
			var nk := _key(nx, ny)
			if nk not in visited:
				queue.append([nx, ny])

	if entries.size() > 0:
		for e in entries:
			var ek := _key(e[0], e[1])
			var eid: String = e[2]
			if eid == "" or eid == "void":
				tiles[lid].erase(ek)
			else:
				tiles[lid][ek] = eid
		tiles_changed.emit()

# ── preset placement ──

func place_preset(preset_grid: Array, origin_x: int, origin_y: int) -> void:
	if active_layer_locked():
		return
	var entries: Array = []
	for py in range(preset_grid.size()):
		var row = preset_grid[py]
		for px in range(row.size()):
			var cell := row[px]
			if cell != "void":
				entries.append([origin_x + px, origin_y + py, cell])
	if entries.size() > 0:
		set_tiles_batch(entries)

# ── layers ──

func add_layer(p_name := "") -> void:
	var id := _next_layer_id()
	var n := p_name if p_name != "" else "Layer %d" % (layers.size())
	layers.append(LayerInfo.new(id, n))
	tiles[id] = {}
	layers_changed.emit()

func remove_layer(index: int) -> void:
	if layers.size() <= 1:
		return
	if index < 0 or index >= layers.size():
		return
	var l := layers[index]
	layers.remove_at(index)
	tiles.erase(l.id)
	if active_layer >= layers.size():
		active_layer = layers.size() - 1
	layers_changed.emit()
	tiles_changed.emit()

func set_active_layer(index: int) -> void:
	if index >= 0 and index < layers.size():
		active_layer = index
		layers_changed.emit()

func toggle_layer_visibility(index: int) -> void:
	if index >= 0 and index < layers.size():
		layers[index].visible = not layers[index].visible
		layers_changed.emit()
		tiles_changed.emit()

func toggle_layer_lock(index: int) -> void:
	if index >= 0 and index < layers.size():
		layers[index].locked = not layers[index].locked
		layers_changed.emit()

func rename_layer(index: int, new_name: String) -> void:
	if index >= 0 and index < layers.size():
		layers[index].name = new_name
		layers_changed.emit()

# ── init / import / export ──

func init_world(config: Dictionary) -> void:
	world_name = config.get("worldName", "Untitled")
	tile_size = config.get("tileSize", 24)
	theme_id = config.get("themeId", "ansi-16")

	tiles.clear()
	layers.clear()
	active_layer = 0
	current_tool = Tool.BRUSH
	active_tile_type = "wall"
	active_preset_id = ""
	_layer_counter = 1

	var initial_layers: Array = config.get("initialLayers", [])
	var initial_layer_tiles: Dictionary = config.get("initialLayerTiles", {})

	if not initial_layers.is_empty() and not initial_layer_tiles.is_empty():
		for lh in initial_layers:
			layers.append(LayerInfo.new(lh.id, lh.name, lh.visible, lh.locked))
		for lid in initial_layer_tiles:
			tiles[lid] = initial_layer_tiles[lid].duplicate(true)
	else:
		var init_tiles: Dictionary = config.get("initialTiles", {})
		var lid := "layer-1"
		tiles[lid] = init_tiles.duplicate(true) if not init_tiles.is_empty() else {}
		layers.append(LayerInfo.new(lid, "Ground"))

	history.clear()
	history_index = -1
	world_initialized.emit()
	tiles_changed.emit()
	layers_changed.emit()
	theme_changed.emit()

func import_map(data: Dictionary) -> void:
	push_history()

	var data_layers: Array = data.get("layers", [])
	var data_layer_tiles: Dictionary = data.get("layerTiles", {})

	if not data_layers.is_empty() and not data_layer_tiles.is_empty():
		tiles.clear()
		layers.clear()
		for lh in data_layers:
			layers.append(LayerInfo.new(lh.id, lh.name, lh.get("visible", true), lh.get("locked", false)))
		for lid in data_layer_tiles:
			tiles[lid] = data_layer_tiles[lid].duplicate(true)
		active_layer = 0
	elif data.has("tiles"):
		tiles.clear()
		layers.clear()
		var lid := "layer-1"
		tiles[lid] = data["tiles"].duplicate(true)
		layers.append(LayerInfo.new(lid, "Ground"))
		active_layer = 0

	if data.has("worldName"):
		world_name = data["worldName"]
	if data.has("tileSize"):
		tile_size = data["tileSize"]
	if data.has("themeId"):
		theme_id = data["themeId"]

	tiles_changed.emit()
	layers_changed.emit()
	theme_changed.emit()

func export_map() -> Dictionary:
	var flat_tiles: Dictionary = {}
	for l in layers:
		if tiles.has(l.id):
			flat_tiles.merge(tiles[l.id], true)

	return {
		"tiles": flat_tiles,
		"layerTiles": tiles.duplicate(true),
		"layers": _serialize_layers(),
		"worldName": world_name,
		"tileSize": tile_size,
		"themeId": theme_id,
		"version": 2,
	}

func _serialize_layers() -> Array:
	var out: Array = []
	for l in layers:
		out.append({"id": l.id, "name": l.name, "visible": l.visible, "locked": l.locked})
	return out

# ── map bounds ──

func compute_bounds() -> Dictionary:
	var min_x := 0; var min_y := 0; var max_x := 0; var max_y := 0
	var has_tiles := false
	for l in layers:
		if not l.visible:
			continue
		var lt := tiles.get(l.id, {})
		if lt.is_empty():
			continue
		for k in lt:
			var tile_id = lt[k]
			if not tile_id or tile_id == "":
				continue
			var parts := k.split(",")
			var x := int(parts[0]); var y := int(parts[1])
			if not has_tiles:
				min_x = x; min_y = y; max_x = x; max_y = y
				has_tiles = true
			else:
				min_x = min(min_x, x); min_y = min(min_y, y)
				max_x = max(max_x, x); max_y = max(max_y, y)
	if not has_tiles:
		return {"minX": 0, "minY": 0, "maxX": 1, "maxY": 1, "w": 2, "h": 2}
	return {"minX": min_x, "minY": min_y, "maxX": max_x, "maxY": max_y, "w": max_x - min_x + 1, "h": max_y - min_y + 1}

# ── tool helpers ──

func set_current_tool(tool: Tool) -> void:
	current_tool = tool
	if tool != Tool.BRUSH:
		active_preset_id = ""

func set_active_preset(preset_id: String) -> void:
	active_preset_id = preset_id
	if preset_id != "":
		current_tool = Tool.BRUSH
