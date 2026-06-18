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

process_video() {
  local URL="$1" RIVER="$2" PEAK="$3" IG="${4:-}"
  local WORK; WORK="$(mktemp -d)"

  echo ""
  echo "════════════════════════════════════════════"
  echo "Processing: $URL  (river: ${RIVER:-none})"
  echo "════════════════════════════════════════════"

  bash "$CE/scrape-heatmap.sh" "$URL" "$WORK" || true
  if [ ! -f "$WORK/heatmap-data.json" ]; then
    echo "⚠️  No heatmap data, skipping"; rm -rf "$WORK"; return; fi

  local VIDEO_ID PEAK_IDX PEAK_START PEAK_DURATION CHANNEL CREDIT
  VIDEO_ID="$(python3 -c "import json;print(json.load(open('$WORK/heatmap-data.json'))['video_id'])")"
  CHANNEL="$(python3 -c "import json;print(json.load(open('$WORK/heatmap-data.json')).get('channel','') or '')" 2>/dev/null || echo "")"
  # On-screen + caption credit: IG @handle if known, else the YouTube channel name.
  if [ -n "$IG" ]; then CREDIT="@${IG#@}"; else CREDIT="$CHANNEL"; fi
  PEAK_IDX=$((PEAK - 1))
  PEAK_START="$(python3 -c "import json;p=json.load(open('$WORK/heatmap-data.json')).get('peaks',[]);print(p[$PEAK_IDX]['start_secs'] if len(p)>$PEAK_IDX else '')")"
  PEAK_DURATION="$(python3 -c "import json;p=json.load(open('$WORK/heatmap-data.json')).get('peaks',[]);print(p[$PEAK_IDX].get('duration_secs',13) if len(p)>$PEAK_IDX else '')")"
  if [ -z "$PEAK_START" ]; then
    echo "⚠️  No peak at position $PEAK, skipping"; rm -rf "$WORK"; return; fi

  local FINAL="$OUT/${VIDEO_ID}-peak${PEAK}.mp4"
  if [ -f "$FINAL" ]; then
    echo "⏭️  Already rendered: $FINAL — skipping"; rm -rf "$WORK"; return; fi

  echo "→ Extracting clip at ${PEAK_START}s for ${PEAK_DURATION}s..."
  bash "$CE/extract-clip.sh" "$URL" "$PEAK_START" "$PEAK_DURATION" "$WORK/raw-clip.mp4" --transcript || true
  if [ ! -f "$WORK/raw-clip.mp4" ]; then
    echo "⚠️  Extraction failed, skipping"; rm -rf "$WORK"; return; fi

  echo "→ Finalizing to Reel format (credit: ${CREDIT:-none})..."
  local VTT; VTT="$(find "$WORK" -name '*.vtt' -type f | head -1 || true)"
  CREATOR_CREDIT="$CREDIT" bash "$CE/finalize-reel.sh" "$WORK/raw-clip.mp4" "${RIVER:-Unknown River}" "$FINAL" "${VTT:-}" "$PEAK_START"

  if [ -f "$FINAL" ]; then
    echo "✅ Done: $FINAL"
    # Auto-publish into the Eddy app pipeline (Blob + clip_library, pending) when
    # creds are present. Only known-river clips post (per project decision).
    if [ "$PUBLISH" = 1 ]; then
      if [ -z "$RIVER" ]; then
        echo "⏭️  Not publishing — no river known (only known-river clips post)."
      else
        bash "$HERE/publish-clip.sh" "$FINAL" "$WORK/heatmap-data.json" "$PEAK" "$RIVER" "$URL" || echo "⚠️  publish step failed (clip still saved locally)"
      fi
    fi
  else
    echo "⚠️  Finalize failed"
  fi
  rm -rf "$WORK"
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
    # Only known-river clips post, so don't even scan channels with no river_slug.
    if [ -z "$CH_RIVER" ]; then
      echo "  ⏭️  ${CH_URL##*/} — no river_slug set, skipping"; continue; fi
    case "$CH_URL" in
      */videos|*watch?v=*|*youtu.be/*) LIST_URL="$CH_URL" ;;
      *) LIST_URL="${CH_URL%/}/videos" ;;
    esac
    echo "  • $LIST_URL  (river: $CH_RIVER, credit: ${CH_IG:+@${CH_IG#@}}${CH_IG:-channel name})"
    while read -r VID; do
      [ -z "$VID" ] && continue
      [ "$COUNT" -ge "$MAX_CLIPS" ] && { echo "  Reached MAX_CLIPS=$MAX_CLIPS"; break 2; }
      process_video "https://www.youtube.com/watch?v=${VID}" "$CH_RIVER" "$PEAK_NUMBER" "$CH_IG"
      COUNT=$((COUNT + 1))
    done < <(yt-dlp --flat-playlist --playlist-end "$VIDEOS_PER_CHANNEL" --print "%(id)s" "$LIST_URL" 2>/dev/null || true)
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
