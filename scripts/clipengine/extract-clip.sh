#!/bin/bash
# extract-clip.sh — Download and extract a clip from a YouTube video
# Uses yt-dlp for download and ffmpeg for clip extraction.
#
# Usage: ./extract-clip.sh <youtube-url> <start-secs> <duration-secs> <output-path> [--transcript]
#
# Ported from ClawsifiedInfo/workspace/scripts/youtube-to-reel.sh

set -e

YOUTUBE_URL="$1"
START_SECS="$2"
DURATION_SECS="${3:-13}"
OUTPUT_PATH="$4"
TRANSCRIPT_FLAG="${5:-}"

if [ -z "$YOUTUBE_URL" ] || [ -z "$START_SECS" ] || [ -z "$OUTPUT_PATH" ]; then
    echo "Usage: $0 <youtube-url> <start-secs> <duration-secs> <output-path> [--transcript]"
    exit 1
fi

# Authenticated cookies (Netscape format) let yt-dlp past YouTube's bot check
# on shared CI IPs. Provided via YOUTUBE_COOKIES_FILE by the workflow.
COOKIE_ARGS=()
if [ -n "${YOUTUBE_COOKIES_FILE:-}" ] && [ -f "$YOUTUBE_COOKIES_FILE" ]; then
    COOKIE_ARGS=(--cookies "$YOUTUBE_COOKIES_FILE")
fi

TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎬 Extracting YouTube Clip"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "URL: $YOUTUBE_URL"
echo "Start: ${START_SECS}s"
echo "Duration: ${DURATION_SECS}s"
echo ""

# Step 1: Download ONLY the clip window, not the whole video.
# Downloading a full 1080p source (often 1+ GB for a long video) just to slice
# out ~15s is the wrong process — yt-dlp's --download-sections fetches only the
# byte range we need (a few MB). We pad the window by SECTION_PAD seconds on each
# side so keyframe snapping can't clip the edges, then seek by that pad in step 3.
# Falls back to a full download if the section grab yields nothing.
SECTION_PAD=3
DL_START=$(awk "BEGIN{s=$START_SECS-$SECTION_PAD; if(s<0)s=0; print s}")
DL_END=$(awk "BEGIN{print $START_SECS+$DURATION_SECS+$SECTION_PAD}")
SEEK_OFFSET=$(awk "BEGIN{print $START_SECS-$DL_START}")

echo "Step 1: Downloading clip window ${DL_START}s–${DL_END}s (not full video)..."
yt-dlp \
    "${COOKIE_ARGS[@]}" \
    --retries 5 \
    --download-sections "*${DL_START}-${DL_END}" \
    --downloader ffmpeg \
    --format "bestvideo[height<=1080]+bestaudio/best[height<=1080]" \
    --merge-output-format mp4 \
    --output "$TEMP_DIR/source.%(ext)s" \
    --no-playlist \
    --quiet \
    "$YOUTUBE_URL" || true

SOURCE_VIDEO=$(find "$TEMP_DIR" -name "source.*" -type f | head -1)

# Fallback: if the windowed download produced nothing, grab the full video and
# seek into it the old way (SEEK_OFFSET becomes the absolute start).
if [ -z "$SOURCE_VIDEO" ] || [ ! -f "$SOURCE_VIDEO" ]; then
    echo "  ⚠️  windowed download empty — falling back to full download"
    yt-dlp \
        "${COOKIE_ARGS[@]}" \
        --retries 5 \
        --format "bestvideo[height<=1080]+bestaudio/best[height<=1080]" \
        --merge-output-format mp4 \
        --output "$TEMP_DIR/source.%(ext)s" \
        --no-playlist \
        --quiet \
        "$YOUTUBE_URL"
    SOURCE_VIDEO=$(find "$TEMP_DIR" -name "source.*" -type f | head -1)
    SEEK_OFFSET="$START_SECS"
fi

if [ -z "$SOURCE_VIDEO" ] || [ ! -f "$SOURCE_VIDEO" ]; then
    echo "❌ Download failed"
    exit 1
fi
echo "  ✅ Downloaded: $(du -h "$SOURCE_VIDEO" | awk '{print $1}')"

# Step 2: Download transcript if requested
if [ "$TRANSCRIPT_FLAG" = "--transcript" ]; then
    echo ""
    echo "Step 2: Fetching transcript..."
    yt-dlp \
        "${COOKIE_ARGS[@]}" \
        --write-auto-subs \
        --sub-lang en \
        --sub-format vtt \
        --skip-download \
        --output "$TEMP_DIR/transcript" \
        --quiet \
        "$YOUTUBE_URL" 2>/dev/null || true

    TRANSCRIPT_FILE=$(find "$TEMP_DIR" -name "*.vtt" -type f | head -1)
    if [ -n "$TRANSCRIPT_FILE" ]; then
        echo "  ✅ Transcript found"
    else
        echo "  ⚠️ No transcript available"
    fi
fi

# Step 3: Extract clip
echo ""
echo "Step 3: Extracting clip at ${START_SECS}s for ${DURATION_SECS}s..."

mkdir -p "$(dirname "$OUTPUT_PATH")"

ffmpeg -y \
    -ss "$SEEK_OFFSET" \
    -i "$SOURCE_VIDEO" \
    -t "$DURATION_SECS" \
    -c:v libx264 -preset fast -crf 20 \
    -c:a aac -b:a 128k \
    -movflags +faststart \
    "$OUTPUT_PATH" 2>&1 | grep -E "^(frame|Input|Output|Error)" || true

if [ ! -f "$OUTPUT_PATH" ]; then
    echo "❌ Clip extraction failed"
    exit 1
fi

# Step 4: Get metadata
CLIP_SIZE=$(du -h "$OUTPUT_PATH" | awk '{print $1}')
CLIP_DIMS=$(ffprobe -v error -select_streams v:0 \
    -show_entries stream=width,height \
    -of csv=s=x:p=0 "$OUTPUT_PATH" 2>/dev/null || echo "unknown")

echo "  ✅ Clip extracted"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Clip ready"
echo "  Path: $OUTPUT_PATH"
echo "  Size: $CLIP_SIZE"
echo "  Dims: $CLIP_DIMS"

# Copy transcript to output directory if available
if [ -n "$TRANSCRIPT_FILE" ]; then
    cp "$TRANSCRIPT_FILE" "$(dirname "$OUTPUT_PATH")/transcript.en.vtt"
    echo "  Transcript: $(dirname "$OUTPUT_PATH")/transcript.en.vtt"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
