#!/usr/bin/env python3
# Generate tile atlases (26 cells x 24px = 624x24 each), one per theme.
# Cell i = TileKind index i (order MUST match core::tile::TILE_TABLE).
# ANSI/Cogmind render glyphs in the theme's fg on its bg. Fortress Pixel
# renders original pixel-art tiles. All atlases share TileKind order, so the
# app can swap textures at runtime for instant theme switching.
# Run:  python3 generate_atlas.py   (requires Pillow)
#
# Color sources: src/constants/themes.ts.
import os
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

TILE = 24
N = 26
HERE = Path(__file__).resolve().parent

# NotoSansMono-Regular is bundled, but it renders several roguelike symbols
# as tofu boxes on macOS. Prefer symbol-complete monospace fonts and reject
# any candidate that renders required symbols as the missing-glyph box.
FONT_SIZE = 18
FONT_PATHS = [
    os.environ.get("GLYPHWEAVE_ATLAS_FONT"),
    "/System/Library/Fonts/Menlo.ttc",
    "/Library/Fonts/Menlo.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    "/usr/share/fonts/dejavu-sans-mono-fonts/DejaVuSansMono.ttf",
    HERE / "NotoSansMono-Regular.ttf",
]
REQUIRED_SYMBOLS = ["♣", "♦", "☠"]

# TileKind index -> glyph char (must match core::TileKind::glyph()).
GLYPHS = [
    ' ', '#', '.', ',', '+', "'", '~', '≈', '~', '♣', '"', '═',
    '>', '<', '≡', '♦', '☠', '^', '0', '$', 'Σ', '▤', 'Ψ', '█', ';', '│',
]
TILE_IDS = [
    "void", "wall", "floor", "floorAlt", "door", "doorOpen", "water", "deepWater",
    "lava", "tree", "grass", "bridge", "stairsDown", "stairsUp", "altar",
    "fountain", "grave", "trap", "pillar", "treasure", "shop", "table", "throne",
    "cage", "blood", "bar",
]
PIXEL_THEMES = {"fortress-pixel"}

# hex -> (r,g,b)
def h(s):
    s = s.lstrip('#')
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))


def mix(a, b, t):
    return tuple(round(a[i] * (1 - t) + b[i] * t) for i in range(3))


def rr(draw, x0, x, y, w, hh, color):
    draw.rectangle([x0 + x, y, x0 + x + w - 1, y + hh - 1], fill=color)


