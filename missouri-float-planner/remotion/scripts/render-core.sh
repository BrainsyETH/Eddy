#!/usr/bin/env bash
# Shared render core for render-reusable.yml: render a composition, normalize
# audio, and upload the MP4 to Vercel Blob. ONE source of truth, run two ways:
#   - baked into the render image (COPY . .) and run by the fast container job;
#   - run from a checkout by the runtime fallback job when the image is missing.
# Run from the Remotion project root (so `public/` and node_modules resolve).
#
# Env: COMPOSITION_ID, OUTPUT_FILENAME, BLOB_PREFIX, AUDIO_MODE (clip|social),
#      RENDER_MODE (bundle|entry), BLOB_READ_WRITE_TOKEN.
# Reads /tmp/props.json. Appends clip_url + audio_* to $GITHUB_OUTPUT.
set -euo pipefail

OUTFILE=/tmp/out.mp4

# Render: from the prebuilt bundle (container) or via the entry point (runtime).
if [ "$RENDER_MODE" = "bundle" ]; then
  npx remotion render build "$COMPOSITION_ID" "$OUTFILE" \
    --props=/tmp/props.json --codec=h264 --audio-codec=aac --enforce-audio-track --crf=23 --log=verbose
else
  npx remotion render --entry-point=src/index.ts --public-dir=./public \
    "$COMPOSITION_ID" "$OUTFILE" \
    --props=/tmp/props.json --codec=h264 --audio-codec=aac --enforce-audio-track --crf=23 --log=verbose
fi
echo "Rendered: $(stat -c%s "$OUTFILE") bytes"

# Audio: social muxes + validates the looped background music; clip keeps the
# clip's own track. Remotion ships a stripped ffmpeg without afade — rely on
# plain volume scaling; -stream_loop -1 covers a video longer than the source.
if [ "$AUDIO_MODE" = "social" ]; then
  AUDIO_SRC="public/audio/background-music.wav"
  DURATION=$(npx remotion ffprobe -v error -show_entries format=duration \
    -of default=noprint_wrappers=1:nokey=1 "$OUTFILE")
  echo "Video duration: ${DURATION}s"
  [ -n "$DURATION" ] || { echo "::error::Could not read video duration"; exit 1; }

  npx remotion ffmpeg -y -stream_loop -1 -i "$AUDIO_SRC" -i "$OUTFILE" \
    -c:v copy -c:a aac -b:a 192k -ar 48000 -ac 2 -t "$DURATION" -af "volume=0.9" \
    -map 1:v:0 -map 0:a:0 -movflags +faststart /tmp/normalized.mp4
  mv /tmp/normalized.mp4 "$OUTFILE"
  echo "Audio normalized: $(stat -c%s "$OUTFILE") bytes"

  # Bitrate gate — floor at 64 kb/s, high enough to fail silent placeholders.
  AUDIO_BPS=$(npx remotion ffprobe -v error -select_streams a:0 \
    -show_entries stream=bit_rate -of default=noprint_wrappers=1:nokey=1 "$OUTFILE")
  AUDIO_KIB=$(printf '%.0f' "$(echo "($AUDIO_BPS * $DURATION) / 8 / 1024" | bc -l)")
  MIN_AUDIO_BPS=64000
  echo "Audio bitrate: ${AUDIO_BPS} bps (~${AUDIO_KIB} KiB over ${DURATION}s, min ${MIN_AUDIO_BPS})"
  if [ -z "$AUDIO_BPS" ] || [ "$AUDIO_BPS" -lt "$MIN_AUDIO_BPS" ]; then
    echo "::error::Audio bitrate ${AUDIO_BPS:-0} bps is below ${MIN_AUDIO_BPS} bps floor"; exit 1
  fi

  # Silence probe — Remotion's ffmpeg allowlist has silencedetect.
  SILENCE_OUTPUT=$(npx remotion ffmpeg -hide_banner -nostats \
    -i "$OUTFILE" -af "silencedetect=noise=-40dB:d=0.1" -vn -f null - 2>&1 || true)
  TOTAL_SILENCE=$(echo "$SILENCE_OUTPUT" | awk '
    /silence_duration:/ { for (i=1;i<=NF;i++) if ($i=="silence_duration:") { sum+=$(i+1); next } }
    END { printf "%.3f", (sum+0) }')
  echo "Total silence: ${TOTAL_SILENCE}s of ${DURATION}s"
  MAX_SILENCE=$(echo "$DURATION * 0.8" | bc)
  if [ "$(echo "$TOTAL_SILENCE > $MAX_SILENCE" | bc)" = "1" ]; then
    echo "::error::Audio is >80% silent (${TOTAL_SILENCE}s / ${DURATION}s)"; exit 1
  fi

  {
    echo "audio_verified=true"
    echo "audio_kib=${AUDIO_KIB}"
    echo "total_silence_s=${TOTAL_SILENCE}"
  } >> "$GITHUB_OUTPUT"
  echo "Audio confirmed (${AUDIO_KIB}KiB, ${TOTAL_SILENCE}s silence)"
else
  npx remotion ffmpeg -y -i "$OUTFILE" \
    -c:v copy -c:a aac -b:a 192k -ar 48000 -ac 2 -movflags +faststart /tmp/final.mp4
  mv /tmp/final.mp4 "$OUTFILE"
  echo "Normalized (clip audio): $(stat -c%s "$OUTFILE") bytes"
  {
    echo "audio_verified=true"
    echo "audio_kib="
    echo "total_silence_s="
  } >> "$GITHUB_OUTPUT"
fi

# Upload to Vercel Blob.
DATE_PREFIX=$(date -u +%Y-%m-%d)
BLOB_PATH="${BLOB_PREFIX}/${DATE_PREFIX}/${OUTPUT_FILENAME}.mp4"
RESPONSE=$(curl -s -X PUT "https://blob.vercel-storage.com/${BLOB_PATH}" \
  -H "Authorization: Bearer ${BLOB_READ_WRITE_TOKEN}" \
  -H "x-content-type: video/mp4" \
  -H "x-cache-control-max-age: 31536000" \
  --data-binary "@${OUTFILE}")
CLIP_URL=$(echo "$RESPONSE" | jq -r '.url')
if [ "$CLIP_URL" = "null" ] || [ -z "$CLIP_URL" ]; then
  echo "::error::Upload failed: $RESPONSE"; exit 1
fi
echo "clip_url=${CLIP_URL}" >> "$GITHUB_OUTPUT"
echo "Uploaded: ${CLIP_URL}"
