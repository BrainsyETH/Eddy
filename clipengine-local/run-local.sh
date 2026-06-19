#!/bin/bash
# run-local.sh — Run the Eddy ClipEngine pipeline locally (no cloud upload).
#
# Mirrors .github/workflows/youtube-clip-pipeline.yml but:
#   • reads channels from clipengine-local/channels.json (not a GH secret)
#   • writes finished Reels to clipengine-local/output/ (no Vercel Blob / Supabase)
#
# Usage:
#   ./run-local.sh                                  # scan all channels in channels.json
#   ./run-local.sh --url <youtube-url> [--river current] [--peak 1]
#
# Env (optional):
#   YOUTUBE_COOKIES_FILE   Netscape cookies.txt — only needed if YouTube bot-blocks you
#   VIDEOS_PER_CHANNEL     newest uploads to scan per channel (default 5)
#   MAX_CLIPS              stop after this many clips when scanning (default 3)

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
CE="$REPO/scripts/clipengine"
OUT="$HERE/output"
mkdir -p "$OUT"

PEAK_NUMBER=1
SINGLE_URL=""
SINGLE_RIVER=""
VIDEOS_PER_CHANNEL="${VIDEOS_PER_CHANNEL:-5}"
MAX_CLIPS="${MAX_CLIPS:-3}"

while [ $# -gt 0 ]; do
  case "$1" in
    --url)        SINGLE_URL="$2"; shift 2 ;;
    --river)      SINGLE_RIVER="$2"; shift 2 ;;
    --peak)       PEAK_NUMBER="$2"; shift 2 ;;
    --instagram)  SINGLE_IG="$2"; shift 2 ;;
    --no-publish) NO_PUBLISH=1; shift ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# Load publishing secrets: optional .env override first, then the macOS keychain.
[ -f "$HERE/.env" ] && set -a && . "$HERE/.env" && set +a
. "$HERE/load-secrets.sh"

# Publish to the Eddy app pipeline only when creds exist and --no-publish wasn't passed.
PUBLISH=0
if [ "${NO_PUBLISH:-0}" != 1 ] && [ -n "${BLOB_READ_WRITE_TOKEN:-}" ] && [ -n "${SUPABASE_URL:-}" ] && [ -n "${SUPABASE_KEY:-}" ]; then
  PUBLISH=1
fi
echo "Publish mode: $([ "$PUBLISH" = 1 ] && echo 'ON → Blob + clip_library (app gates & posts)' || echo 'OFF → render to output/ only')"

# Branding path: default to the cloud-Remotion handoff (the same on-brand
# clip-reel composition the pipeline renders) whenever we can publish + dispatch,
# so local runs don't quietly produce the divergent ffmpeg look. Falls back to
# the local ffmpeg finalize when that's not possible. Force with REMOTION=1/0.
USE_REMOTION="${REMOTION:-auto}"
if [ "$USE_REMOTION" = auto ]; then
  if [ "$PUBLISH" = 1 ] && command -v gh >/dev/null 2>&1; then USE_REMOTION=1; else USE_REMOTION=0; fi
fi
echo "Branding: $([ "$USE_REMOTION" = 1 ] && echo 'Remotion clip-reel (cloud handoff)' || echo 'local ffmpeg finalize (fallback)')"

process_video() {
  local URL="$1" RIVER="$2" PEAK="$3" IG="${4:-}"
  local WORK; WORK="$(mktemp -d)"

  echo ""
  echo "════════════════════════════════════════════"
  echo "Processing: $URL  (river: ${RIVER:-none})"
  echo "════════════════════════════════════════════"

  bash "$CE/scrape-heatmap.sh" "$URL" "$WORK" || true
  if [ ! -f "$WORK/heatmap-data.json" ]; then
    echo "⚠️  No heatmap data, skipping"; rm -rf "$WORK"; return 1; fi

  local VIDEO_ID PEAK_IDX PEAK_START PEAK_DURATION CHANNEL CREDIT
  VIDEO_ID="$(python3 -c "import json;print(json.load(open('$WORK/heatmap-data.json'))['video_id'])")"
  CHANNEL="$(python3 -c "import json;print(json.load(open('$WORK/heatmap-data.json')).get('channel','') or '')" 2>/dev/null || echo "")"
  # On-screen + caption credit: IG @handle if known, else the YouTube channel name.
  if [ -n "$IG" ]; then CREDIT="@${IG#@}"; else CREDIT="$CHANNEL"; fi

  # River is detected per-video by scrape-heatmap (a channel covers many rivers).
  # A passed-in --river overrides detection. No river → skip before downloading.
  local DETECTED; DETECTED="$(python3 -c "import json;print(json.load(open('$WORK/heatmap-data.json')).get('river_slug','') or '')" 2>/dev/null || echo "")"
  if [ -z "$RIVER" ]; then RIVER="$DETECTED"; fi
  if [ -z "$RIVER" ]; then
    echo "⏭️  No Eddy river detected for this video — skipping (only known-river clips post)."
    rm -rf "$WORK"; return 1; fi
  echo "   River: $RIVER"

  PEAK_IDX=$((PEAK - 1))
  PEAK_START="$(python3 -c "import json;p=json.load(open('$WORK/heatmap-data.json')).get('peaks',[]);print(p[$PEAK_IDX]['start_secs'] if len(p)>$PEAK_IDX else '')")"
  PEAK_DURATION="$(python3 -c "import json;p=json.load(open('$WORK/heatmap-data.json')).get('peaks',[]);print(p[$PEAK_IDX].get('duration_secs',13) if len(p)>$PEAK_IDX else '')")"
  if [ -z "$PEAK_START" ]; then
    echo "⚠️  No peak at position $PEAK, skipping"; rm -rf "$WORK"; return 1; fi

  local FINAL="$OUT/${VIDEO_ID}-peak${PEAK}.mp4"
  if [ -f "$FINAL" ]; then
    echo "⏭️  Already rendered: $FINAL — skipping"; rm -rf "$WORK"; return 1; fi

  echo "→ Extracting clip at ${PEAK_START}s for ${PEAK_DURATION}s..."
  bash "$CE/extract-clip.sh" "$URL" "$PEAK_START" "$PEAK_DURATION" "$WORK/raw-clip.mp4" --transcript || true
  if [ ! -f "$WORK/raw-clip.mp4" ]; then
    echo "⚠️  Extraction failed, skipping"; rm -rf "$WORK"; return 1; fi

  # Cloud-Remotion branding path: upload the RAW clip and hand off — branding
  # happens in Remotion only (no local finalize-reel), so it's never double-branded.
  if [ "$USE_REMOTION" = 1 ]; then
    echo "→ Handing off to cloud Remotion branding..."
    bash "$HERE/handoff-clip.sh" "$WORK/raw-clip.mp4" "$WORK/heatmap-data.json" "$PEAK" "$RIVER" "$URL" "$IG" \
      || echo "⚠️  handoff failed"
    rm -rf "$WORK"; return 0
  fi

  echo "→ Finalizing to Reel format (credit: ${CREDIT:-none})..."
  local VTT; VTT="$(find "$WORK" -name '*.vtt' -type f | head -1 || true)"
  CREATOR_CREDIT="$CREDIT" bash "$CE/finalize-reel.sh" "$WORK/raw-clip.mp4" "${RIVER:-Unknown River}" "$FINAL" "${VTT:-}" "$PEAK_START"

  if [ -f "$FINAL" ]; then
    echo "✅ Done: $FINAL"
    # Auto-publish into the Eddy app pipeline (Blob + clip_library, pending) when
    # creds are present. River is already known (skipped above otherwise).
    if [ "$PUBLISH" = 1 ]; then
      bash "$HERE/publish-clip.sh" "$FINAL" "$WORK/heatmap-data.json" "$PEAK" "$RIVER" "$URL" || echo "⚠️  publish step failed (clip still saved locally)"
    fi
    rm -rf "$WORK"; return 0
  else
    echo "⚠️  Finalize failed"; rm -rf "$WORK"; return 1
  fi
}

