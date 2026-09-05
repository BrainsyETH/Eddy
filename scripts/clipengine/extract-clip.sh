#!/bin/bash
# extract-clip.sh — Download and extract a clip from a YouTube video
# Uses yt-dlp for download and ffmpeg for clip extraction.
#
# Usage: ./extract-clip.sh <youtube-url> <start-secs> <duration-secs> <output-path> [--transcript]
#
# Ported from ClawsifiedInfo/workspace/scripts/youtube-to-reel.sh

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
VIDEO_HEALTH="$REPO_ROOT/missouri-float-planner/remotion/scripts/video-health.sh"
TRANSCRIPT_FILE=""

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
# Prefer an HLS format because YouTube's current cookie-bound direct HTTPS
# formats can return 403 under SABR delivery, while the equivalent HLS stream
# remains available. Falls back to another combined format, then to a full
# download if the section grab yields nothing.
SECTION_PAD=3
DL_START=$(awk "BEGIN{s=$START_SECS-$SECTION_PAD; if(s<0)s=0; print s}")
DL_END=$(awk "BEGIN{print $START_SECS+$DURATION_SECS+$SECTION_PAD}")
SEEK_OFFSET=$(awk "BEGIN{print $START_SECS-$DL_START}")

echo "Step 1: Downloading clip window ${DL_START}s–${DL_END}s (not full video)..."
WINDOW_DOWNLOAD_OK=true
if ! yt-dlp \
    ${COOKIE_ARGS[@]+"${COOKIE_ARGS[@]}"} \
    --extractor-args "youtube:player_client=default,web_embedded" \
    --retries 5 \
    --download-sections "*${DL_START}-${DL_END}" \
    --downloader ffmpeg \
    --format "95/best[protocol^=m3u8][height<=720]/best[height<=720]" \
    --merge-output-format mp4 \
    --output "$TEMP_DIR/source.%(ext)s" \
    --no-playlist \
    --quiet \
    "$YOUTUBE_URL"; then
    WINDOW_DOWNLOAD_OK=false
fi

SOURCE_VIDEO=$(find "$TEMP_DIR" -name "source.*" -type f | head -1)

# Fallback: a failed yt-dlp command may still leave a partial MP4. Never accept
# it merely because the path exists; discard it and grab the full source.
if [ "$WINDOW_DOWNLOAD_OK" != "true" ] || [ -z "$SOURCE_VIDEO" ] || [ ! -s "$SOURCE_VIDEO" ]; then
    echo "  ⚠️  windowed download failed or was empty — falling back to full download"
    [ -z "$SOURCE_VIDEO" ] || rm -f "$SOURCE_VIDEO"
    yt-dlp \
        ${COOKIE_ARGS[@]+"${COOKIE_ARGS[@]}"} \
        --extractor-args "youtube:player_client=default,web_embedded" \
        --retries 5 \
        --format "95/best[protocol^=m3u8][height<=720]/best[height<=720]" \
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
        ${COOKIE_ARGS[@]+"${COOKIE_ARGS[@]}"} \
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

FFMPEG_LOG="$TEMP_DIR/extract-ffmpeg.log"
if ! ffmpeg -y \
    -fflags +genpts \
    -ss "$SEEK_OFFSET" \
    -i "$SOURCE_VIDEO" \
    -t "$DURATION_SECS" \
    -map 0:v:0 -map 0:a:0? \
    -vf "fps=30" \
    -c:v libx264 -preset fast -crf 20 \
    -c:a aac -b:a 128k -af "aresample=async=1:first_pts=0" \
    -avoid_negative_ts make_zero \
    -movflags +faststart \
    "$OUTPUT_PATH" >"$FFMPEG_LOG" 2>&1; then
    echo "❌ FFmpeg clip extraction failed" >&2
    sed -n '1,80p' "$FFMPEG_LOG" >&2
    exit 1
fi

# Existence and duration alone are not enough: truncated HLS can decode with a
# timestamp gap that FFmpeg fills by repeating the last frame. Reject corrupt,
# short, or visibly frozen clips before they ever reach Remotion.
"$VIDEO_HEALTH" "$OUTPUT_PATH" 4 2

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
