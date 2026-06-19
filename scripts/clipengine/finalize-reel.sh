#!/bin/bash
# finalize-reel.sh — Convert clip to Instagram Reel format with Eddy branding
#
# Landscape videos → branded frame (Eddy logo top, video middle, captions bottom)
# Vertical videos  → pass through as-is
#
# NOTE: This ffmpeg branding is the LOCAL-ONLY fallback (run-local.sh without
# REMOTION=1). The canonical branding is the Remotion `clip-reel` composition
# (missouri-float-planner/remotion/src/compositions/social/ClipReel.tsx) rendered
# by render-clip.yml — the cloud pipeline and the local handoff both use it so
# clips match the rest of the render pipeline. Prefer the Remotion path.
#
# Usage: finalize-reel.sh <source-video> <river-name> <output-path> [transcript-vtt] [clip-start-sec]
#
# Ported from ClawsifiedInfo/agents/eddy-marketing/scripts/finalize-youtube-clip.sh

set -e

SOURCE_VIDEO="$1"
RIVER_NAME="$2"
OUTPUT_PATH="$3"
TRANSCRIPT_VTT="${4:-}"
CLIP_START="${5:-0}"

if [ -z "$SOURCE_VIDEO" ] || [ ! -f "$SOURCE_VIDEO" ]; then
    echo "Usage: $0 <source-video> <river-name> <output-path> [transcript.vtt] [clip-start-sec]"
    exit 1
fi

OUTPUT_PATH="${OUTPUT_PATH:-./${RIVER_NAME}-$(date +%Y%m%d-%H%M%S).mp4}"

# Brand colors (from eddy.guide tailwind config)
BG_COLOR="0x0F2D35"       # primary-900

# Find a usable font
if [ -f "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf" ]; then
    FONT="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
elif [ -f "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" ]; then
    FONT="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
elif [ -f "/System/Library/Fonts/Helvetica.ttc" ]; then
    FONT="/System/Library/Fonts/Helvetica.ttc"
else
    FONT=""
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎬 Finalizing Clip to Instagram Reel"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Source: $(basename "$SOURCE_VIDEO")"
echo "River: $RIVER_NAME"
echo "Output: $(basename "$OUTPUT_PATH")"
echo ""

# Step 1: Detect orientation
echo "Step 1: Detecting video orientation..."
VIDEO_STREAM=$(ffprobe -v error -select_streams v:0 \
    -show_entries stream=width,height \
    -of csv=s=x:p=0 "$SOURCE_VIDEO" 2>/dev/null)
WIDTH=$(echo "$VIDEO_STREAM" | cut -dx -f1)
HEIGHT=$(echo "$VIDEO_STREAM" | cut -dx -f2)
DURATION=$(ffprobe -v error -show_entries format=duration \
    -of default=noprint_wrappers=1:nokey=1 "$SOURCE_VIDEO" 2>/dev/null)

if [ -z "$WIDTH" ] || [ -z "$HEIGHT" ]; then
    echo "❌ Could not detect video dimensions"
    exit 1
fi

DURATION_SECS=$(printf "%.0f" "$DURATION" 2>/dev/null || echo "15")

echo "  Dimensions: ${WIDTH}x${HEIGHT}"
echo "  Duration: ${DURATION_SECS}s"

mkdir -p "$(dirname "$OUTPUT_PATH")"

# Vertical source → pass through
if [ "$HEIGHT" -gt "$WIDTH" ]; then
    echo "  Orientation: vertical → passing through as-is"
    cp "$SOURCE_VIDEO" "$OUTPUT_PATH"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "✅ Clip finalized (vertical passthrough)"
    echo "  Path: $OUTPUT_PATH"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    exit 0
fi

echo "  Orientation: landscape → applying Eddy branded frame"
echo ""

# Check if source has audio
HAS_AUDIO=$(ffprobe -v error -select_streams a -show_entries stream=codec_type \
    -of csv=p=0 "$SOURCE_VIDEO" 2>/dev/null | wc -l | tr -d ' ')

# Step 2: Extract captions from transcript if available
echo "Step 2: Preparing captions..."
CAPTION_FILTERS=""

# Auto-find transcript in the same dir if not provided
if [ -z "$TRANSCRIPT_VTT" ]; then
    TEMP_DIR=$(dirname "$SOURCE_VIDEO")
    for candidate in "$TEMP_DIR/transcript.en.vtt" "$TEMP_DIR/video.en.vtt"; do
        if [ -f "$candidate" ]; then
            TRANSCRIPT_VTT="$candidate"
            break
        fi
    done
fi

