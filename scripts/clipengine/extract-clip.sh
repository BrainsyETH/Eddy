#!/bin/bash
# extract-clip.sh — Download and extract a clip from a YouTube video
# Uses yt-dlp for download and ffmpeg for clip extraction.
#
# Usage: ./extract-clip.sh <youtube-url> <start-secs> <duration-secs> <output-path> [--transcript]
#
# Auth: set YT_DLP_COOKIES_FILE to a Netscape-format cookie jar to bypass
# YouTube bot checks on CI runners. Without it, yt-dlp from datacenter IPs
# often hits "Sign in to confirm you're not a bot".

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

TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Shared yt-dlp flags for anti-bot resilience + optional cookie auth
YTDLP_COMMON=(
    --no-playlist
    --no-warnings
    --no-progress
    --retries 5
    --fragment-retries 5
    --sleep-requests 2
    --extractor-args "youtube:player_client=android,web"
)
if [ -n "${YT_DLP_COOKIES_FILE:-}" ] && [ -f "${YT_DLP_COOKIES_FILE}" ]; then
    YTDLP_COMMON+=(--cookies "$YT_DLP_COOKIES_FILE")
    echo "🔑 Using cookies from $YT_DLP_COOKIES_FILE"
else
    echo "⚠️  YT_DLP_COOKIES_FILE not set — may hit YouTube bot check on CI runners"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎬 Extracting YouTube Clip"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "URL: $YOUTUBE_URL"
echo "Start: ${START_SECS}s"
echo "Duration: ${DURATION_SECS}s"
echo ""

# Step 1: Download video
echo "Step 1: Downloading video..."
yt-dlp "${YTDLP_COMMON[@]}" \
    --format "bestvideo[height<=1080]+bestaudio/best[height<=1080]" \
    --merge-output-format mp4 \
    --output "$TEMP_DIR/source.%(ext)s" \
    "$YOUTUBE_URL"

SOURCE_VIDEO=$(find "$TEMP_DIR" -name "source.*" -type f | head -1)
if [ -z "$SOURCE_VIDEO" ] || [ ! -f "$SOURCE_VIDEO" ]; then
    echo "❌ Download failed (check yt-dlp output above; if 'bot check', refresh YT_DLP_COOKIES)"
    exit 1
fi
echo "  ✅ Downloaded: $(du -h "$SOURCE_VIDEO" | awk '{print $1}')"

# Step 2: Download transcript if requested
if [ "$TRANSCRIPT_FLAG" = "--transcript" ]; then
    echo ""
    echo "Step 2: Fetching transcript..."
    yt-dlp "${YTDLP_COMMON[@]}" \
        --write-auto-subs \
        --sub-lang en \
        --sub-format vtt \
        --skip-download \
        --output "$TEMP_DIR/transcript" \
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
    -ss "$START_SECS" \
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
