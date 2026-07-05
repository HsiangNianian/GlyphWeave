extends Node
## PresetsData — 25 preset rooms, corridors, features, dungeons, traps.
## Replaces src/constants/presets.ts

static func all() -> Array[Dictionary]:
	return [
		# ── Rooms ──────────────────────────────────────────────
		{
			"id": "small-room", "name": "Small Room", "description": "A cozy 5×5 room.", "category": "rooms",
			"grid": [
				["wall","wall","wall","wall","wall"],
				["wall","floor","floor","floor","wall"],
				["wall","floor","floor","floor","wall"],
				["wall","floor","floor","floor","wall"],
				["wall","wall","wall","wall","wall"],
			]
		},
		{
			"id": "medium-room", "name": "Medium Room", "description": "A spacious 7×7 room.", "category": "rooms",
			"grid": [
				["wall","wall","wall","wall","wall","wall","wall"],
				["wall","floor","floor","floor","floor","floor","wall"],
				["wall","floor","floor","floor","floor","floor","wall"],
				["wall","floor","floor","floor","floor","floor","wall"],
				["wall","floor","floor","floor","floor","floor","wall"],
				["wall","floor","floor","floor","floor","floor","wall"],
				["wall","wall","wall","wall","wall","wall","wall"],
			]
		},
		{
			"id": "large-room", "name": "Large Room", "description": "A grand 11×11 hall.", "category": "rooms",
			"grid": [
				["wall","wall","wall","wall","wall","wall","wall","wall","wall","wall","wall"],
				["wall","floor","floor","floor","floor","floor","floor","floor","floor","floor","wall"],
				["wall","floor","floor","floor","floor","floor","floor","floor","floor","floor","wall"],
				["wall","floor","floor","floor","floor","floor","floor","floor","floor","floor","wall"],
				["wall","floor","floor","floor","floor","floor","floor","floor","floor","floor","wall"],
				["wall","floor","floor","floor","floor","floor","floor","floor","floor","floor","wall"],
				["wall","floor","floor","floor","floor","floor","floor","floor","floor","floor","wall"],
				["wall","floor","floor","floor","floor","floor","floor","floor","floor","floor","wall"],
				["wall","floor","floor","floor","floor","floor","floor","floor","floor","floor","wall"],
				["wall","floor","floor","floor","floor","floor","floor","floor","floor","floor","wall"],
				["wall","wall","wall","wall","wall","wall","wall","wall","wall","wall","wall"],
			]
		},
		{
			"id": "wide-room", "name": "Wide Room", "description": "A wide 13×7 rectangular room.", "category": "rooms",
			"grid": [
				["wall","wall","wall","wall","wall","wall","wall","wall","wall","wall","wall","wall","wall"],
				["wall","floor","floor","floor","floor","floor","floor","floor","floor","floor","floor","floor","wall"],
				["wall","floor","floor","floor","floor","floor","floor","floor","floor","floor","floor","floor","wall"],
				["wall","floor","floor","floor","floor","floor","floor","floor","floor","floor","floor","floor","wall"],
				["wall","floor","floor","floor","floor","floor","floor","floor","floor","floor","floor","floor","wall"],
				["wall","floor","floor","floor","floor","floor","floor","floor","floor","floor","floor","floor","wall"],
				["wall","wall","wall","wall","wall","wall","wall","wall","wall","wall","wall","wall","wall"],
			]
		},
		{
			"id": "cross-room", "name": "Cross Room", "description": "A cross-shaped chamber.", "category": "rooms",
			"grid": [
				["void","void","wall","wall","wall","wall","wall","void","void"],
				["void","void","wall","floor","floor","floor","wall","void","void"],
				["void","void","wall","floor","floor","floor","wall","void","void"],
				["wall","wall","wall","floor","floor","floor","wall","wall","wall"],
				["wall","floor","floor","floor","floor","floor","floor","floor","wall"],
				["wall","floor","floor","floor","floor","floor","floor","floor","wall"],
				["wall","wall","wall","floor","floor","floor","wall","wall","wall"],
				["void","void","wall","floor","floor","floor","wall","void","void"],
				["void","void","wall","floor","floor","floor","wall","void","void"],
				["void","void","wall","wall","wall","wall","wall","void","void"],
			]
		},
		{
			"id": "l-room", "name": "L-Shape Room", "description": "An L-shaped room.", "category": "rooms",
			"grid": [
				["wall","wall","wall","wall","wall","wall","wall","wall"],
				["wall","floor","floor","floor","floor","floor","floor","wall"],
				["wall","floor","floor","floor","floor","floor","floor","wall"],
				["wall","floor","floor","floor","floor","floor","floor","wall"],
				["wall","floor","floor","floor","wall","wall","wall","wall"],
				["wall","floor","floor","floor","wall","void","void","void"],
				["wall","floor","floor","floor","wall","void","void","void"],
				["wall","wall","wall","wall","wall","void","void","void"],
			]
		},
		{
			"id": "t-room", "name": "T-Shape Room", "description": "A T-shaped meeting room.", "category": "rooms",
			"grid": [
				["wall","wall","wall","wall","wall","wall","wall","wall","wall"],
				["wall","floor","floor","floor","floor","floor","floor","floor","wall"],
				["wall","floor","floor","floor","floor","floor","floor","floor","wall"],
				["wall","wall","wall","floor","floor","floor","wall","wall","wall"],
				["void","void","wall","floor","floor","floor","wall","void","void"],
				["void","void","wall","floor","floor","floor","wall","void","void"],
				["void","void","wall","floor","floor","floor","wall","void","void"],
				["void","void","wall","wall","wall","wall","wall","void","void"],
			]
		},
		{
			"id": "octagon-room", "name": "Octagon Room", "description": "An octagonal chamber.", "category": "rooms",
			"grid": [
				["void","void","wall","wall","wall","wall","wall","void","void"],
				["void","wall","wall","floor","floor","floor","wall","wall","void"],
				["wall","wall","floor","floor","floor","floor","floor","wall","wall"],
				["wall","floor","floor","floor","floor","floor","floor","floor","wall"],
				["wall","floor","floor","floor","floor","floor","floor","floor","wall"],
				["wall","floor","floor","floor","floor","floor","floor","floor","wall"],
				["wall","wall","floor","floor","floor","floor","floor","wall","wall"],
				["void","wall","wall","floor","floor","floor","wall","wall","void"],
				["void","void","wall","wall","wall","wall","wall","void","void"],
			]
		},
		{
			"id": "pillared-hall", "name": "Pillared Hall", "description": "A hall with support pillars.", "category": "rooms",
			"grid": [
				["wall","wall","wall","wall","wall","wall","wall","wall","wall"],
				["wall","floor","floor","pillar","floor","pillar","floor","floor","wall"],
				["wall","floor","floor","floor","floor","floor","floor","floor","wall"],
				["wall","pillar","floor","floor","floor","floor","floor","pillar","wall"],
				["wall","floor","floor","floor","floor","floor","floor","floor","wall"],
				["wall","floor","floor","floor","floor","floor","floor","floor","wall"],
				["wall","pillar","floor","floor","floor","floor","floor","pillar","wall"],
				["wall","floor","floor","floor","floor","floor","floor","floor","wall"],
				["wall","floor","floor","pillar","floor","pillar","floor","floor","wall"],
				["wall","wall","wall","wall","wall","wall","wall","wall","wall"],
			]
		},
		# ── Corridors ─────────────────────────────────────────
		{
			"id": "corridor-h", "name": "Horizontal Corridor", "description": "A straight 1×7 horizontal passage.", "category": "corridors",
			"grid": [
				["wall","wall","wall","wall","wall","wall","wall","wall","wall"],
				["floor","floor","floor","floor","floor","floor","floor","floor","floor"],
				["wall","wall","wall","wall","wall","wall","wall","wall","wall"],
			]
		},
		{
			"id": "corridor-v", "name": "Vertical Corridor", "description": "A straight 7×1 vertical passage.", "category": "corridors",
			"grid": [
				["wall","floor","wall"],
				["wall","floor","wall"],
				["wall","floor","wall"],
				["wall","floor","wall"],
				["wall","floor","wall"],
				["wall","floor","wall"],
				["wall","floor","wall"],
			]
		},
		{
			"id": "corridor-wide-h", "name": "Wide H-Corridor", "description": "A 2-tile-wide horizontal corridor.", "category": "corridors",
			"grid": [
				["wall","wall","wall","wall","wall","wall","wall","wall","wall"],
				["floor","floor","floor","floor","floor","floor","floor","floor","floor"],
				["floor","floor","floor","floor","floor","floor","floor","floor","floor"],
				["wall","wall","wall","wall","wall","wall","wall","wall","wall"],
			]
		},
		{
			"id": "t-junction", "name": "T-Junction", "description": "A three-way corridor junction.", "category": "corridors",
			"grid": [
				["wall","floor","wall","void","void","void"],
				["wall","floor","wall","void","void","void"],
				["floor","floor","floor","floor","floor","floor"],
				["wall","floor","wall","void","void","void"],
				["wall","floor","wall","void","void","void"],
			]
		},
		{
			"id": "cross-junction", "name": "Cross Junction", "description": "A four-way corridor crossing.", "category": "corridors",
			"grid": [
				["void","void","wall","floor","wall","void","void"],
				["void","void","wall","floor","wall","void","void"],
				["floor","floor","floor","floor","floor","floor","floor"],
				["wall","floor","wall","wall","floor","wall","wall"],
				["floor","floor","floor","floor","floor","floor","floor"],
				["void","void","wall","floor","wall","void","void"],
				["void","void","wall","floor","wall","void","void"],
			]
		},
		{
			"id": "corner", "name": "Corner", "description": "An L-shaped corridor bend.", "category": "corridors",
			"grid": [
				["wall","floor","wall","wall","wall"],
				["wall","floor","floor","floor","wall"],
				["wall","wall","wall","floor","wall"],
				["void","void","void","floor","wall"],
			]
		},
		{
			"id": "s-corridor", "name": "S-Corridor", "description": "A snaking S-shaped passage.", "category": "corridors",
			"grid": [
				["floor","floor","floor","wall","wall"],
				["wall","wall","floor","floor","floor"],
				["wall","wall","wall","wall","floor"],
				["floor","floor","floor","floor","floor"],
				["wall","floor","wall","wall","wall"],
				["wall","floor","floor","floor","wall"],
				["wall","wall","wall","floor","floor"],
			]
		},
		# ── Features ──────────────────────────────────────────
		{
			"id": "vault", "name": "Treasure Vault", "description": "A small heavily-walled treasure room.", "category": "features",
			"grid": [
				["wall","wall","wall","wall","wall"],
				["wall","floor","floor","floor","wall"],
				["wall","floor","treasure","floor","wall"],
				["wall","floor","floor","floor","wall"],
				["wall","wall","wall","wall","wall"],
			]
		},
		{
			"id": "fountain-hall", "name": "Fountain Hall", "description": "A room with a central fountain.", "category": "features",
			"grid": [
				["wall","wall","wall","wall","wall","wall","wall"],
				["wall","floor","floor","floor","floor","floor","wall"],
				["wall","floor","floor","fountain","floor","floor","wall"],
				["wall","floor","fountain","fountain","fountain","floor","wall"],
				["wall","floor","floor","fountain","floor","floor","wall"],
				["wall","floor","floor","floor","floor","floor","wall"],
				["wall","wall","wall","wall","wall","wall","wall"],
			]
		},
		{
			"id": "lake", "name": "Lake", "description": "A small body of water.", "category": "features",
			"grid": [
				["void","void","water","water","water","void","void"],
				["void","water","water","water","water","water","void"],
				["water","water","water","water","water","water","water"],
				["water","water","water","water","water","water","water"],
				["water","water","water","water","water","water","water"],
				["void","water","water","water","water","water","void"],
				["void","void","water","water","water","void","void"],
			]
		},
		{
			"id": "forest", "name": "Forest Grove", "description": "A cluster of trees.", "category": "features",
			"grid": [
				["tree","void","tree","void","tree","void"],
				["void","tree","void","tree","void","tree"],
				["tree","void","tree","void","tree","void"],
				["void","tree","void","tree","void","tree"],
				["tree","void","tree","void","tree","void"],
			]
		},
		{
			"id": "graveyard", "name": "Graveyard", "description": "A burial ground with graves.", "category": "features",
			"grid": [
				["wall","wall","wall","wall","wall","wall","wall"],
				["wall","grave","floor","grave","floor","grave","wall"],
				["wall","floor","floor","floor","floor","floor","wall"],
				["wall","grave","floor","grave","floor","grave","wall"],
				["wall","floor","floor","floor","floor","floor","wall"],
				["wall","grave","floor","grave","floor","grave","wall"],
				["wall","wall","wall","wall","wall","wall","wall"],
			]
		},
		{
			"id": "altar-room", "name": "Altar Room", "description": "A somber chamber with an altar.", "category": "features",
			"grid": [
				["wall","wall","wall","wall","wall"],
				["wall","floor","floor","floor","wall"],
				["wall","floor","altar","floor","wall"],
				["wall","floor","floor","floor","wall"],
				["wall","wall","wall","wall","wall"],
			]
		},
		# ── Dungeon ───────────────────────────────────────────
		{
			"id": "entrance-hall", "name": "Entrance Hall", "description": "A grand entrance with stairs down.", "category": "dungeon",
			"grid": [
				["wall","wall","wall","wall","wall","wall","wall"],
				["door","floor","floor","floor","floor","floor","door"],
				["wall","floor","floor","floor","floor","floor","wall"],
				["wall","floor","floor","stairsDown","floor","floor","wall"],
				["wall","floor","floor","floor","floor","floor","wall"],
				["door","floor","floor","floor","floor","floor","door"],
				["wall","wall","wall","wall","wall","wall","wall"],
			]
		},
		{
			"id": "prison", "name": "Prison", "description": "A cell block.", "category": "dungeon",
			"grid": [
				["wall","wall","wall","wall","wall","wall","wall","wall","wall"],
				["door","floor","floor","floor","wall","floor","floor","floor","door"],
				["wall","cage","floor","cage","wall","floor","floor","floor","wall"],
				["wall","floor","floor","floor","wall","wall","wall","wall","wall"],
				["wall","floor","floor","floor","wall","floor","floor","floor","wall"],
				["wall","cage","floor","cage","wall","floor","floor","floor","wall"],
				["wall","floor","floor","floor","wall","floor","floor","floor","wall"],
				["wall","wall","wall","wall","wall","wall","wall","wall","wall"],
			]
		},
		{
			"id": "bridge", "name": "Bridge", "description": "A bridge crossing water.", "category": "dungeon",
			"grid": [
				["wall","floor","wall"],
				["water","bridge","water"],
				["water","bridge","water"],
				["water","bridge","water"],
				["water","bridge","water"],
				["water","bridge","water"],
				["wall","floor","wall"],
			]
		},
		{
			"id": "shop", "name": "Shop", "description": "A merchant shop.", "category": "dungeon",
			"grid": [
				["wall","wall","wall","wall","wall","wall","wall"],
				["door","floor","floor","floor","floor","floor","door"],
				["wall","table","table","floor","table","table","wall"],
				["wall","floor","floor","floor","floor","floor","wall"],
				["wall","table","table","floor","table","table","wall"],
				["wall","floor","floor","floor","floor","floor","wall"],
				["wall","wall","wall","wall","wall","wall","wall"],
			]
		},
		{
			"id": "kitchen", "name": "Kitchen", "description": "A kitchen with tables.", "category": "dungeon",
			"grid": [
				["wall","wall","wall","wall","wall","wall","wall"],
				["wall","floor","floor","floor","floor","floor","wall"],
				["wall","table","table","floor","table","table","wall"],
				["wall","floor","floor","floor","floor","floor","wall"],
				["wall","table","table","floor","table","table","wall"],
				["wall","floor","floor","floor","floor","floor","wall"],
				["wall","wall","wall","wall","wall","wall","wall"],
			]
		},
		{
			"id": "throne-room", "name": "Throne Room", "description": "A royal throne chamber.", "category": "dungeon",
			"grid": [
				["wall","wall","wall","wall","wall","wall","wall","wall","wall"],
				["wall","floor","floor","floor","floor","floor","floor","floor","wall"],
				["wall","floor","floor","floor","floor","floor","floor","floor","wall"],
				["wall","floor","floor","throne","throne","floor","floor","floor","wall"],
				["wall","floor","floor","throne","throne","floor","floor","floor","wall"],
				["wall","floor","floor","floor","floor","floor","floor","floor","wall"],
				["wall","floor","floor","floor","floor","floor","floor","floor","wall"],
				["wall","floor","floor","floor","floor","floor","floor","floor","wall"],
				["wall","wall","wall","wall","wall","wall","wall","wall","wall"],
			]
		},
		{
			"id": "stairs-set", "name": "Stairs Set", "description": "Up and down stairs side by side.", "category": "dungeon",
			"grid": [
				["wall","wall","wall","wall","wall"],
				["wall","floor","floor","floor","wall"],
				["wall","stairsUp","floor","stairsDown","wall"],
				["wall","floor","floor","floor","wall"],
				["wall","wall","wall","wall","wall"],
			]
		},
		# ── Traps ─────────────────────────────────────────────
		{
			"id": "trap-corridor", "name": "Trapped Corridor", "description": "A corridor lined with traps.", "category": "traps",
			"grid": [
				["wall","wall","wall","wall","wall","wall","wall","wall","wall"],
				["trap","floor","floor","trap","floor","floor","trap","floor","trap"],
				["wall","wall","wall","wall","wall","wall","wall","wall","wall"],
			]
		},
		{
			"id": "trap-room", "name": "Trap Room", "description": "A room with a trapped floor.", "category": "traps",
			"grid": [
				["wall","wall","wall","wall","wall","wall","wall"],
				["wall","trap","floor","trap","floor","trap","wall"],
				["wall","floor","floor","floor","floor","floor","wall"],
				["wall","trap","floor","trap","floor","trap","wall"],
				["wall","floor","floor","floor","floor","floor","wall"],
				["wall","trap","floor","trap","floor","trap","wall"],
				["wall","wall","wall","wall","wall","wall","wall"],
			]
		},
	]
