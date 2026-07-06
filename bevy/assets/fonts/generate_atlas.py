#!/usr/bin/env python3
# Generate atlas.png: 26 cells of 24x24 px laid out horizontally.
# Cell i = TileKind index i. Glyph rendered in its ANSI-16 fg on its bg.
# Order MUST match core::tile::TILE_TABLE (see bevy/crates/core/src/tile.rs).
# Run:  python3 generate_atlas.py   (requires Pillow)
import sys
from PIL import Image, ImageDraw, ImageFont

TILE = 24
N = 26
FONT_PATH = "NotoSansMono-Regular.ttf"

# (fg_rgb, bg_rgb) per TileKind index, same order as core::TILE_TABLE.
PALETTE = [
    ((200, 200, 200), (17, 17, 17)),  # 0  void
    ((180, 180, 180), (17, 17, 17)),  # 1  wall
    ((220, 220, 220), (30, 30, 30)),  # 2  floor
    ((160, 160, 160), (30, 30, 30)),  # 3  floorAlt
    ((120, 80, 40), (30, 30, 30)),    # 4  door
    ((200, 160, 80), (30, 30, 30)),   # 5  doorOpen
    ((80, 140, 220), (20, 30, 50)),   # 6  water
    ((40, 80, 180), (15, 25, 45)),    # 7  deepWater
    ((240, 90, 30), (60, 20, 10)),    # 8  lava
    ((60, 180, 70), (15, 35, 20)),    # 9  tree
    ((120, 200, 90), (15, 35, 20)),   # 10 grass
    ((170, 130, 80), (30, 30, 30)),   # 11 bridge
    ((230, 230, 230), (30, 30, 30)),  # 12 stairsDown
    ((230, 230, 230), (30, 30, 30)),  # 13 stairsUp
    ((200, 200, 80), (30, 30, 30)),   # 14 altar
    ((80, 200, 220), (20, 35, 45)),   # 15 fountain
    ((200, 200, 200), (30, 30, 30)),  # 16 grave
    ((220, 60, 60), (40, 15, 15)),    # 17 trap
    ((190, 190, 190), (30, 30, 30)),  # 18 pillar
    ((240, 210, 80), (40, 35, 10)),   # 19 treasure
    ((240, 180, 60), (40, 30, 10)),   # 20 shop
    ((160, 110, 70), (30, 30, 30)),   # 21 table
    ((240, 210, 80), (60, 30, 10)),   # 22 throne
    ((170, 170, 170), (30, 30, 30)),  # 23 cage
    ((220, 40, 40), (40, 10, 10)),    # 24 blood
    ((190, 190, 190), (30, 30, 30)),  # 25 bar
]

# TileKind index -> glyph char (must match core::TileKind::glyph()).
GLYPHS = [
    ' ', '#', '.', ',', '+', "'", '~', '≈', '~', '♣', '"', '═',
    '>', '<', '≡', '♦', '☠', '^', '0', '$', 'Σ', '▤', 'Ψ', '█', ';', '│',
]

assert len(PALETTE) == N and len(GLYPHS) == N, "table size mismatch"

img = Image.new("RGB", (N * TILE, TILE), (0, 0, 0))
draw = ImageDraw.Draw(img)
try:
    font = ImageFont.truetype(FONT_PATH, 18)
except Exception as e:
    sys.exit(f"could not load {FONT_PATH}: {e}")

for i, (glyph, (fg, bg)) in enumerate(zip(GLYPHS, PALETTE)):
    x0 = i * TILE
    draw.rectangle([x0, 0, x0 + TILE - 1, TILE - 1], fill=bg)
    try:
        draw.text((x0 + TILE // 2, TILE // 2 + 1), glyph, fill=fg, font=font, anchor="mm")
    except TypeError:
        bbox = draw.textbbox((0, 0), glyph, font=font)
        w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
        draw.text(
            (x0 + (TILE - w) // 2 - bbox[0], (TILE - h) // 2 - bbox[1]),
            glyph, fill=fg, font=font,
        )

out = "../textures/atlas.png"
img.save(out)
print(f"wrote {out} ({img.size[0]}x{img.size[1]})")