if [ -n "$TRANSCRIPT_VTT" ] && [ -f "$TRANSCRIPT_VTT" ] && [ -n "$FONT" ]; then
    echo "  Transcript: $(basename "$TRANSCRIPT_VTT")"
    echo "  Clip start: ${CLIP_START}s"

    CAPTION_FILTERS=$(CLIP_START="$CLIP_START" DURATION_SECS="$DURATION_SECS" TRANSCRIPT_VTT="$TRANSCRIPT_VTT" FONT="$FONT" python3 << 'PYEOF'
import re, sys, os

clip_start = int(float(os.environ.get("CLIP_START", "0")))
try:
    clip_dur = float(os.environ.get("DURATION_SECS", "15"))
except (ValueError, TypeError):
    clip_dur = 15.0
clip_dur = min(clip_dur, 90)
clip_end = clip_start + clip_dur
vtt_path = os.environ["TRANSCRIPT_VTT"]
font = os.environ.get("FONT", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")

def parse_time(t):
    t = t.strip().replace(',', '.')
    parts = t.split(':')
    if len(parts) == 3:
        return float(parts[0])*3600 + float(parts[1])*60 + float(parts[2])
    elif len(parts) == 2:
        return float(parts[0])*60 + float(parts[1])
    return float(parts[0])

with open(vtt_path) as f:
    content = f.read()

blocks = re.split(r'\n\n+', content)
entries = []
for block in blocks:
    lines = block.strip().split('\n')
    for i, line in enumerate(lines):
        m = re.match(r'(\d[\d:.]+)\s*-->\s*(\d[\d:.]+)', line)
        if m:
            start = parse_time(m.group(1))
            end = parse_time(m.group(2))
            text_lines = lines[i+1:]
            raw = ' '.join(text_lines).strip()
            if '<c>' in raw or '<00:' in raw:
                continue
            if not raw or '[Music]' in raw or '[Applause]' in raw:
                continue
            if start >= clip_start and start < clip_end:
                entries.append((start - clip_start, end - clip_start, raw))

if not entries:
    sys.exit(0)

all_words = []
for start, end, text in entries:
    words = text.split()
    if not words:
        continue
    word_dur = (end - start) / len(words)
    for j, w in enumerate(words):
        all_words.append((start + j * word_dur, w))

deduped = []
for ts, word in all_words:
    if deduped and deduped[-1][1].lower() == word.lower():
        if ts - deduped[-1][0] < 1.0:
            continue
    deduped.append((ts, word))

chunks = []
i = 0
while i < len(deduped):
    chunk_words = deduped[i:i+6]
    chunk_start = chunk_words[0][0]
    if i + 6 < len(deduped):
        chunk_end = deduped[i+6][0]
    else:
        chunk_end = clip_dur
    text = ' '.join(w for _, w in chunk_words)
    chunks.append((chunk_start, chunk_end, text))
    i += 6

if not chunks:
    sys.exit(0)

def escape_drawtext(s):
    s = s.replace('\\', '\\\\')
    s = s.replace("'", "\\'")
    s = s.replace(':', '\\:')
    s = s.replace('%', '%%')
    return s

filters = []
for start, end, text in chunks:
    words = text.split()
    if len(words) > 4:
        mid = (len(words) + 1) // 2
        line1 = escape_drawtext(' '.join(words[:mid]))
        line2 = escape_drawtext(' '.join(words[mid:]))
    else:
        line1 = escape_drawtext(text)
        line2 = ""

    s = f"{start:.2f}"
    e = f"{end:.2f}"
    filters.append(
        f"drawtext=text='{line1}':fontsize=38:fontcolor=white"
        f":x=(w-text_w)/2:y=1260:fontfile={font}"
        f":shadowcolor=black@0.8:shadowx=2:shadowy=2"
        f":enable='between(t\\,{s}\\,{e})'"
    )
    if line2:
        filters.append(
            f"drawtext=text='{line2}':fontsize=38:fontcolor=white"
            f":x=(w-text_w)/2:y=1308:fontfile={font}"
            f":shadowcolor=black@0.8:shadowx=2:shadowy=2"
            f":enable='between(t\\,{s}\\,{e})'"
        )

print(','.join(filters))
PYEOF
)

    if [ -n "$CAPTION_FILTERS" ]; then
        echo "  Captions: extracted and timed"
    else
        echo "  Captions: no speech found in clip window"
    fi
elif [ -z "$FONT" ]; then
    echo "  No usable font found — rendering without captions"
else
    echo "  No transcript available — rendering without captions"
fi
echo ""

# Step 3: Render branded frame
echo "Step 3: Rendering branded frame..."

# Build the caption filter chain
if [ -n "$CAPTION_FILTERS" ]; then
    EXTRA_FILTERS=",${CAPTION_FILTERS}"
else
    EXTRA_FILTERS=""
fi

# Build audio flags
if [ "$HAS_AUDIO" -gt 0 ]; then
    AUDIO_FLAGS="-c:a aac -b:a 128k"
else
    AUDIO_FLAGS="-an"
fi

# Layout: 1080x1920 — top brand band (otter + wordmark + river name),
# source video centered at y=746, bottom brand band (CTA + creator credit).
VIDEO_Y=746

# Brand assets resolved from the repo (otter mascot PNG + Fredoka wordmark font).
REPO_ROOT="$(cd "$(dirname "$0")/../.." 2>/dev/null && pwd)"
ASSET_DIR="$REPO_ROOT/missouri-float-planner/remotion/public"
OTTER="$ASSET_DIR/eddy/eddy-canoe.png"
BRAND_FONT="$ASSET_DIR/fonts/Fredoka-Variable.ttf"
[ -f "$BRAND_FONT" ] || BRAND_FONT="$FONT"
FONT_OPT=""; [ -n "$BRAND_FONT" ] && FONT_OPT=":fontfile=$BRAND_FONT"

# Escape dynamic text for drawtext (\ : %). Caller may pass CREATOR_CREDIT
# (e.g. "@ozarkmediaco" or a channel name) for on-screen attribution.
esc() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/:/\\:/g' -e 's/%/\\%/g'; }
RIVER_ESC="$(esc "$RIVER_NAME")"
CREDIT_RAW="${CREATOR_CREDIT:-}"
CREDIT_ESC="$(esc "$CREDIT_RAW")"

# Compose the filtergraph: source band, teal bg, otter overlay, brand text.
FG="[0:v]scale=1080:608:force_original_aspect_ratio=decrease,pad=1080:608:(ow-iw)/2:(oh-ih)/2:color=$BG_COLOR[vid];"
FG="$FG color=c=$BG_COLOR:s=1080x1920:d=$DURATION_SECS[bg];"
FG="$FG [bg][vid]overlay=0:$VIDEO_Y[base]"
OTTER_INPUT=()
if [ -f "$OTTER" ]; then
    OTTER_INPUT=(-loop 1 -i "$OTTER")
    FG="$FG;[1:v]scale=-2:170[otter];[base][otter]overlay=(W-w)/2:64[stage]"
    STAGE="stage"
else
    STAGE="base"
fi
TXT="drawtext=text='eddy.guide':fontsize=46:fontcolor=white$FONT_OPT:x=(w-text_w)/2:y=250"
TXT="$TXT,drawtext=text='$RIVER_ESC':fontsize=58:fontcolor=0xD9C9B0$FONT_OPT:x=(w-text_w)/2:y=560"
TXT="$TXT,drawtext=text='Plan your float at eddy.guide':fontsize=40:fontcolor=white$FONT_OPT:box=1:boxcolor=0xF07052:boxborderw=22:x=(w-text_w)/2:y=1470"
if [ -n "$CREDIT_RAW" ]; then
    TXT="$TXT,drawtext=text='Clip via $CREDIT_ESC':fontsize=30:fontcolor=0xC9B391$FONT_OPT:x=(w-text_w)/2:y=1640"
fi
FG="$FG;[$STAGE]$TXT$EXTRA_FILTERS"

ffmpeg -y -i "$SOURCE_VIDEO" "${OTTER_INPUT[@]}" \
    -filter_complex "$FG" \
    -c:v libx264 -preset fast -crf 20 \
    $AUDIO_FLAGS \
    -t "$DURATION_SECS" \
    -movflags +faststart \
    "$OUTPUT_PATH" 2>&1 | grep -E "^(frame|Input|Output|Error)" || true

if [ ! -f "$OUTPUT_PATH" ]; then
    echo "❌ Render failed"
    exit 1
fi

echo "  ✅ Branded frame rendered"
echo ""

# Step 4: Verify
echo "Step 4: Verifying..."
OUT_SIZE=$(du -h "$OUTPUT_PATH" | awk '{print $1}')
OUT_DIMS=$(ffprobe -v error -select_streams v:0 \
    -show_entries stream=width,height \
    -of csv=s=x:p=0 "$OUTPUT_PATH" 2>/dev/null || echo "unknown")

echo "  File: $(basename "$OUTPUT_PATH")"
echo "  Size: $OUT_SIZE"
echo "  Format: $OUT_DIMS"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Clip finalized successfully!"
echo "  Path: $OUTPUT_PATH"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
