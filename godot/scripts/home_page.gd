extends Control
## HomePage — World creation / import screen.

signal start_editor(config: Dictionary)

const TILE_SIZES := [16, 20, 24, 32]
const THEME_IDS := ["ansi-16", "cogmind"]

var _tile_size: int = 24
var _theme_id: String = "ansi-16"

@onready var _world_input: LineEdit = %WorldNameInput
@onready var _tile_size_buttons: Array[Button] = []
@onready var _theme_options: VBoxContainer = %ThemeOptions
@onready var _create_button: Button = %CreateButton
@onready var _import_button: Button = %ImportButton
@onready var _demo_button: Button = %DemoButton
@onready var _file_dialog: FileDialog = %FileDialog


func _ready() -> void:
	_setup_tile_size_buttons()
	_setup_theme_options()
	_create_button.pressed.connect(_on_create)
	_import_button.pressed.connect(_on_import_click)
	_demo_button.pressed.connect(_on_demo)
	_file_dialog.file_selected.connect(_on_file_selected)


func _setup_tile_size_buttons() -> void:
	var container: HBoxContainer = %TileSizeContainer
	var group = %TileSizeGroup
	for sz in TILE_SIZES:
		var btn: Button = Button.new()
		btn.text = "%dpx" % sz
		btn.name = "TileSize%d" % sz
		btn.button_group = group
		btn.custom_minimum_size = Vector2(60, 32)
		btn.pressed.connect(_on_tile_size_changed.bind(sz))
		if sz == _tile_size:
			btn.button_pressed = true
		container.add_child(btn)
		_tile_size_buttons.append(btn)


func _on_tile_size_changed(sz: int) -> void:
	_tile_size = sz


func _setup_theme_options() -> void:
	for theme_id in THEME_IDS:
		var theme_res: Resource = load("res://resources/themes/" + theme_id.replace("-", "_") + ".tres")
		if not theme_res:
			continue

		var row: HBoxContainer = HBoxContainer.new()
		row.custom_minimum_size = Vector2(0, 44)
		row.size_flags_horizontal = Control.SIZE_FILL
		row.add_theme_constant_override("separation", 8)

		var swatches: HBoxContainer = HBoxContainer.new()
		swatches.add_theme_constant_override("separation", 4)
		for tile_id in ["wall", "floor", "door", "water", "tree", "lava"]:
			var colors: Dictionary = theme_res.get_colors(tile_id)
			var swatch: ColorRect = ColorRect.new()
			swatch.custom_minimum_size = Vector2(20, 20)
			swatch.color = Color(colors.get("bgColor", "#000000"))
			swatches.add_child(swatch)

		var label: VBoxContainer = VBoxContainer.new()
		var name_label: Label = Label.new()
		name_label.text = theme_res.name
		name_label.add_theme_color_override("font_color", Color("#e4e4e7"))
		name_label.add_theme_font_size_override("font_size", 13)
		var desc_label: Label = Label.new()
		desc_label.text = theme_res.description
		desc_label.add_theme_color_override("font_color", Color("#71717a"))
		desc_label.add_theme_font_size_override("font_size", 10)
		label.add_child(name_label)
		label.add_child(desc_label)

		var spacer := Control.new()
		spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL

		var dot: ColorRect = ColorRect.new()
		dot.custom_minimum_size = Vector2(8, 8)
		dot.color = Color("#e4e4e7") if theme_id == _theme_id else Color.TRANSPARENT

		row.add_child(swatches)
		row.add_child(label)
		row.add_child(spacer)
		row.add_child(dot)

		row.gui_input.connect(_on_theme_row_clicked.bind(theme_id))
		_theme_options.add_child(row)


func _on_theme_row_clicked(event: InputEvent, theme_id: String) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		_theme_id = theme_id
		for c in _theme_options.get_children():
			c.queue_free()
		_setup_theme_options()


func _on_create() -> void:
	var name_str: String = _world_input.text.strip_edges()
	if name_str == "":
		return
	start_editor.emit({
		"worldName": name_str,
		"tileSize": _tile_size,
		"themeId": _theme_id,
	})


func _on_import_click() -> void:
	_file_dialog.filters = PackedStringArray(["*.gemap", "*.json"])
	_file_dialog.file_mode = FileDialog.FILE_MODE_OPEN_FILE
	_file_dialog.popup_centered(Vector2(600, 400))


func _on_file_selected(path: String) -> void:
	var file: FileAccess = FileAccess.open(path, FileAccess.READ)
	if not file:
		return
	var text: String = file.get_as_text()
	var data: Variant = JSON.parse_string(text)
	if data == null:
		return

	var file_name: String = path.get_file()
	var default_name: String = file_name.replace(".gemap", "").replace(".json", "")
	var map_world_name: String = str(data.get("worldName", default_name))

	var config: Dictionary = {
		"worldName": map_world_name,
		"tileSize": _tile_size,
		"themeId": _theme_id,
	}

	if data.has("layerTiles") and data.has("layers") and data.layers.size() > 0:
		config["initialLayerTiles"] = data.layerTiles
		config["initialLayers"] = data.layers
	elif data.has("tiles"):
		config["initialTiles"] = data.tiles

	start_editor.emit(config)


func _on_demo() -> void:
	var demo: RefCounted = load("res://resources/demo_map.gd").new()
	start_editor.emit({
		"worldName": "The Forgotten Catacombs",
		"tileSize": _tile_size,
		"themeId": _theme_id,
		"initialTiles": demo.generate(),
	})
