extends Control
## Toolbar — Vertical tool buttons (Brush, Eraser, Fill, Pan, Select) + Undo/Redo.
## Replaces src/components/toolbar/Toolbar.tsx


func _ready() -> void:
	_refresh()


func _refresh() -> void:
	for child in get_children():
		child.queue_free()

	var vbox: VBoxContainer = VBoxContainer.new()
	vbox.size_flags_vertical = Control.SIZE_FILL
	vbox.add_theme_constant_override("separation", 4)
	add_child(vbox)

	# Top spacer
	vbox.add_child(_make_spacer(8))

	var tools := [
		["brush", "B", "Brush"],
		["erase", "E", "Eraser"],
		["fill", "F", "Fill"],
		["pan", "P", "Pan"],
		["select", "S", "Select"],
	]

	for t in tools:
		var tool_id: String = t[0]
		var shortcut: String = t[1]
		var label: String = t[2]

		var is_active: bool = false
		match tool_id:
			"brush": is_active = (MapData.current_tool == MapData.Tool.BRUSH)
			"erase": is_active = (MapData.current_tool == MapData.Tool.ERASE)
			"fill": is_active = (MapData.current_tool == MapData.Tool.FILL)
			"pan": is_active = (MapData.current_tool == MapData.Tool.PAN)
			"select": is_active = (MapData.current_tool == MapData.Tool.SELECT)

		var btn: Button = Button.new()
		btn.text = shortcut
		btn.tooltip_text = "%s [%s]" % [label, shortcut]
		btn.custom_minimum_size = Vector2(36, 36)
		btn.add_theme_font_size_override("font_size", 12)
		btn.pressed.connect(_on_tool_selected.bind(tool_id))

		if is_active:
			var sbf := StyleBoxFlat.new()
			sbf.bg_color = Color(0.3, 0.3, 0.3)
			sbf.set_corner_radius_all(4)
			btn.add_theme_stylebox_override("normal", sbf)

		vbox.add_child(btn)

	# Separator
	vbox.add_child(_make_separator())

	# Undo
	var undo_btn: Button = Button.new()
	undo_btn.text = "↩"
	undo_btn.tooltip_text = "Undo [Ctrl+Z]"
	undo_btn.custom_minimum_size = Vector2(36, 36)
	undo_btn.pressed.connect(func(): MapData.undo())
	vbox.add_child(undo_btn)

	# Redo
	var redo_btn: Button = Button.new()
	redo_btn.text = "↪"
	redo_btn.tooltip_text = "Redo [Ctrl+Shift+Z]"
	redo_btn.custom_minimum_size = Vector2(36, 36)
	redo_btn.pressed.connect(func(): MapData.redo())
	vbox.add_child(redo_btn)

	# Bottom spacer
	vbox.add_child(_make_spacer(0))


func _on_tool_selected(tool_id: String) -> void:
	match tool_id:
		"brush": MapData.set_current_tool(MapData.Tool.BRUSH)
		"erase": MapData.set_current_tool(MapData.Tool.ERASE)
		"fill": MapData.set_current_tool(MapData.Tool.FILL)
		"pan": MapData.set_current_tool(MapData.Tool.PAN)
		"select": MapData.set_current_tool(MapData.Tool.SELECT)
	_refresh()


func _make_spacer(height: int) -> Control:
	var c := Control.new()
	if height > 0:
		c.custom_minimum_size = Vector2(0, height)
	else:
		c.size_flags_vertical = Control.SIZE_EXPAND_FILL
	return c


func _make_separator() -> Control:
	var sep: HSeparator = HSeparator.new()
	sep.custom_minimum_size = Vector2(36, 2)
	return sep
