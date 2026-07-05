extends Control
## EditorPage — Main editor layout with toolbar, canvas, side panel, minimap.
## Replaces src/components/pages/EditorPage.tsx

signal go_back()

var world_config: Dictionary = {}

@onready var _toolbar: Control = %Toolbar
@onready var _canvas_container: SubViewportContainer = %CanvasContainer
@onready var _side_panel: PanelContainer = %SidePanel
@onready var _tab_buttons: HBoxContainer = %TabButtons
@onready var _panel_content: Control = %PanelContent
@onready var _minimap: Control = %Minimap
@onready var _back_button: Button = %BackButton
@onready var _toggle_panel_button: Button = %TogglePanelButton


func _ready() -> void:
	MapData.init_world(world_config)

	# Attach panel scripts
	_attach_script(%TilePalette, preload("res://scripts/tile_palette.gd"))
	_attach_script(%PresetsPanel, preload("res://scripts/presets_panel.gd"))
	_attach_script(%LayersPanel, preload("res://scripts/layers_panel.gd"))
	_attach_script(%ExportPanel, preload("res://scripts/export_panel.gd"))
	_attach_script(%SettingsPanel, preload("res://scripts/settings_panel.gd"))

	# Attach toolbar script
	_attach_script(_toolbar, preload("res://scripts/toolbar.gd"))

	# Attach minimap script
	_attach_script(_minimap, preload("res://scripts/minimap.gd"))

	# Add file dialogs for export panel
	var file_dialog: FileDialog = FileDialog.new()
	file_dialog.name = "FileDialog"
	file_dialog.access = FileDialog.ACCESS_FILESYSTEM
	add_child(file_dialog)

	var save_dialog: FileDialog = FileDialog.new()
	save_dialog.name = "SaveDialog"
	save_dialog.access = FileDialog.ACCESS_FILESYSTEM
	add_child(save_dialog)

	_setup_tab_buttons()
	_show_panel("tiles")
	_refresh_side_panel()
	UiState.ui_changed.connect(_refresh_side_panel)
	UiState.tab_changed.connect(_show_panel)

	_back_button.pressed.connect(func(): go_back.emit())
	_toggle_panel_button.pressed.connect(func(): UiState.toggle_side_panel())


func _attach_script(node: Control, script: Script) -> void:
	if node and not node.script:
		node.script = script


func _refresh_side_panel() -> void:
	_side_panel.visible = UiState.side_panel_open


func _setup_tab_buttons() -> void:
	for child in _tab_buttons.get_children():
		child.queue_free()

	var tabs := [
		["tiles", "Tiles"],
		["presets", "Presets"],
		["layers", "Layers"],
		["export", "Export"],
		["settings", "Settings"],
	]
	for t in tabs:
		var btn: Button = Button.new()
		btn.text = t[1]
		btn.custom_minimum_size = Vector2(0, 28)
		btn.add_theme_font_size_override("font_size", 11)
		btn.pressed.connect(_show_panel.bind(t[0]))
		btn.name = "Tab_%s" % t[0]
		_tab_buttons.add_child(btn)


func _show_panel(tab: String) -> void:
	%TilePalette.visible = (tab == "tiles")
	%PresetsPanel.visible = (tab == "presets")
	%LayersPanel.visible = (tab == "layers")
	%ExportPanel.visible = (tab == "export")
	%SettingsPanel.visible = (tab == "settings")
	UiState.side_panel_tab = tab
