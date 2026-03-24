#!/bin/bash
set -e

echo "🚀 Ultra-fast render (30 seconds)..."

cd ~/eddy/missouri-float-planner/remotion

# Create a 1-minute video with screenshots
# Each image shown for 7.5 seconds (8 images = 60 seconds)
ffmpeg \
  -loop 1 -t 7.5 -i public/screenshots/home.png \
  -loop 1 -t 7.5 -i public/screenshots/rivers-list.png \
  -loop 1 -t 7.5 -i public/screenshots/river-detail.png \
  -loop 1 -t 7.5 -i public/screenshots/float-planner.png \
  -loop 1 -t 7.5 -i public/screenshots/gauges.png \
  -loop 1 -t 7.5 -i public/screenshots/access-point.png \
  -loop 1 -t 7.5 -i public/screenshots/share-plan.png \
  -loop 1 -t 7.5 -i public/screenshots/ask-eddy.png \
  -i public/audio/background-music.mp3 \
  -filter_complex \
  "[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,fps=30[v0]; \
   [1:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,fps=30[v1]; \
   [2:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,fps=30[v2]; \
   [3:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,fps=30[v3]; \
   [4:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,fps=30[v4]; \
   [5:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,fps=30[v5]; \
   [6:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,fps=30[v6]; \
   [7:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,fps=30[v7]; \
   [v0][v1][v2][v3][v4][v5][v6][v7]concat=n=8:v=1:a=0[outv]" \
  -map "[outv]" -map 8:a \
  -c:v libx264 -preset ultrafast -crf 23 \
  -c:a aac -b:a 192k \
  -t 60 \
  out/eddy-tutorial-real.mp4 \
  -y 2>&1 | grep -E "(frame=|time=|size=)" | tail -5

echo ""
ls -lh out/eddy-tutorial-real.mp4
echo "✅ Done in $(date)"