if [ -n "$SINGLE_URL" ]; then
  process_video "$SINGLE_URL" "$SINGLE_RIVER" "$PEAK_NUMBER" "${SINGLE_IG:-}"
else
  CHANNELS="$HERE/channels.json"
  [ -f "$CHANNELS" ] || { echo "No channels.json at $CHANNELS"; exit 1; }
  echo "→ Scanning channels (newest $VIDEOS_PER_CHANNEL each, up to $MAX_CLIPS clips)"
  COUNT=0
  while IFS='|' read -r CH_URL CH_RIVER CH_IG; do
    [ -z "$CH_URL" ] && continue
    case "$CH_URL" in
      *REPLACE_WITH*|*ANOTHER_CHANNEL*) echo "  • skipping placeholder $CH_URL"; continue ;;
    esac
    # River is detected per-video (a channel covers many rivers), so scan every
    # channel; process_video skips videos with no detected Eddy river.
    case "$CH_URL" in
      */videos|*watch?v=*|*youtu.be/*) LIST_URL="$CH_URL" ;;
      *) LIST_URL="${CH_URL%/}/videos" ;;
    esac
    CRED_DISP="${CH_IG:+@${CH_IG#@}}"; CRED_DISP="${CRED_DISP:-channel name}"
    echo "  • $LIST_URL  (credit: $CRED_DISP)"
    # One cheap listing call returns id+title for all newest videos; detect the
    # river from the TITLE and only deep-scrape/download matches. This avoids a
    # heavy per-video yt-dlp -J on every video (slow + 403-prone).
    while IFS= read -r LINE; do
      [ -z "$LINE" ] && continue
      [ "$COUNT" -ge "$MAX_CLIPS" ] && { echo "  Reached MAX_CLIPS=$MAX_CLIPS"; break 2; }
      VID="${LINE%%|||*}"; VTITLE="${LINE#*|||}"
      VRIVER="$(bash "$CE/detect-river.sh" "$VTITLE")"
      if [ -z "$VRIVER" ]; then
        echo "    ⏭️  no river in title: ${VTITLE:0:64}"; continue; fi
      echo "    🎯 $VRIVER ← ${VTITLE:0:64}"
      # Count only produced clips so no-river/failed videos don't burn MAX_CLIPS.
      if process_video "https://www.youtube.com/watch?v=${VID}" "$VRIVER" "$PEAK_NUMBER" "$CH_IG"; then
        COUNT=$((COUNT + 1))
      fi
    done < <(yt-dlp --flat-playlist --playlist-end "$VIDEOS_PER_CHANNEL" --print "%(id)s|||%(title)s" "$LIST_URL" 2>/dev/null || true)
  done < <(python3 -c "
import json,sys
# Pipe-delimited (not tab): tab is IFS-whitespace, so empty middle fields would
# collapse and shift columns. '|' never appears in URLs/slugs/handles.
for c in json.load(open('$CHANNELS')):
    if isinstance(c,str): print(c+'||')
    else: print((c.get('url') or '')+'|'+(c.get('river_slug') or '')+'|'+(c.get('instagram') or ''))
")
fi

echo ""
echo "════════════════════════════════════════════"
echo "📁 Output: $OUT"
ls -1 "$OUT"/*.mp4 2>/dev/null || echo "  (no clips produced)"
