#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
CHECK="$ROOT/scripts/video-health.sh"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# Continuous motion passes.
ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "testsrc2=size=320x180:rate=30:duration=5" \
  -c:v libx264 -pix_fmt yuv420p "$TMP/moving.mp4"
"$CHECK" "$TMP/moving.mp4" 4 2

# A valid MP4 that holds exactly the same frame must fail the freeze gate.
ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "color=c=blue:size=320x180:rate=30:duration=5" \
  -c:v libx264 -pix_fmt yuv420p "$TMP/frozen.mp4"
if "$CHECK" "$TMP/frozen.mp4" 4 2; then
  echo "expected frozen video to fail" >&2
  exit 1
fi

# A truncated container must fail rather than passing because a file exists.
head -c 4096 "$TMP/moving.mp4" > "$TMP/truncated.mp4"
if "$CHECK" "$TMP/truncated.mp4" 4 2; then
  echo "expected truncated video to fail" >&2
  exit 1
fi

echo "video-health tests passed"
