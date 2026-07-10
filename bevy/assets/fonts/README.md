# Bevy fonts

- `NotoSansMono-Regular.ttf` supplies the tile atlas glyphs.
- `NotoSansCJKsc-GlyphWeave.otf` is a small web fallback containing the
  Chinese glyphs used by the built-in scenarios and rule-based commands.
  It is derived from
  [Noto Sans CJK SC](https://github.com/notofonts/noto-cjk) under the SIL
  Open Font License in `OFL-NotoSansCJK.txt`.

The CJK subset can be regenerated from `NotoSansCJKsc-Regular.otf` with:

```bash
uv run --with fonttools pyftsubset NotoSansCJKsc-Regular.otf \
  --output-file=NotoSansCJKsc-GlyphWeave.otf \
  --text='仓库储物核心中心撤离安全区取消搬运砍树挖探索门地板造墙大片小片这附近掉破堤之夜低粮双河夹击教学关旧坝裂前修好防线资源保护位于工程规划两侧水源据点：。' \
  --layout-features='*' --glyph-names --symbol-cmap --legacy-cmap \
  --notdef-glyph --notdef-outline --recommended-glyphs \
  --name-IDs='*' --name-legacy --name-languages='*'
```

When adding new built-in Chinese UI text or command keywords, add its glyphs
to the subset before rebuilding the browser bundle.
