extends Node
## UiState — UI preferences singleton.
## Replaces src/stores/ui-store.ts

var side_panel_tab: String = "tiles"
var side_panel_open: bool = true
var show_grid: bool = true
var show_minimap: bool = true
var view_distance: int = 5

signal ui_changed()
signal tab_changed(new_tab: String)


func set_side_panel_tab(tab: String) -> void:
	side_panel_tab = tab
	tab_changed.emit(tab)

func set_side_panel_open(open: bool) -> void:
	side_panel_open = open
	ui_changed.emit()

func toggle_side_panel() -> void:
	side_panel_open = not side_panel_open
	ui_changed.emit()

func set_show_grid(show: bool) -> void:
	show_grid = show
	ui_changed.emit()

func set_show_minimap(show: bool) -> void:
	show_minimap = show
	ui_changed.emit()

func set_view_distance(d: int) -> void:
	view_distance = clampi(d, 1, 100)
	ui_changed.emit()
