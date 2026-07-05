extends Control
## ExportPanel — Import/Export .gemap files and PNG export.
## Replaces src/components/panels/ExportPanel.tsx

var _file_dialog: FileDialog
var _save_dialog: FileDialog


func _ready() -> void:
	_refresh()


func _ensure_dialogs() -> void:
	if not _file_dialog:
		_file_dialog = FileDialog.new()
		_file_dialog.name = "FileDialog"
		_file_dialog.access = FileDialog.ACCESS_FILESYSTEM
		_file_dialog.file_selected.connect(_on_file_selected)
		add_child(_file_dialog)
	if not _save_dialog:
		_save_dialog = FileDialog.new()
		_save_dialog.name = "SaveDialog"
		_save_dialog.access = FileDialog.ACCESS_FILESYSTEM
		add_child(_save_dialog)


func _refresh() -> void:
	for child in get_children():
		if child is FileDialog:
			continue
		child.queue_free()

	_ensure_dialogs()

	var vbox: VBoxContainer = VBoxContainer.new()
	vbox.size_flags_horizontal = Control.SIZE_FILL
	vbox.add_theme_constant_override("separation", 8)
	add_child(vbox)
	move_child(vbox, 0)

	var header: Label = Label.new()
	header.text = "Export / Import"
	header.add_theme_color_override("font_color", Color(0.635, 0.635, 0.635))
	header.add_theme_font_size_override("font_size", 11)
	vbox.add_child(header)

	var desc: Label = Label.new()
	desc.text = "Export your map as a .gemap JSON file, or import one to continue editing."
	desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	desc.add_theme_color_override("font_color", Color(0.443, 0.443, 0.443))
	desc.add_theme_font_size_override("font_size", 9)
	vbox.add_child(desc)

	var export_btn: Button = Button.new()
	export_btn.text = "Export Map"
	export_btn.custom_minimum_size = Vector2(0, 32)
	export_btn.pressed.connect(_on_export)
	vbox.add_child(export_btn)

	var import_btn: Button = Button.new()
	import_btn.text = "Import Map"
	import_btn.custom_minimum_size = Vector2(0, 32)
	import_btn.pressed.connect(_on_import)
	vbox.add_child(import_btn)

	var export_png_btn: Button = Button.new()
	export_png_btn.text = "Export PNG"
	export_png_btn.custom_minimum_size = Vector2(0, 32)
	export_png_btn.pressed.connect(_on_export_png)
	vbox.add_child(export_png_btn)


func _on_export() -> void:
	_save_dialog.filters = PackedStringArray(["*.gemap"])
	_save_dialog.file_mode = FileDialog.FILE_MODE_SAVE_FILE
	_save_dialog.current_file = MapData.world_name.replace(" ", "_") + ".gemap"
	_save_dialog.popup_centered(Vector2(600, 400))
	if not _save_dialog.file_selected.is_connected(_on_save_file):
		_save_dialog.file_selected.connect(_on_save_file)


func _on_save_file(path: String) -> void:
	var data: Dictionary = MapData.export_map()
	var json: String = JSON.stringify(data, "\t")
	var file: FileAccess = FileAccess.open(path, FileAccess.WRITE)
	if file:
		file.store_string(json)


func _on_import() -> void:
	_file_dialog.filters = PackedStringArray(["*.gemap", "*.json"])
	_file_dialog.file_mode = FileDialog.FILE_MODE_OPEN_FILE
	_file_dialog.popup_centered(Vector2(600, 400))


func _on_file_selected(path: String) -> void:
	var file: FileAccess = FileAccess.open(path, FileAccess.READ)
	if not file:
		return
	var text: String = file.get_as_text()
	var data: Variant = JSON.parse_string(text)
	if data != null:
		MapData.import_map(data)


func _on_export_png() -> void:
	_save_dialog.filters = PackedStringArray(["*.png"])
	_save_dialog.file_mode = FileDialog.FILE_MODE_SAVE_FILE
	_save_dialog.current_file = MapData.world_name.replace(" ", "_") + ".png"
	_save_dialog.popup_centered(Vector2(600, 400))
	if not _save_dialog.file_selected.is_connected(_on_save_png):
		_save_dialog.file_selected.connect(_on_save_png)


func _on_save_png(path: String) -> void:
	var png_export: RefCounted = load("res://scripts/png_export.gd").new()
	var img: Image = png_export.render_to_image(MapData)
	if img:
		img.save_png(path)
