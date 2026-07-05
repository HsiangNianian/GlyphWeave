extends Node
## Main entry point — manages scene switching between HomePage and EditorPage.

var _current_scene: Node = null

func _ready() -> void:
	_show_home()


func _show_home() -> void:
	if _current_scene:
		_current_scene.queue_free()
	var home: Node = load("res://scenes/home_page.tscn").instantiate()
	home.start_editor.connect(_on_start_editor)
	add_child(home)
	_current_scene = home


func _on_start_editor(config: Dictionary) -> void:
	if _current_scene:
		_current_scene.queue_free()
	var editor: Node = load("res://scenes/editor_page.tscn").instantiate()
	editor.world_config = config
	editor.go_back.connect(_show_home)
	add_child(editor)
	_current_scene = editor
