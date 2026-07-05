extends RefCounted
## DemoMap — Generates "The Forgotten Catacombs" demo map.
## Replaces src/constants/demo-map.ts

static func generate() -> Dictionary:
	const W := 80
	const H := 48
	var grid: Array = []
	for y in H:
		grid.append([])
		for _x in W:
			grid[y].append("void")

	# Border wall
	for x in W:
		_set_cell(grid, x, 0, "wall", W, H)
		_set_cell(grid, x, H-1, "wall", W, H)
	for y in H:
		_set_cell(grid, 0, y, "wall", W, H)
		_set_cell(grid, W-1, y, "wall", W, H)

	# Entrance Hall
	_place_preset(grid, "entrance-hall", 3, 2, W, H)
	_set_cell(grid, 10, 0, "wall", W, H)
	_set_cell(grid, 10, 1, "wall", W, H)
	_set_cell(grid, 10, 2, "door", W, H)

	# Upper corridors
	_carve_h_corridor(grid, 10, 5, 10, W, H)
	_carve_h_corridor(grid, 24, 5, 10, W, H)
	_carve_h_corridor(grid, 38, 5, 10, W, H)
	_carve_h_corridor(grid, 52, 5, 16, W, H)

	# Upper rooms
	_place_preset(grid, "pillared-hall", 26, 2, W, H)
	_set_cell(grid, 33, 9, "door", W, H)
	_place_preset(grid, "fountain-hall", 40, 2, W, H)
	_set_cell(grid, 47, 9, "door", W, H)

	# Left vertical corridor
	_carve_v_corridor(grid, 8, 9, 6, W, H)
	_carve_h_corridor(grid, 3, 15, 10, W, H)
	_carve_h_corridor(grid, 17, 15, 10, W, H)

	# Cross junction
	_place_preset(grid, "cross-room", 20, 12, W, H)
	_set_cell(grid, 27, 12, "door", W, H)
	_set_cell(grid, 27, 21, "door", W, H)

	# Right rooms
	_carve_v_corridor(grid, 52, 9, 8, W, H)
	_place_preset(grid, "graveyard", 54, 18, W, H)
	_set_cell(grid, 61, 25, "door", W, H)
	_place_preset(grid, "prison", 64, 2, W, H)
	_set_cell(grid, 71, 9, "door", W, H)

	# Central stairs room
	_place_preset(grid, "stairs-set", 13, 18, W, H)
	_set_cell(grid, 16, 18, "door", W, H)

	# Lower left: lake, bridge, forest
	_place_preset(grid, "lake", 2, 24, W, H)
	_set_cell(grid, 7, 31, "floor", W, H)
	_set_cell(grid, 7, 32, "floor", W, H)
	_carve_h_corridor(grid, 2, 33, 16, W, H)
	_place_preset(grid, "bridge", 9, 28, W, H)
	_place_preset(grid, "forest", 14, 24, W, H)

	# Lower center: throne vault lava
	_carve_v_corridor(grid, 24, 22, 8, W, H)
	_place_preset(grid, "throne-room", 20, 30, W, H)
	_set_cell(grid, 28, 30, "door", W, H)
	_carve_h_corridor(grid, 32, 34, 8, W, H)
	_place_preset(grid, "vault", 40, 32, W, H)
	_set_cell(grid, 45, 32, "door", W, H)

	# Lava fissure
	_fill_rect(grid, 2, 38, 10, 3, "lava", W, H)
	for x in 12:
		if randf() > 0.3: _set_cell(grid, x, 37, "wall", W, H)
		if randf() > 0.3: _set_cell(grid, x, 41, "wall", W, H)
	_place_preset(grid, "bridge", 5, 38, W, H)
	_set_cell(grid, 3, 36, "blood", W, H)
	_set_cell(grid, 4, 36, "blood", W, H)

	# Bottom rooms
	_carve_h_corridor(grid, 14, 38, 10, W, H)
	_carve_h_corridor(grid, 28, 38, 10, W, H)
	_carve_v_corridor(grid, 38, 36, 3, W, H)
	_place_preset(grid, "shop", 28, 40, W, H)
	_set_cell(grid, 35, 40, "door", W, H)
	_place_preset(grid, "altar-room", 40, 38, W, H)
	_set_cell(grid, 45, 38, "door", W, H)

	# Trap corridor
	_carve_v_corridor(grid, 55, 26, 14, W, H)
	_place_preset(grid, "trap-corridor", 52, 34, W, H)
	_set_cell(grid, 60, 34, "door", W, H)

	# Kitchen
	_place_preset(grid, "kitchen", 58, 38, W, H)
	_set_cell(grid, 65, 38, "door", W, H)

	# Random grass
	for _i in 20:
		var gx := 2 + randi() % 76
		var gy := 2 + randi() % 44
		if grid[gy][gx] == "void":
			_set_cell(grid, gx, gy, "grass", W, H)

	# Random graves
	for _i in 8:
		var gx := 2 + randi() % 76
		var gy := 2 + randi() % 44
		if grid[gy][gx] == "void":
			_set_cell(grid, gx, gy, "grave", W, H)

	# Convert to flat tiles dict
	var tiles: Dictionary = {}
	for y in H:
		for x in W:
			var tid: String = grid[y][x]
			if tid != "void":
				tiles["%d,%d" % [x, y]] = tid
	return tiles


static func _set_cell(grid: Array, x: int, y: int, tid: String, W: int, H: int) -> void:
	if y >= 0 and y < grid.size() and x >= 0 and x < grid[y].size():
		grid[y][x] = tid


static func _fill_rect(grid: Array, x: int, y: int, w: int, h: int, tid: String, W: int, H: int) -> void:
	for dy in h:
		for dx in w:
			_set_cell(grid, x + dx, y + dy, tid, W, H)


static func _place_preset(grid: Array, preset_id: String, ox: int, oy: int, W: int, H: int) -> void:
	var presets_data: RefCounted = load("res://resources/presets/presets_data.gd")
	for p in presets_data.all():
		if p.id == preset_id:
			for py in p.grid.size():
				for px in p.grid[py].size():
					var cell: String = p.grid[py][px]
					if cell != "void":
						_set_cell(grid, ox + px, oy + py, cell, W, H)
			return


static func _carve_h_corridor(grid: Array, x: int, y: int, length: int, W: int, H: int) -> void:
	for dx in length:
		_set_cell(grid, x + dx, y, "floor", W, H)
		# Wall below/above if void
		if y > 0 and grid[y-1][x+dx] == "void":
			_set_cell(grid, x+dx, y-1, "wall", W, H)
		if y < H-1 and grid[y+1][x+dx] == "void":
			_set_cell(grid, x+dx, y+1, "wall", W, H)


static func _carve_v_corridor(grid: Array, x: int, y: int, length: int, W: int, H: int) -> void:
	for dy in length:
		_set_cell(grid, x, y + dy, "floor", W, H)
		if x > 0 and grid[y+dy][x-1] == "void":
			_set_cell(grid, x-1, y+dy, "wall", W, H)
		if x < W-1 and grid[y+dy][x+1] == "void":
			_set_cell(grid, x+1, y+dy, "wall", W, H)
