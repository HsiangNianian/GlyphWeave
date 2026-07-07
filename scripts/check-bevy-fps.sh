#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
THRESHOLD="${GLYPHWEAVE_FPS_THRESHOLD:-150}"
WARMUP="${GLYPHWEAVE_FPS_WARMUP:-3}"
SAMPLE="${GLYPHWEAVE_FPS_SAMPLE:-5}"
MIN_TILES="${GLYPHWEAVE_FPS_MIN_TILES:-50000}"
MOTIONS="${GLYPHWEAVE_FPS_MOTIONS:-static pan zoom}"

shopt -s nullglob
maps=("$ROOT_DIR"/examples/*.gemap)
if [[ "${#maps[@]}" -eq 0 ]]; then
  echo "No .gemap files found under $ROOT_DIR/examples" >&2
  exit 2
fi

for map in "${maps[@]}"; do
  if ! jq empty "$map" >/dev/null 2>&1; then
    echo "==> FPS budget: $(basename "$map") skipped (invalid JSON)"
    continue
  fi

  tile_count="$(
    jq '((.tiles // {}) | length) + (((.layerTiles // {}) | to_entries | map(.value | length) | add) // 0)' "$map"
  )"
  if [[ "$tile_count" -lt "$MIN_TILES" ]]; then
    echo "==> FPS budget: $(basename "$map") skipped ($tile_count tiles < $MIN_TILES)"
    continue
  fi

  for motion in $MOTIONS; do
    echo "==> FPS budget: $(basename "$map") motion=$motion tiles=$tile_count"
    (
      cd "$ROOT_DIR/bevy"
      cargo run --release -p glyphweave-app --bin glyphweave -- \
        --map "$map" \
        --perf-check \
        --perf-motion "$motion" \
        --perf-threshold "$THRESHOLD" \
        --perf-warmup "$WARMUP" \
        --perf-sample "$SAMPLE"
    )
  done
done
