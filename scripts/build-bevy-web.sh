#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BEVY_DIR="$ROOT_DIR/bevy"
OUT_ARG="${1:-bevy/web/dist}"

if [[ "$OUT_ARG" = /* || "$OUT_ARG" == "." || "$OUT_ARG" == ".." || "$OUT_ARG" == ../* || "$OUT_ARG" == */../* || "$OUT_ARG" == */.. ]]; then
  echo "error: output directory must be a project-relative child path" >&2
  exit 1
fi
OUT_DIR="$ROOT_DIR/$OUT_ARG"

if ! rustup target list --installed | grep -qx 'wasm32-unknown-unknown'; then
  echo "error: install the WASM target with: rustup target add wasm32-unknown-unknown" >&2
  exit 1
fi

if ! command -v wasm-bindgen >/dev/null 2>&1; then
  echo "error: install wasm-bindgen CLI with:" >&2
  echo "  cargo install wasm-bindgen-cli --version 0.2.126 --locked" >&2
  exit 1
fi

if ! command -v wasm-opt >/dev/null 2>&1; then
  echo "error: install Binaryen so the bundle fits static hosting limits:" >&2
  echo "  brew install binaryen" >&2
  exit 1
fi

echo "Building GlyphWeave for browser WASM..."
(
  cd "$BEVY_DIR"
  cargo build \
    --profile wasm-release \
    --target wasm32-unknown-unknown \
    --bin glyphweave
)

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR/pkg"

wasm-bindgen \
  --target web \
  --no-typescript \
  --out-dir "$OUT_DIR/pkg" \
  --out-name glyphweave \
  "$BEVY_DIR/target/wasm32-unknown-unknown/wasm-release/glyphweave.wasm"

WASM_FILE="$OUT_DIR/pkg/glyphweave_bg.wasm"
OPTIMIZED_WASM_FILE="$OUT_DIR/pkg/glyphweave_bg.optimized.wasm"

wasm-opt \
  -Oz \
  --enable-bulk-memory \
  --enable-bulk-memory-opt \
  --enable-nontrapping-float-to-int \
  --output "$OPTIMIZED_WASM_FILE" \
  "$WASM_FILE"
mv "$OPTIMIZED_WASM_FILE" "$WASM_FILE"

cp "$BEVY_DIR/web/index.html" "$OUT_DIR/index.html"
cp -R "$BEVY_DIR/assets" "$OUT_DIR/assets"

WASM_BYTES="$(wc -c < "$WASM_FILE" | tr -d ' ')"
CLOUDFLARE_STATIC_ASSET_LIMIT_BYTES=$((25 * 1024 * 1024))
if (( WASM_BYTES > CLOUDFLARE_STATIC_ASSET_LIMIT_BYTES )); then
  echo "error: optimized WASM is $WASM_BYTES bytes; Cloudflare allows 25 MiB per static asset" >&2
  exit 1
fi

echo
echo "Browser bundle: $OUT_DIR"
du -h "$WASM_FILE" "$OUT_DIR/pkg/glyphweave.js"
echo "Cloudflare size check: $WASM_BYTES / $CLOUDFLARE_STATIC_ASSET_LIMIT_BYTES bytes"
