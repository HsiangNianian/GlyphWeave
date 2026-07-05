extends Control
## SettingsPanel — View settings: grid toggle, minimap toggle, view distance slider.
## Replaces src/components/panels/SettingsPanel.tsx


func _ready() -> void:
	_refresh()


func _refresh() -> void:
	for child in get_children():
		child.queue_free()

	var vbox: VBoxContainer = VBoxContainer.new()
	vbox.size_flags_horizontal = Control.SIZE_FILL
	vbox.add_theme_constant_override("separation", 12)
	add_child(vbox)

	# ── View section ──
	var view_header: Label = Label.new()
	view_header.text = "View"
	view_header.add_theme_color_override("font_color", Color(0.635, 0.635, 0.635))
	view_header.add_theme_font_size_override("font_size", 11)
	vbox.add_child(view_header)

	# View Distance slider
	var vd_label_row: HBoxContainer = HBoxContainer.new()
	var vd_label: Label = Label.new()
	vd_label.text = "View Distance"
	vd_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	vd_label.add_theme_color_override("font_color", Color(0.635, 0.635, 0.635))
	vd_label.add_theme_font_size_override("font_size", 11)
	var vd_value: Label = Label.new()
	vd_value.text = str(UiState.view_distance)
	vd_value.add_theme_color_override("font_color", Color(0.443, 0.443, 0.443))
	vd_value.add_theme_font_size_override("font_size", 11)
	vd_label_row.add_child(vd_label)
	vd_label_row.add_child(vd_value)
	vbox.add_child(vd_label_row)

	var slider := HSlider.new()
	slider.min_value = 1
	slider.max_value = 50
	slider.value = UiState.view_distance
	slider.size_flags_horizontal = Control.SIZE_FILL
	slider.value_changed.connect(func(v: float): UiState.set_view_distance(int(v)); vd_value.text = str(int(v)))
	vbox.add_child(slider)

	var vd_desc: Label = Label.new()
	vd_desc.text = "Extra tiles rendered beyond viewport edges. Higher = smoother panning, more memory."
	vd_desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	vd_desc.add_theme_color_override("font_color", Color(0.31, 0.31, 0.31))
	vd_desc.add_theme_font_size_override("font_size", 9)
	vbox.add_child(vd_desc)

	# Separator
	var sep: HSeparator = HSeparator.new()
	vbox.add_child(sep)

	# ── Display section ──
	var disp_header: Label = Label.new()
	disp_header.text = "Display"
	disp_header.add_theme_color_override("font_color", Color(0.635, 0.635, 0.635))
	disp_header.add_theme_font_size_override("font_size", 11)
	vbox.add_child(disp_header)

	# Show Grid
	var grid_check := CheckBox.new()
	grid_check.text = "Show Grid"
	grid_check.button_pressed = UiState.show_grid
	grid_check.toggled.connect(func(v: bool): UiState.set_show_grid(v))
	vbox.add_child(grid_check)

	# Show Minimap
	var mm_check := CheckBox.new()
	mm_check.text = "Show Minimap"
	mm_check.button_pressed = UiState.show_minimap
	mm_check.toggled.connect(func(v: bool): UiState.set_show_minimap(v))
	vbox.add_child(mm_check)
