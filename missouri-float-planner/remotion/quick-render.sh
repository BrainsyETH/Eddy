#!/bin/bash
set -e

cd ~/eddy/missouri-float-planner/remotion

# Concatenate all voiceovers
echo "Merging voiceovers..."
sox public/audio/voiceover/*.mp3 /tmp/full-voiceover.mp3 2>/dev/null || {
  echo "Installing sox..."
  brew install sox
  sox public/audio/voiceover/*.mp3 /tmp/full-voiceover.mp3
}

# Get duration
DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 /tmp/full-voiceover.mp3)
echo "Total duration: $DURATION seconds"

# Create video from screenshots (10 seconds each)
IMAGES=(
  public/screenshots/home.png
  public/screenshots/rivers-list.png
  public/screenshots/river-detail.png
  public/screenshots/float-planner.png
  public/screenshots/gauges.png
  public/screenshots/access-point.png
  public/screenshots/share-plan.png
  public/screenshots/ask-eddy.png
)

# Create concat file
echo "Creating video segments..."
for img in "${IMAGES[@]}"; do
  echo "file '$img'" >> /tmp/images.txt
  echo "duration 10" >> /tmp/images.txt
done
# Repeat last image
echo "file '${IMAGES[-1]}'" >> /tmp/images.txt

# Render video
echo "Rendering video..."
ffmpeg -f concat -safe 0 -i /tmp/images.txt \
  -i /tmp/full-voiceover.mp3 \
  -vf "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=30" \
  -c:v libx264 -preset fast -crf 23 \
  -c:a aac -b:a 192k \
  -shortest \
  out/eddy-tutorial-landscape-fast.mp4 \
  -y 2>&1 | tail -20

rm -f /tmp/images.txt /tmp/full-voiceover.mp3

echo "✅ Done: out/eddy-tutorial-landscape-fast.mp4"
