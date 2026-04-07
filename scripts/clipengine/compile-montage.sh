#!/bin/bash
# compile-montage.sh — Compile multiple clips into a montage or highlights reel
# Downloads clips from URLs, normalizes them, applies crossfade transitions, and outputs a single video.
#
# Usage: compile-montage.sh <clips-json> <output-path> [--title "Title Text"] [--transition 0.5]
#
# clips-json format: [{"url": "https://...", "river": "Current River"}, ...]
#
# Ported from ClawsifiedInfo/workspace/scripts/compile-montage.sh + compile-highlights.sh

set -e

CLIPS_JSON="$1"
OUTPUT_PATH="$2"
TITLE=""
TRANSITION_DURATION="0.5"

# Parse optional flags
shift 2 || true
while [ $# -gt 0 ]; do
    case "$1" in
        --title) TITLE="$2"; shift 2 ;;
        --transition) TRANSITION_DURATION="$2"; shift 2 ;;
        *) shift ;;
    esac
done

if [ -z "$CLIPS_JSON" ] || [ -z "$OUTPUT_PATH" ]; then
    echo "Usage: $0 <clips-json-file> <output-path> [--title 'Title'] [--transition 0.5]"
    exit 1
fi

# Find font
if [ -f "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" ]; then
    FONT="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
elif [ -f "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf" ]; then
    FONT="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
else
    FONT=""
fi

BG_COLOR="0x0F2D35"
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎬 Compiling Montage"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Step 1: Parse clips JSON and download
echo "Step 1: Downloading clips..."
CLIP_COUNT=$(python3 -c "import json; clips=json.load(open('$CLIPS_JSON')); print(len(clips))")
echo "  Clips to process: $CLIP_COUNT"

if [ "$CLIP_COUNT" -lt 2 ]; then
    echo "❌ Need at least 2 clips for a montage"
    exit 1
fi

# Download and normalize each clip
NORMALIZED_LIST="$TEMP_DIR/normalized.txt"
> "$NORMALIZED_LIST"

python3 << PYEOF
import json, subprocess, os

clips = json.load(open("$CLIPS_JSON"))
temp_dir = "$TEMP_DIR"
norm_list = "$NORMALIZED_LIST"

for i, clip in enumerate(clips):
    url = clip.get("url", "")
    if not url:
        continue

    raw_path = os.path.join(temp_dir, f"raw_{i}.mp4")
    norm_path = os.path.join(temp_dir, f"norm_{i}.mp4")

    print(f"  Downloading clip {i+1}/{len(clips)}...")

    # Download clip
    result = subprocess.run(
        ["curl", "-sL", "-o", raw_path, url],
        capture_output=True, text=True
    )
    if result.returncode != 0 or not os.path.exists(raw_path):
        print(f"  ⚠️ Failed to download clip {i+1}, skipping")
        continue

    # Normalize to 1080x1920 @ 30fps
    print(f"  Normalizing clip {i+1}...")
    result = subprocess.run([
        "ffmpeg", "-y", "-i", raw_path,
        "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x0F2D35,fps=30",
        "-c:v", "libx264", "-preset", "fast", "-crf", "22",
        "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
        "-t", "15",  # Cap each clip at 15s
        "-movflags", "+faststart",
        norm_path
    ], capture_output=True, text=True)

    if result.returncode == 0 and os.path.exists(norm_path):
        with open(norm_list, "a") as f:
            f.write(f"file '{norm_path}'\n")
        print(f"  ✅ Clip {i+1} ready")
    else:
        print(f"  ⚠️ Failed to normalize clip {i+1}")
PYEOF

ACTUAL_COUNT=$(wc -l < "$NORMALIZED_LIST" | tr -d ' ')
echo ""
echo "  Clips ready: $ACTUAL_COUNT"

if [ "$ACTUAL_COUNT" -lt 2 ]; then
    echo "❌ Not enough clips were processed successfully"
    exit 1
fi

# Step 2: Create exit card (branded end screen)
echo ""
echo "Step 2: Creating exit card..."
EXIT_CARD="$TEMP_DIR/exit_card.mp4"

EXIT_FILTER="color=c=$BG_COLOR:s=1080x1920:d=3"
if [ -n "$FONT" ]; then
    EXIT_FILTER="$EXIT_FILTER,drawtext=text='eddy.guide':fontsize=48:fontcolor=white:x=(w-text_w)/2:y=(h/2)-60:fontfile=$FONT"
    if [ -n "$TITLE" ]; then
        ESCAPED_TITLE=$(echo "$TITLE" | sed "s/'/\\\\'/g" | sed 's/:/\\:/g')
        EXIT_FILTER="$EXIT_FILTER,drawtext=text='$ESCAPED_TITLE':fontsize=32:fontcolor=white@0.7:x=(w-text_w)/2:y=(h/2)+20:fontfile=$FONT"
    fi
fi

ffmpeg -y \
    -f lavfi -i "$EXIT_FILTER" \
    -f lavfi -i "anullsrc=r=48000:cl=stereo" \
    -c:v libx264 -preset fast -crf 20 \
    -c:a aac -b:a 128k \
    -t 3 \
    -shortest \
    "$EXIT_CARD" 2>/dev/null

echo "file '$EXIT_CARD'" >> "$NORMALIZED_LIST"
echo "  ✅ Exit card created"

# Step 3: Concatenate with crossfade transitions
echo ""
echo "Step 3: Stitching clips with transitions..."

mkdir -p "$(dirname "$OUTPUT_PATH")"

# Use concat demuxer (simplest reliable approach for multiple clips)
ffmpeg -y \
    -f concat -safe 0 -i "$NORMALIZED_LIST" \
    -c:v libx264 -preset fast -crf 20 \
    -c:a aac -b:a 128k \
    -movflags +faststart \
    "$OUTPUT_PATH" 2>&1 | grep -E "^(frame|Input|Output|Error)" || true

if [ ! -f "$OUTPUT_PATH" ]; then
    echo "❌ Compilation failed"
    exit 1
fi

# Step 4: Verify
echo ""
echo "Step 4: Verifying..."
OUT_SIZE=$(du -h "$OUTPUT_PATH" | awk '{print $1}')
OUT_DURATION=$(ffprobe -v error -show_entries format=duration \
    -of default=noprint_wrappers=1:nokey=1 "$OUTPUT_PATH" 2>/dev/null | cut -d. -f1)
OUT_DIMS=$(ffprobe -v error -select_streams v:0 \
    -show_entries stream=width,height \
    -of csv=s=x:p=0 "$OUTPUT_PATH" 2>/dev/null || echo "unknown")

echo "  File: $(basename "$OUTPUT_PATH")"
echo "  Size: $OUT_SIZE"
echo "  Duration: ${OUT_DURATION}s"
echo "  Format: $OUT_DIMS"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Montage compiled successfully!"
echo "  Path: $OUTPUT_PATH"
echo "  Clips: $ACTUAL_COUNT + exit card"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