def draw_pixel_tile(draw, x0, tile_id, fg, bg):
    black = (0, 0, 0)
    white = (255, 255, 255)
    dark = mix(bg, black, 0.35)
    light = mix(fg, white, 0.2)
    warm = mix(fg, h("#f0c27a"), 0.35)
    draw.rectangle([x0, 0, x0 + TILE - 1, TILE - 1], fill=bg)

    if tile_id == "void":
        return
    if tile_id == "wall":
        rr(draw, x0, 1, 2, 22, 4, mix(fg, bg, 0.35))
        rr(draw, x0, 2, 8, 8, 5, mix(fg, bg, 0.2))
        rr(draw, x0, 12, 8, 10, 5, mix(fg, bg, 0.28))
        rr(draw, x0, 4, 15, 17, 5, mix(fg, bg, 0.18))
        rr(draw, x0, 11, 4, 2, 16, dark)
    elif tile_id == "floor":
        rr(draw, x0, 4, 6, 4, 3, fg)
        rr(draw, x0, 13, 9, 5, 2, mix(fg, bg, 0.5))
        rr(draw, x0, 7, 16, 8, 2, dark)
    elif tile_id == "floorAlt":
        rr(draw, x0, 2, 4, 8, 3, dark)
        rr(draw, x0, 12, 12, 9, 3, fg)
        rr(draw, x0, 5, 18, 4, 2, mix(fg, bg, 0.45))
    elif tile_id == "door":
        rr(draw, x0, 5, 3, 5, 18, fg)
        rr(draw, x0, 11, 3, 5, 18, warm)
        rr(draw, x0, 17, 3, 3, 18, mix(fg, bg, 0.35))
        rr(draw, x0, 16, 11, 3, 3, h("#e6c45a"))
    elif tile_id == "doorOpen":
        rr(draw, x0, 4, 3, 10, 18, dark)
        rr(draw, x0, 15, 3, 4, 18, fg)
    elif tile_id == "water":
        rr(draw, x0, 2, 6, 8, 2, light)
        rr(draw, x0, 10, 11, 11, 2, fg)
        rr(draw, x0, 4, 17, 9, 2, mix(fg, bg, 0.4))
    elif tile_id == "deepWater":
        rr(draw, x0, 3, 7, 7, 2, fg)
        rr(draw, x0, 12, 15, 8, 2, mix(fg, bg, 0.35))
    elif tile_id == "lava":
        rr(draw, x0, 2, 7, 9, 3, h("#ffcf5c"))
        rr(draw, x0, 9, 12, 13, 3, h("#ff6d2d"))
        rr(draw, x0, 5, 17, 6, 2, h("#ffd27a"))
    elif tile_id == "tree":
        rr(draw, x0, 10, 11, 4, 10, h("#6b4529"))
        rr(draw, x0, 5, 4, 14, 9, fg)
        rr(draw, x0, 3, 8, 18, 7, mix(fg, bg, 0.2))
    elif tile_id == "grass":
        rr(draw, x0, 4, 8, 2, 8, fg)
        rr(draw, x0, 10, 6, 2, 11, light)
        rr(draw, x0, 17, 9, 2, 7, mix(fg, bg, 0.25))
    elif tile_id == "bridge":
        rr(draw, x0, 2, 5, 20, 4, fg)
        rr(draw, x0, 2, 11, 20, 4, warm)
        rr(draw, x0, 2, 17, 20, 3, mix(fg, bg, 0.4))
        rr(draw, x0, 10, 4, 2, 17, dark)
    elif tile_id == "stairsDown":
        rr(draw, x0, 6, 6, 13, 3, fg)
        rr(draw, x0, 8, 11, 10, 3, mix(fg, bg, 0.4))
        rr(draw, x0, 10, 16, 7, 3, dark)
    elif tile_id == "stairsUp":
        rr(draw, x0, 10, 5, 7, 3, light)
        rr(draw, x0, 8, 10, 10, 3, fg)
        rr(draw, x0, 6, 15, 13, 3, mix(fg, bg, 0.35))
    elif tile_id == "altar":
        rr(draw, x0, 5, 12, 14, 6, fg)
        rr(draw, x0, 7, 8, 10, 4, light)
        rr(draw, x0, 11, 5, 2, 4, h("#d6c6ff"))
    elif tile_id == "fountain":
        rr(draw, x0, 5, 13, 14, 5, fg)
        rr(draw, x0, 8, 8, 8, 6, h("#7fd4e8"))
        rr(draw, x0, 11, 5, 2, 5, light)
    elif tile_id == "grave":
        rr(draw, x0, 8, 5, 8, 13, fg)
        rr(draw, x0, 9, 3, 6, 3, light)
        rr(draw, x0, 11, 7, 2, 7, dark)
    elif tile_id == "trap":
        rr(draw, x0, 5, 15, 14, 2, fg)
        rr(draw, x0, 7, 9, 3, 6, h("#d45b4f"))
        rr(draw, x0, 14, 8, 3, 7, h("#d45b4f"))
    elif tile_id == "pillar":
        rr(draw, x0, 6, 3, 12, 4, light)
        rr(draw, x0, 8, 7, 8, 12, fg)
        rr(draw, x0, 5, 19, 14, 3, dark)
    elif tile_id == "treasure":
        rr(draw, x0, 5, 10, 14, 8, h("#8f4e24"))
        rr(draw, x0, 6, 7, 12, 4, h("#d59d3a"))
        rr(draw, x0, 10, 11, 4, 3, h("#ffe07a"))
    elif tile_id == "shop":
        rr(draw, x0, 4, 13, 16, 5, warm)
        rr(draw, x0, 4, 6, 16, 5, h("#cf6d4a"))
        rr(draw, x0, 9, 3, 6, 3, h("#f0c85a"))
    elif tile_id == "table":
        rr(draw, x0, 4, 8, 16, 7, fg)
        rr(draw, x0, 6, 15, 3, 5, dark)
        rr(draw, x0, 16, 15, 3, 5, dark)
    elif tile_id == "throne":
        rr(draw, x0, 7, 4, 10, 11, h("#b89239"))
        rr(draw, x0, 5, 14, 14, 5, fg)
        rr(draw, x0, 11, 7, 2, 3, h("#d65dff"))
    elif tile_id == "cage":
        rr(draw, x0, 4, 4, 16, 2, fg)
        rr(draw, x0, 4, 18, 16, 2, fg)
        rr(draw, x0, 6, 5, 2, 14, fg)
        rr(draw, x0, 12, 5, 2, 14, fg)
        rr(draw, x0, 18, 5, 2, 14, fg)
    elif tile_id == "blood":
        rr(draw, x0, 6, 9, 7, 5, fg)
        rr(draw, x0, 13, 12, 5, 4, mix(fg, black, 0.15))
        rr(draw, x0, 9, 17, 3, 2, fg)
    elif tile_id == "bar":
        rr(draw, x0, 5, 3, 2, 18, fg)
        rr(draw, x0, 11, 3, 2, 18, mix(fg, bg, 0.3))
        rr(draw, x0, 17, 3, 2, 18, fg)
        rr(draw, x0, 4, 11, 16, 2, dark)
    else:
        rr(draw, x0, 7, 7, 10, 10, fg)


