extends Control
## Minimap — Real-time minimap with viewport rectangle indicator.

const WIDTH := 200
const HEIGHT := 140

var _base_image: Image
var _base_texture: ImageTexture


func _ready() -> void:
	MapData.tiles_changed.connect(_rebuild_base)
	MapData.layers_changed.connect(_rebuild_base)
	MapData.theme_changed.connect(_rebuild_base)
	MapData.world_initialized.connect(_rebuild_base)
	custom_minimum_size = Vector2(WIDTH, HEIGHT)
	_rebuild_base()


func _rebuild_base() -> void:
	var b := MapData.compute_bounds()
	if b.w <= 1 and b.h <= 1:
		_base_texture = null
		queue_redraw()
		return

	var ts := float(MapData.tile_size)
	var scale_x: float = WIDTH / (b.w * ts)
	var scale_y: float = HEIGHT / (b.h * ts)
	var scale: float = minf(scale_x, scale_y)

	var img := Image.create(WIDTH, HEIGHT, false, Image.FORMAT_RGBA8)
	img.fill(Color(0.0588, 0.0588, 0.0588))

	var theme_res := _load_theme()

	for li in range(MapData.layers.size()):
		var layer: MapData.LayerInfo = MapData.layers[li]
		if not layer.visible:
			continue
		var lt: Dictionary = MapData.tiles.get(layer.id, {})
		if lt.is_empty():
			continue

		for k in lt:
			var tile_id: String = lt[k]
			if tile_id == "" or tile_id == "void":
				continue
			var parts: PackedStringArray = k.split(",")
			var x: int = int(parts[0]) - b.minX
			var y: int = int(parts[1]) - b.minY

			var colors: Dictionary = {}
			if theme_res:
				colors = theme_res.get_colors(tile_id)
			var color := Color(colors.get("bgColor", "#000000"))

			var rx: int = int(x * ts * scale)
			var ry: int = int(y * ts * scale)
			var rw: int = maxi(int(ts * scale) + 1, 1)
			var rh: int = maxi(int(ts * scale) + 1, 1)

			img.fill_rect(Rect2i(rx, ry, rw, rh), color)

	_base_image = img
	_base_texture = ImageTexture.create_from_image(_base_image)
	queue_redraw()


func _draw() -> void:
	if not _base_texture:
		return
	draw_texture(_base_texture, Vector2.ZERO)


func _load_theme() -> Resource:
	var path: String = "res://resources/themes/" + MapData.theme_id.replace("-", "_") + ".tres"
	return load(path)
