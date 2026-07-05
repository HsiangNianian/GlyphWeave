extends Node2D
## CanvasController — Manages the tilemap canvas, input, and rendering.

@onready var _camera: Camera2D = %Camera2D
@onready var _tile_map_layers: Node2D = %TileMapLayers
@onready var _grid_overlay: Node2D = %GridOverlay

var _is_panning: bool = false
var _is_drawing: bool = false
var _last_mouse_pos: Vector2 = Vector2.ZERO
var _last_drawn_tile_key: String = ""
var _dragging: bool = false
var _drag_threshold: float = 4.0
var _drag_start: Vector2 = Vector2.ZERO


func _ready() -> void:
	MapData.tiles_changed.connect(_rebuild_tiles)
	MapData.theme_changed.connect(_rebuild_tiles)
	MapData.layers_changed.connect(_rebuild_tiles)
	MapData.world_initialized.connect(_rebuild_tiles)
	UiState.ui_changed.connect(_on_ui_changed)
	_rebuild_tiles()


func _input(event: InputEvent) -> void:
	if not _is_mouse_inside_viewport():
		return

	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP or event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			_handle_zoom(event)
			get_viewport().set_input_as_handled()
			return
		if event.button_index == MOUSE_BUTTON_MIDDLE:
			if event.pressed:
				_is_panning = true
				_last_mouse_pos = event.position
			else:
				_is_panning = false
			return

	if event is InputEventKey and event.pressed:
		if _handle_shortcut(event):
			return


func _unhandled_input(event: InputEvent) -> void:
	if not _is_mouse_inside_viewport():
		return

	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_LEFT:
			if event.pressed:
				if MapData.current_tool == MapData.Tool.PAN:
					_is_panning = true
					_last_mouse_pos = event.position
				elif MapData.current_tool == MapData.Tool.FILL:
					if not MapData.active_layer_locked():
						_on_fill_at(event.position)
				elif MapData.current_tool == MapData.Tool.BRUSH or MapData.current_tool == MapData.Tool.ERASE:
					if not MapData.active_layer_locked():
						_is_drawing = true
						_dragging = false
						_drag_start = event.position
						_place_tile_at(event.position)
			else:
				if _is_drawing:
					_is_drawing = false
					_dragging = false
					_last_drawn_tile_key = ""
				if _is_panning:
					_is_panning = false
				return

	if event is InputEventMouseMotion:
		if _is_panning:
			var delta: Vector2 = event.position - _last_mouse_pos
			_camera.position -= delta / _camera.zoom
			_last_mouse_pos = event.position
			return

		if _is_drawing:
			if not _dragging:
				if event.position.distance_to(_drag_start) > _drag_threshold:
					_dragging = true
			if _dragging:
				_place_tile_at(event.position)


func _is_mouse_inside_viewport() -> bool:
	var vp_rect := get_viewport().get_visible_rect()
	var mouse_pos := get_viewport().get_mouse_position()
	return vp_rect.has_point(mouse_pos)


func _process(_delta: float) -> void:
	if UiState.show_grid:
		_rebuild_grid()


func _handle_zoom(event: InputEventMouseButton) -> void:
	var zoom_factor: float = 1.0
	if event.button_index == MOUSE_BUTTON_WHEEL_UP:
		zoom_factor = 1.0 / 1.08
	else:
		zoom_factor = 1.08

	var old_zoom := _camera.zoom.x
	var new_zoom: float = clampf(old_zoom * zoom_factor, 0.1, 10.0)
	zoom_factor = new_zoom / old_zoom

	_camera.zoom = Vector2(new_zoom, new_zoom)
	var mouse_pos: Vector2 = event.position
	_camera.position += (mouse_pos - _camera.position) * (1.0 / old_zoom) - (mouse_pos - _camera.position) * (1.0 / new_zoom)


func _handle_shortcut(event: InputEventKey) -> bool:
	if event.ctrl_pressed and event.shift_pressed and event.keycode == KEY_Z:
		MapData.redo()
		return true
	if event.ctrl_pressed and event.keycode == KEY_Z:
		MapData.undo()
		return true

	if event.ctrl_pressed or event.alt_pressed or event.meta_pressed:
		return false

	match event.keycode:
		KEY_B:
			MapData.set_current_tool(MapData.Tool.BRUSH)
			return true
		KEY_E:
			MapData.set_current_tool(MapData.Tool.ERASE)
			return true
		KEY_F:
			MapData.set_current_tool(MapData.Tool.FILL)
			return true
		KEY_P:
			MapData.set_current_tool(MapData.Tool.PAN)
			return true
		KEY_G:
			UiState.set_show_grid(not UiState.show_grid)
			return true
	return false


func _screen_to_tile(screen_pos: Vector2) -> Vector2i:
	var vp_size := get_viewport().get_visible_rect().size
	var world_pos := _camera.position + (screen_pos - vp_size / 2.0) / _camera.zoom.x
	return Vector2i(
		floori(world_pos.x / MapData.tile_size),
		floori(world_pos.y / MapData.tile_size),
	)


