#!/bin/bash
set -e

cd ~/eddy/missouri-float-planner/remotion

echo "🎬 Rendering with female voice + text overlays..."

# Merge voiceovers
cat public/audio/voiceover/01-intro.mp3 \
    public/audio/voiceover/02-home.mp3 \
    public/audio/voiceover/03-rivers.mp3 \
    public/audio/voiceover/04-river-detail.mp3 \
    public/audio/voiceover/05-float-planner.mp3 \
    public/audio/voiceover/06-gauges.mp3 \
    public/audio/voiceover/07-access-point.mp3 \
    public/audio/voiceover/08-share-plan.mp3 \
    public/audio/voiceover/09-ask-eddy.mp3 \
    public/audio/voiceover/10-outro.mp3 > /tmp/full-voice.mp3

DURATION=$(~/bin/ffmpeg -i /tmp/full-voice.mp3 2>&1 | grep Duration | awk '{print $2}' | tr -d , | awk -F: '{print ($1 * 3600) + ($2 * 60) + $3}')
PER_IMAGE=$(echo "$DURATION / 8" | bc -l)

echo "Total: $DURATION sec, per image: $PER_IMAGE sec"

# Render with text overlays on blank areas
~/bin/ffmpeg \
  -loop 1 -t $PER_IMAGE -i public/screenshots/home.png \
  -loop 1 -t $PER_IMAGE -i public/screenshots/rivers-list.png \
  -loop 1 -t $PER_IMAGE -i public/screenshots/river-detail.png \
  -loop 1 -t $PER_IMAGE -i public/screenshots/float-planner.png \
  -loop 1 -t $PER_IMAGE -i public/screenshots/gauges.png \
  -loop 1 -t $PER_IMAGE -i public/screenshots/access-point.png \
  -loop 1 -t $PER_IMAGE -i public/screenshots/share-plan.png \
  -loop 1 -t $PER_IMAGE -i public/screenshots/ask-eddy.png \
  -i /tmp/full-voice.mp3 \
  -filter_complex \
  "[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,fps=30,\
   drawtext=text='✓ Real-time conditions':fontsize=48:fontcolor=white:x=100:y=950:box=1:boxcolor=black@0.8:boxborderw=10[v0]; \
   [1:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,fps=30,\
   drawtext=text='✓ 8 Missouri rivers':fontsize=48:fontcolor=white:x=100:y=950:box=1:boxcolor=black@0.8:boxborderw=10[v1]; \
   [2:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,fps=30,\
   drawtext=text='✓ Interactive maps':fontsize=48:fontcolor=white:x=100:y=950:box=1:boxcolor=black@0.8:boxborderw=10[v2]; \
   [3:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,fps=30,\
   drawtext=text='✓ Auto-calculate trip times':fontsize=48:fontcolor=white:x=100:y=950:box=1:boxcolor=black@0.8:boxborderw=10[v3]; \
   [4:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,fps=30,\
   drawtext=text='✓ Live USGS data':fontsize=48:fontcolor=white:x=100:y=950:box=1:boxcolor=black@0.8:boxborderw=10[v4]; \
   [5:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,fps=30,\
   drawtext=text='✓ Facility details':fontsize=48:fontcolor=white:x=100:y=950:box=1:boxcolor=black@0.8:boxborderw=10[v5]; \
   [6:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,fps=30,\
   drawtext=text='✓ Share with friends':fontsize=48:fontcolor=white:x=100:y=950:box=1:boxcolor=black@0.8:boxborderw=10[v6]; \
   [7:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,fps=30,\
   drawtext=text='✓ AI-powered trip help':fontsize=48:fontcolor=white:x=100:y=950:box=1:boxcolor=black@0.8:boxborderw=10[v7]; \
   [v0][v1][v2][v3][v4][v5][v6][v7]concat=n=8:v=1:a=0[outv]" \
  -map "[outv]" -map 8:a \
  -c:v libx264 -preset fast -crf 23 \
  -c:a aac -b:a 192k \
  -shortest \
  out/eddy-tutorial-v2.mp4 \
  -y 2>&1 | grep "time=" | tail -3

rm /tmp/full-voice.mp3

echo ""
ls -lh out/eddy-tutorial-v2.mp4
echo "✅ Done!"
