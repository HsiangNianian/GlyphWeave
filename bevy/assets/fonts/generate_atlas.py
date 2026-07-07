#!/usr/bin/env python3
# Generate TWO tile atlases (26 cells x 24px = 624x24 each), one per theme.
# Cell i = TileKind index i (order MUST match core::tile::TILE_TABLE).
# Glyph rendered in the theme's fg on its bg. Both atlases share glyph order,
# so the app can swap textures at runtime for instant theme switching.
# Run:  python3 generate_atlas.py   (requires Pillow)
#
# Color sources: src/constants/themes.ts (ansi-16, cogmind).
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

# hex -> (r,g,b)
def h(s):
    s = s.lstrip('#')
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))

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
}

assert all(len(p) == N for p in THEMES.values()) and len(GLYPHS) == N, "table size mismatch"

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


def render(palette):
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


for name, palette in THEMES.items():
    out = HERE.parent / "textures" / f"atlas-{name}.png"
    render(palette).save(out)
    print(f"wrote {out}")
