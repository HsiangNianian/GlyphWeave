extends Control
## PresetsPanel — Preset room/structure selection.
## Replaces src/components/panels/PresetsPanel.tsx


func _ready() -> void:
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
	vbox.add_theme_constant_override("separation", 10)
	scroll.add_child(vbox)

	var presets_data: RefCounted = load("res://resources/presets/presets_data.gd")
	var categories := [
		["rooms", "Rooms"],
		["corridors", "Corridors"],
		["features", "Features"],
		["dungeon", "Dungeon"],
		["traps", "Traps"],
	]

	for cat in categories:
		var cat_key: String = cat[0]
		var cat_label: String = cat[1]

		var presets_in_cat: Array[Dictionary] = []
		for p in presets_data.all():
			if p.category == cat_key:
				presets_in_cat.append(p)
		if presets_in_cat.is_empty():
			continue

		var header: Label = Label.new()
		header.text = cat_label
		header.add_theme_color_override("font_color", Color(0.443, 0.443, 0.443))
		header.add_theme_font_size_override("font_size", 10)
		vbox.add_child(header)

		for preset in presets_in_cat:
			var btn: Button = Button.new()
			btn.text = preset.name
			btn.tooltip_text = preset.description
			btn.custom_minimum_size = Vector2(0, 32)
			btn.size_flags_horizontal = Control.SIZE_FILL
			btn.add_theme_font_size_override("font_size", 11)
			btn.pressed.connect(_on_preset_selected.bind(preset.id))

			if MapData.active_preset_id == preset.id:
				btn.modulate = Color(0.5, 0.5, 0.5)

			vbox.add_child(btn)


func _on_preset_selected(id: String) -> void:
	if MapData.active_preset_id == id:
		MapData.set_active_preset("")
	else:
		MapData.set_active_preset(id)
	_refresh()