func _place_tile_at(screen_pos: Vector2) -> void:
	var tile_pos := _screen_to_tile(screen_pos)
	var tile_key := "%d,%d" % [tile_pos.x, tile_pos.y]
	if tile_key == _last_drawn_tile_key:
		return
	_last_drawn_tile_key = tile_key

	var tile_id: String = ""
	if MapData.current_tool == MapData.Tool.ERASE:
		tile_id = ""
	elif MapData.current_tool == MapData.Tool.BRUSH:
		if MapData.active_preset_id != "":
			_place_preset_at(tile_pos)
			return
		tile_id = MapData.active_tile_type

	MapData.set_tile(tile_pos.x, tile_pos.y, tile_id)


func _on_fill_at(screen_pos: Vector2) -> void:
	var tpos := _screen_to_tile(screen_pos)
	MapData.flood_fill(tpos.x, tpos.y, MapData.active_tile_type)


func _place_preset_at(origin: Vector2i) -> void:
	var presets_data: RefCounted = load("res://resources/presets/presets_data.gd").new()
	for p in presets_data.all():
		if p.id == MapData.active_preset_id:
			MapData.place_preset(p.grid, origin.x, origin.y)
			return


func _rebuild_tiles() -> void:
	for child in _tile_map_layers.get_children():
		child.queue_free()

	var theme_res := _load_theme()
	var ts := float(MapData.tile_size)

	for li in range(MapData.layers.size()):
		var layer: MapData.LayerInfo = MapData.layers[li]
		if not layer.visible:
			continue
		var lt: Dictionary = MapData.tiles.get(layer.id, {})
		if lt.is_empty():
			continue

		var layer_node: Node2D = Node2D.new()
		layer_node.name = layer.id
		layer_node.z_index = li
		_tile_map_layers.add_child(layer_node)

		for k in lt:
			var tile_id: String = lt[k]
			if tile_id == "" or tile_id == "void":
				continue
			var parts: PackedStringArray = k.split(",")
			var x := int(parts[0])
			var y := int(parts[1])

			var bg: ColorRect = ColorRect.new()
			bg.position = Vector2(x * ts, y * ts)
			bg.size = Vector2(ts, ts)
			var colors: Dictionary = theme_res.get_colors(tile_id) if theme_res else {}
			bg.color = Color(colors.get("bgColor", "#000000"))
			layer_node.add_child(bg)

			var tile_defs: RefCounted = load("res://resources/tile_types.gd").new()
			var tile_def = tile_defs.all().get(tile_id)
			if tile_def and tile_def.char != " ":
				var label: Label = Label.new()
				label.position = Vector2(x * ts, y * ts)
				label.size = Vector2(ts, ts)
				label.text = tile_def.char
				label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
				label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
				label.add_theme_color_override("font_color", Color(colors.get("fgColor", "#ffffff")))
				label.add_theme_font_size_override("font_size", maxi(int(ts * 0.75), 6))
				layer_node.add_child(label)

	_rebuild_grid()


func _rebuild_grid() -> void:
	for child in _grid_overlay.get_children():
		child.queue_free()
	if not UiState.show_grid:
		return

	var ts := float(MapData.tile_size)
	var vp_size := get_viewport().get_visible_rect().size
	var half_w := vp_size.x / _camera.zoom.x / 2.0 + ts
	var half_h := vp_size.y / _camera.zoom.y / 2.0 + ts
	var min_x := floori((_camera.position.x - half_w) / ts)
	var max_x := ceili((_camera.position.x + half_w) / ts)
	var min_y := floori((_camera.position.y - half_h) / ts)
	var max_y := ceili((_camera.position.y + half_h) / ts)

	var grid_color := Color(0.1333, 0.1333, 0.1333, 0.5)
	var gsx: float = min_x * ts
	var gsy: float = min_y * ts
	var gex: float = max_x * ts
	var gey: float = max_y * ts

	for gx in range(min_x, max_x + 1):
		var line: Line2D = Line2D.new()
		line.points = PackedVector2Array([Vector2(gx * ts, gsy), Vector2(gx * ts, gey)])
		line.width = 0.5
		line.default_color = grid_color
		_grid_overlay.add_child(line)

	for gy in range(min_y, max_y + 1):
		var line: Line2D = Line2D.new()
		line.points = PackedVector2Array([Vector2(gsx, gy * ts), Vector2(gex, gy * ts)])
		line.width = 0.5
		line.default_color = grid_color
		_grid_overlay.add_child(line)


func _load_theme() -> Resource:
	var path := "res://resources/themes/" + MapData.theme_id.replace("-", "_") + ".tres"
	return load(path)


func _on_ui_changed() -> void:
	if not UiState.show_grid:
		for child in _grid_overlay.get_children():
			child.queue_free()
