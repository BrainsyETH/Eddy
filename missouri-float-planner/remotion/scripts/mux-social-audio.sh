#!/usr/bin/env bash
# Keep the Read's narration/music mix; legacy social layouts use the theme loop.
set -euo pipefail
VIDEO="$1"
COMPOSITION="$2"
NORMALIZED="${VIDEO%.mp4}.normalized.mp4"
if [ "$COMPOSITION" = "social-eddy-read" ]; then
  npx remotion ffmpeg -y -i "$VIDEO" -map 0:v:0 -map 0:a:0 \
    -c copy -movflags +faststart "$NORMALIZED"
else
  DURATION=$(npx remotion ffprobe -v error -show_entries format=duration \
    -of default=noprint_wrappers=1:nokey=1 "$VIDEO")
  npx remotion ffmpeg -y -stream_loop -1 -i public/audio/background-music.wav -i "$VIDEO" \
    -c:v copy -c:a aac -b:a 192k -ar 48000 -ac 2 -t "$DURATION" -af volume=0.9 \
    -map 1:v:0 -map 0:a:0 -movflags +faststart "$NORMALIZED"
fi
mv "$NORMALIZED" "$VIDEO"
