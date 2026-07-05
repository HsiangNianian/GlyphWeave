extends Control
## TilePalette — Tile selection panel with categories.
## Replaces src/components/panels/TilePalette.tsx


func _ready() -> void:
	MapData.tiles_changed.connect(_refresh)
	MapData.theme_changed.connect(_refresh)
	_refresh()


func _refresh() -> void:
	for child in get_children():
		child.queue_free()

	var scroll: ScrollContainer = ScrollContainer.new()
	scroll.size_flags_horizontal = Control.SIZE_FILL
	scroll.size_flags_vertical = Control.SIZE_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	add_child(scroll)

	var vbox: VBoxContainer = VBoxContainer.new()
	vbox.size_flags_horizontal = Control.SIZE_FILL
	vbox.add_theme_constant_override("separation", 12)
	scroll.add_child(vbox)

	var tile_defs: RefCounted = load("res://resources/tile_types.gd").new()
	var theme_res: Resource = _load_theme()
	var all_tiles: Array = tile_defs.sorted_list()

	for cat in tile_defs.CATEGORIES:
		var tiles_in_cat: Array = []
		for t in all_tiles:
			if t.category == cat.key and t.id != "void":
				tiles_in_cat.append(t)
		if tiles_in_cat.is_empty():
			continue

		var header: Label = Label.new()
		header.text = cat.label
		header.add_theme_color_override("font_color", Color(0.443, 0.443, 0.443))
		header.add_theme_font_size_override("font_size", 10)
		vbox.add_child(header)

		var grid: GridContainer = GridContainer.new()
		grid.columns = 4
		grid.size_flags_horizontal = Control.SIZE_FILL
		grid.add_theme_constant_override("h_separation", 2)
		grid.add_theme_constant_override("v_separation", 2)
		vbox.add_child(grid)

		for tile_def in tiles_in_cat:
			var colors: Dictionary = {}
			if theme_res:
				colors = theme_res.get_colors(tile_def.id)

			var btn: Button = Button.new()
			btn.custom_minimum_size = Vector2(48, 40)
			btn.pressed.connect(_on_tile_selected.bind(tile_def.id))

			var is_active: bool = (MapData.active_tile_type == tile_def.id)
			if is_active:
				btn.modulate = Color(0.4, 0.4, 0.4)

			var inner: VBoxContainer = VBoxContainer.new()
			inner.mouse_filter = Control.MOUSE_FILTER_IGNORE

			var char_label: Label = Label.new()
			char_label.text = tile_def.char
			char_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			char_label.add_theme_font_size_override("font_size", 13)
			char_label.add_theme_color_override("font_color", Color(colors.get("fgColor", "#ffffff")))
			char_label.mouse_filter = Control.MOUSE_FILTER_IGNORE

			var name_label: Label = Label.new()
			name_label.text = tile_def.name
			name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			name_label.add_theme_color_override("font_color", Color(0.443, 0.443, 0.443))
			name_label.add_theme_font_size_override("font_size", 8)
			name_label.mouse_filter = Control.MOUSE_FILTER_IGNORE

			inner.add_child(char_label)
			inner.add_child(name_label)
			btn.add_child(inner)
			grid.add_child(btn)


func _on_tile_selected(id: String) -> void:
	MapData.active_tile_type = id
	MapData.active_preset_id = ""
	if MapData.current_tool == MapData.Tool.PAN or MapData.current_tool == MapData.Tool.SELECT:
		MapData.set_current_tool(MapData.Tool.BRUSH)
	_refresh()


func _load_theme() -> Resource:
	var path: String = "res://resources/themes/" + MapData.theme_id.replace("-", "_") + ".tres"
	return load(path)
