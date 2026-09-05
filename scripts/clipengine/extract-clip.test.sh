#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
EXTRACT="$ROOT/scripts/clipengine/extract-clip.sh"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "testsrc2=size=320x180:rate=24:duration=8" \
  -f lavfi -i "sine=frequency=440:sample_rate=48000:duration=8" \
  -c:v libx264 -pix_fmt yuv420p -c:a aac "$TMP/source.mp4"

mkdir -p "$TMP/bin"
export MOCK_SOURCE="$TMP/source.mp4"
export MOCK_COUNTER="$TMP/counter"

# yt-dlp is the only network boundary. The mock obeys its output template and
# can emulate the real failure mode: a non-zero section download that leaves a
# partial file behind, followed by a successful full-download fallback.
cat > "$TMP/bin/yt-dlp" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
output=""
windowed=false
skip=false
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output) output="$2"; shift 2 ;;
    --download-sections) windowed=true; shift 2 ;;
    --skip-download) skip=true; shift ;;
    *) shift ;;
  esac
done
[ "$skip" = "false" ] || exit 0
target=${output//%(ext)s/mp4}
mkdir -p "$(dirname "$target")"
if [ "${MOCK_FAIL_WINDOW:-0}" = "1" ] && [ "$windowed" = "true" ]; then
  head -c 4096 "$MOCK_SOURCE" > "$target"
  exit 1
fi
cp "$MOCK_SOURCE" "$target"
MOCK
chmod +x "$TMP/bin/yt-dlp"

PATH="$TMP/bin:$PATH" "$EXTRACT" mock://video 0 5 "$TMP/normal.mp4"
"$ROOT/missouri-float-planner/remotion/scripts/video-health.sh" "$TMP/normal.mp4" 4 2

MOCK_FAIL_WINDOW=1 PATH="$TMP/bin:$PATH" \
  "$EXTRACT" mock://video 0 5 "$TMP/fallback.mp4" >"$TMP/fallback.log"
grep -q "falling back to full download" "$TMP/fallback.log"
"$ROOT/missouri-float-planner/remotion/scripts/video-health.sh" "$TMP/fallback.mp4" 4 2

FPS=$(ffprobe -v error -select_streams v:0 -show_entries stream=avg_frame_rate \
  -of default=noprint_wrappers=1:nokey=1 "$TMP/fallback.mp4")
[ "$FPS" = "30/1" ] || { echo "expected normalized 30 fps, got $FPS" >&2; exit 1; }

echo "extract-clip tests passed"