# Each theme: list of (fg_hex, bg_hex) in TileKind::ALL order.
THEMES = {
    "ansi-16": [
        ("#000000", "#000000"),  # void
        ("#a0a0a0", "#000000"),  # wall
        ("#808080", "#1a1a1a"),  # floor
        ("#606060", "#151515"),  # floorAlt
        ("#ffff00", "#1a1a00"),  # door
        ("#c0c000", "#151500"),  # doorOpen
        ("#0000ff", "#00001a"),  # water
        ("#0000aa", "#00000a"),  # deepWater
        ("#ff5500", "#1a0500"),  # lava
        ("#00ff00", "#001a00"),  # tree
        ("#00aa00", "#000a00"),  # grass
        ("#8b7355", "#1a1410"),  # bridge
        ("#ffffff", "#1a1a1a"),  # stairsDown
        ("#ffffff", "#1a1a1a"),  # stairsUp
        ("#ff00ff", "#1a001a"),  # altar
        ("#00ffff", "#001a1a"),  # fountain
        ("#808080", "#0a0a0a"),  # grave
        ("#ff0000", "#1a0000"),  # trap
        ("#a0a0a0", "#050505"),  # pillar
        ("#ffff00", "#1a1a00"),  # treasure
        ("#ffff55", "#1a1a0a"),  # shop
        ("#8b4513", "#1a0a00"),  # table
        ("#ffd700", "#1a1400"),  # throne
        ("#c0c0c0", "#050505"),  # cage
        ("#aa0000", "#0a0000"),  # blood
        ("#8b7355", "#000000"),  # bar
    ],
    "cogmind": [
        ("#000000", "#000000"),  # void
        ("#708090", "#0a0a0a"),  # wall
        ("#404050", "#121216"),  # floor
        ("#353545", "#0e0e12"),  # floorAlt
        ("#daa520", "#141408"),  # door
        ("#b8960e", "#101006"),  # doorOpen
        ("#4488cc", "#06061a"),  # water
        ("#3366aa", "#040410"),  # deepWater
        ("#ff4400", "#1a0600"),  # lava
        ("#33aa55", "#0a140a"),  # tree
        ("#227744", "#060e06"),  # grass
        ("#6b5b45", "#141008"),  # bridge
        ("#88ccff", "#0a1420"),  # stairsDown
        ("#88ccff", "#0a1420"),  # stairsUp
        ("#cc66cc", "#140a14"),  # altar
        ("#66cccc", "#0a1414"),  # fountain
        ("#556655", "#080808"),  # grave
        ("#cc4444", "#140808"),  # trap
        ("#606070", "#060606"),  # pillar
        ("#ddbb33", "#141006"),  # treasure
        ("#ccaa44", "#141008"),  # shop
        ("#6b3a1a", "#140800"),  # table
        ("#ccaa00", "#141000"),  # throne
        ("#8888aa", "#040408"),  # cage
        ("#882222", "#080000"),  # blood
        ("#6b5b45", "#000000"),  # bar
    ],
    "fortress-pixel": [
        ("#050403", "#050403"),  # void
        ("#9b9587", "#34322f"),  # wall
        ("#7f745f", "#443d32"),  # floor
        ("#6f624e", "#393226"),  # floorAlt
        ("#b8793e", "#402515"),  # door
        ("#8a5a34", "#20150d"),  # doorOpen
        ("#5ca7c8", "#173d55"),  # water
        ("#2f6b93", "#0b2337"),  # deepWater
        ("#ffb04a", "#5a1a0e"),  # lava
        ("#5f9d50", "#23351e"),  # tree
        ("#769b47", "#2f3d23"),  # grass
        ("#a16f42", "#3f2a18"),  # bridge
        ("#b4aa92", "#302a22"),  # stairsDown
        ("#d0c4a6", "#3b3327"),  # stairsUp
        ("#b7adc8", "#342f3c"),  # altar
        ("#79b7c4", "#263f43"),  # fountain
        ("#8f958c", "#2d302b"),  # grave
        ("#c55345", "#3a211d"),  # trap
        ("#b0aa9a", "#3a3834"),  # pillar
        ("#f0c85a", "#4a3514"),  # treasure
        ("#d4a04e", "#4a321b"),  # shop
        ("#9b6238", "#322012"),  # table
        ("#d3b15f", "#4b3516"),  # throne
        ("#9aa0a1", "#242525"),  # cage
        ("#9c2f2d", "#2c1210"),  # blood
        ("#8c8578", "#151412"),  # bar
    ],
}

