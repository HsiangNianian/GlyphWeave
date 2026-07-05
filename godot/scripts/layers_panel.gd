extends Control
## LayersPanel — Layer management (add, remove, toggle visibility/lock, rename).
## Replaces src/components/panels/LayersPanel.tsx


func _ready() -> void:
	MapData.layers_changed.connect(_refresh)
	_refresh()


func _refresh() -> void:
	for child in get_children():
		child.queue_free()

	var vbox: VBoxContainer = VBoxContainer.new()
	vbox.size_flags_horizontal = Control.SIZE_FILL
	vbox.size_flags_vertical = Control.SIZE_FILL
	add_child(vbox)

	# Header row
	var header_row: HBoxContainer = HBoxContainer.new()
	header_row.size_flags_horizontal = Control.SIZE_FILL

	var header: Label = Label.new()
	header.text = "Layers"
	header.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_theme_color_override("font_color", Color(0.635, 0.635, 0.635))
	header.add_theme_font_size_override("font_size", 11)
	header_row.add_child(header)

	var add_btn: Button = Button.new()
	add_btn.text = "+"
	add_btn.custom_minimum_size = Vector2(24, 24)
	add_btn.pressed.connect(_on_add_layer)
	add_btn.add_theme_font_size_override("font_size", 14)
	header_row.add_child(add_btn)

	vbox.add_child(header_row)

	# Separator
	var sep: HSeparator = HSeparator.new()
	vbox.add_child(sep)

	# Layer list
	var scroll: ScrollContainer = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	vbox.add_child(scroll)

	var list: VBoxContainer = VBoxContainer.new()
	list.size_flags_horizontal = Control.SIZE_FILL
	list.add_theme_constant_override("separation", 2)
	scroll.add_child(list)

	for i in range(MapData.layers.size()):
		var layer = MapData.layers[i]
		var is_active: bool = (i == MapData.active_layer)

		var row: HBoxContainer = HBoxContainer.new()
		row.size_flags_horizontal = Control.SIZE_FILL
		row.add_theme_constant_override("separation", 4)

		# Visibility toggle
		var eye_btn: Button = Button.new()
		eye_btn.text = "V" if layer.visible else "H"
		eye_btn.custom_minimum_size = Vector2(22, 22)
		eye_btn.add_theme_font_size_override("font_size", 9)
		eye_btn.pressed.connect(_on_toggle_visibility.bind(i))
		row.add_child(eye_btn)

		# Layer name (click to select)
		var name_btn: Button = Button.new()
		name_btn.text = layer.name
		name_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		name_btn.add_theme_font_size_override("font_size", 11)
		name_btn.alignment = HORIZONTAL_ALIGNMENT_LEFT
		name_btn.pressed.connect(_on_select_layer.bind(i))
		if is_active:
			name_btn.add_theme_color_override("font_color", Color(1, 0.8, 0))
		row.add_child(name_btn)

		# Lock toggle
		var lock_btn: Button = Button.new()
		lock_btn.text = "L" if layer.locked else "U"
		lock_btn.custom_minimum_size = Vector2(22, 22)
		lock_btn.add_theme_font_size_override("font_size", 9)
		lock_btn.pressed.connect(_on_toggle_lock.bind(i))
		row.add_child(lock_btn)

		# Delete button (only if > 1 layer)
		if MapData.layers.size() > 1:
			var del_btn: Button = Button.new()
			del_btn.text = "X"
			del_btn.custom_minimum_size = Vector2(22, 22)
			del_btn.add_theme_font_size_override("font_size", 9)
			del_btn.add_theme_color_override("font_color", Color(0.8, 0.2, 0.2))
			del_btn.pressed.connect(_on_remove_layer.bind(i))
			row.add_child(del_btn)

		list.add_child(row)


func _on_add_layer() -> void:
	MapData.add_layer()


func _on_select_layer(index: int) -> void:
	MapData.set_active_layer(index)


func _on_toggle_visibility(index: int) -> void:
	MapData.toggle_layer_visibility(index)


func _on_toggle_lock(index: int) -> void:
	MapData.toggle_layer_lock(index)


func _on_remove_layer(index: int) -> void:
	MapData.remove_layer(index)
