#!/usr/bin/env bash
# Validate a clip before it enters or leaves Remotion.
#
# Usage: video-health.sh <file> [minimum-duration-seconds] [maximum-freeze-seconds]
# Requires the full ffmpeg/ffprobe distribution. Remotion's stripped binary
# intentionally omits filters such as freezedetect and is not sufficient.

set -euo pipefail

VIDEO_PATH="${1:-}"
MIN_DURATION="${2:-4}"
MAX_FREEZE="${3:-2}" # pass "off" to run decode/duration checks only

if [ -z "$VIDEO_PATH" ] || [ ! -s "$VIDEO_PATH" ]; then
  echo "video-health: missing or empty video: ${VIDEO_PATH:-<none>}" >&2
  exit 1
fi

for tool in ffmpeg ffprobe; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "video-health: required tool '$tool' is unavailable" >&2
    exit 1
  fi
done

DURATION=$(ffprobe -v error -show_entries format=duration \
  -of default=noprint_wrappers=1:nokey=1 "$VIDEO_PATH")

if ! awk -v duration="$DURATION" -v minimum="$MIN_DURATION" \
  'BEGIN { exit !(duration ~ /^[0-9]+([.][0-9]+)?$/ && duration >= minimum) }'; then
  echo "video-health: invalid/short duration '${DURATION:-missing}' (minimum ${MIN_DURATION}s)" >&2
  exit 1
fi

VIDEO_STREAM=$(ffprobe -v error -select_streams v:0 \
  -show_entries stream=codec_type -of default=noprint_wrappers=1:nokey=1 "$VIDEO_PATH")
if [ "$VIDEO_STREAM" != "video" ]; then
  echo "video-health: no decodable video stream" >&2
  exit 1
fi

# -xerror converts corrupt packets/timestamp decode warnings into a failure.
DECODE_LOG=$(mktemp)
FREEZE_LOG=$(mktemp)
trap 'rm -f "$DECODE_LOG" "$FREEZE_LOG"' EXIT
if ! ffmpeg -hide_banner -nostats -v error -xerror -i "$VIDEO_PATH" \
  -map 0:v:0 -an -c:v libx264 -f null - >"$DECODE_LOG" 2>&1; then
  echo "video-health: video does not decode cleanly" >&2
  sed -n '1,20p' "$DECODE_LOG" >&2
  exit 1
fi

# Catch an internal or trailing held frame. At -60 dB this detects genuinely
# duplicated frames, not an ordinary slow pan or calm water. freezedetect does
# not emit freeze_end at EOF, so the awk also measures an unmatched final run.
if [ "$MAX_FREEZE" = "off" ]; then
  printf 'video-health: ok duration=%ss decode=clean\n' "$DURATION"
  exit 0
fi

if ! ffmpeg -hide_banner -nostats -i "$VIDEO_PATH" \
  -vf "freezedetect=noise=-60dB:d=${MAX_FREEZE}" -an -c:v libx264 -f null - \
  >"$FREEZE_LOG" 2>&1; then
  echo "video-health: freeze analysis failed" >&2
  sed -n '1,20p' "$FREEZE_LOG" >&2
  exit 1
fi

MAX_OBSERVED_FREEZE=$(awk -v total="$DURATION" '
  /freeze_start:/ { start=$NF; open=1 }
  /freeze_duration:/ { if (($NF + 0) > max) max=$NF + 0 }
  /freeze_end:/ { open=0 }
  END {
    if (open && (total - start) > max) max=total - start
    printf "%.3f", max + 0
  }
' "$FREEZE_LOG")

if ! awk -v observed="$MAX_OBSERVED_FREEZE" -v maximum="$MAX_FREEZE" \
  'BEGIN { exit !(observed <= maximum) }'; then
  echo "video-health: frozen frame run ${MAX_OBSERVED_FREEZE}s exceeds ${MAX_FREEZE}s" >&2
  exit 1
fi

printf 'video-health: ok duration=%ss max_freeze=%ss\n' "$DURATION" "$MAX_OBSERVED_FREEZE"