assert (
    all(len(p) == N for p in THEMES.values())
    and len(GLYPHS) == N
    and len(TILE_IDS) == N
), "table size mismatch"

def glyph_mask(font, glyph):
    img = Image.new("L", (TILE, TILE), 0)
    draw = ImageDraw.Draw(img)
    try:
        draw.text((TILE // 2, TILE // 2 + 1), glyph, fill=255, font=font, anchor="mm")
    except TypeError:
        bbox = draw.textbbox((0, 0), glyph, font=font)
        w, hh = bbox[2] - bbox[0], bbox[3] - bbox[1]
        draw.text(
            ((TILE - w) // 2 - bbox[0], (TILE - hh) // 2 - bbox[1]),
            glyph,
            fill=255,
            font=font,
        )
    return img.tobytes()


def font_covers_required_symbols(font):
    missing = glyph_mask(font, "\uFFFF")
    return all(glyph_mask(font, glyph) != missing for glyph in REQUIRED_SYMBOLS)


def load_font():
    errors = []
    for font_path in FONT_PATHS:
        if not font_path:
            continue
        font_path = Path(font_path)
        if not font_path.exists():
            continue
        try:
            candidate = ImageFont.truetype(str(font_path), FONT_SIZE)
        except Exception as e:
            errors.append(f"{font_path}: {e}")
            continue
        if not font_covers_required_symbols(candidate):
            errors.append(f"{font_path}: missing required tile symbols")
            continue
        return candidate, font_path
    details = "\n".join(errors) if errors else "no candidate font files found"
    sys.exit(f"could not load an atlas font:\n{details}")


font, font_path = load_font()
print(f"using atlas font {font_path}")


def render_glyph_atlas(palette):
    img = Image.new("RGB", (N * TILE, TILE), (0, 0, 0))
    draw = ImageDraw.Draw(img)
    for i, (glyph, (fg_hex, bg_hex)) in enumerate(zip(GLYPHS, palette)):
        fg, bg = h(fg_hex), h(bg_hex)
        x0 = i * TILE
        draw.rectangle([x0, 0, x0 + TILE - 1, TILE - 1], fill=bg)
        try:
            draw.text((x0 + TILE // 2, TILE // 2 + 1), glyph, fill=fg, font=font, anchor="mm")
        except TypeError:
            bbox = draw.textbbox((0, 0), glyph, font=font)
            w, hh = bbox[2] - bbox[0], bbox[3] - bbox[1]
            draw.text(
                (x0 + (TILE - w) // 2 - bbox[0], (TILE - hh) // 2 - bbox[1]),
                glyph, fill=fg, font=font,
            )
    return img


def render_pixel_atlas(palette):
    img = Image.new("RGB", (N * TILE, TILE), (0, 0, 0))
    draw = ImageDraw.Draw(img)
    for i, (tile_id, (fg_hex, bg_hex)) in enumerate(zip(TILE_IDS, palette)):
        draw_pixel_tile(draw, i * TILE, tile_id, h(fg_hex), h(bg_hex))
    return img


for name, palette in THEMES.items():
    out = HERE.parent / "textures" / f"atlas-{name}.png"
    if name in PIXEL_THEMES:
        render_pixel_atlas(palette).save(out)
    else:
        render_glyph_atlas(palette).save(out)
    print(f"wrote {out}")
