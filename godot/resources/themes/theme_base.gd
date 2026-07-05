extends Resource
## ThemeBase — Color theme resource (base class).
## Replaces src/constants/themes.ts

class_name ThemeBase

@export var id: String = ""
@export var name: String = ""
@export var description: String = ""
@export var colors: Dictionary = {}  # { tile_type_id: { fgColor, bgColor } }


func get_fg(tile_id: String, default_color := "#ffffff") -> Color:
	if colors.has(tile_id):
		return Color(colors[tile_id].fgColor)
	return Color(default_color)


func get_bg(tile_id: String, default_color := "#000000") -> Color:
	if colors.has(tile_id):
		return Color(colors[tile_id].bgColor)
	return Color(default_color)


func get_colors(tile_id: String) -> Dictionary:
	return colors.get(tile_id, {"fgColor": "#ffffff", "bgColor": "#000000"})
