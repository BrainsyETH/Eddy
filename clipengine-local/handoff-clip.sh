#!/bin/bash
# handoff-clip.sh — hand a RAW (unbranded) extracted clip off to cloud Remotion.
# Uploads the raw clip to Vercel Blob, then dispatches the render-clip workflow,
# which brands it (clip-reel) and inserts clip_library. Branding happens ONLY in
# Remotion here — the local finalize-reel step is skipped, so no double-branding.
#
# Usage: ./handoff-clip.sh <raw-clip.mp4> <heatmap.json> <peak#> <river-slug> <source-url> [ig-handle]

set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ -f "$HERE/load-secrets.sh" ] && . "$HERE/load-secrets.sh"

RAW="$1"; HEATMAP="$2"; PEAK="${3:-1}"; RIVER="${4:-}"; SRC_URL="${5:-}"; IG="${6:-}"
for v in BLOB_READ_WRITE_TOKEN SUPABASE_URL SUPABASE_KEY; do
  [ -n "${!v:-}" ] || { echo "❌ handoff: missing \$$v"; exit 2; }
done
command -v gh >/dev/null || { echo "❌ handoff: gh CLI required to dispatch the render workflow"; exit 2; }

read_json() { python3 -c "import json;d=json.load(open('$HEATMAP'));print($1)" 2>/dev/null || echo ""; }
VIDEO_ID=$(read_json "d['video_id']")
CHANNEL=$(read_json "d.get('channel','')")
IDX=$((PEAK - 1))
START=$(read_json "d.get('peaks',[])[$IDX]['start_secs'] if len(d.get('peaks',[]))>$IDX else 0")
DUR=$(read_json "d.get('peaks',[])[$IDX].get('duration_secs',13) if len(d.get('peaks',[]))>$IDX else 13")
SCORE=$(read_json "d.get('peaks',[])[$IDX].get('score',0) if len(d.get('peaks',[]))>$IDX else 0")

# Dedup: skip if this video+start already exists in clip_library.
EXISTING=$(curl -s "${SUPABASE_URL}/rest/v1/clip_library?youtube_video_id=eq.${VIDEO_ID}&clip_start_secs=eq.${START}&select=id" \
  -H "apikey: ${SUPABASE_KEY}" -H "Authorization: Bearer ${SUPABASE_KEY}" 2>/dev/null || echo "")
if echo "$EXISTING" | python3 -c "import json,sys;d=json.loads(sys.stdin.read() or 'null');exit(0 if isinstance(d,list) and d else 1)" 2>/dev/null; then
  echo "⏭️  handoff: already in clip_library ($VIDEO_ID @ ${START}s) — skipping"; exit 0
fi

# River display name for the branded frame.
RIVER_NAME="$RIVER"
RESP=$(curl -s "${SUPABASE_URL}/rest/v1/rivers?slug=eq.${RIVER}&select=name" \
  -H "apikey: ${SUPABASE_KEY}" -H "Authorization: Bearer ${SUPABASE_KEY}" 2>/dev/null || echo "")
NAME=$(echo "$RESP" | python3 -c "import json,sys;d=json.loads(sys.stdin.read() or '[]');print(d[0]['name'] if d else '')" 2>/dev/null || echo "")
[ -n "$NAME" ] && RIVER_NAME="$NAME"

CREDIT="${IG:+@${IG#@}}"; CREDIT="${CREDIT:-$CHANNEL}"

# Upload the RAW clip so cloud Remotion can fetch it.
DATE_PREFIX=$(date -u +%Y-%m-%d)
RAW_PATH="clips-raw/${DATE_PREFIX}/${VIDEO_ID}-peak${PEAK}.mp4"
echo "→ handoff: uploading raw clip to Blob..."
UP=$(curl -s -X PUT "https://blob.vercel-storage.com/${RAW_PATH}" \
  -H "Authorization: Bearer ${BLOB_READ_WRITE_TOKEN}" -H "x-content-type: video/mp4" \
  --data-binary "@${RAW}")
RAW_URL=$(echo "$UP" | python3 -c "import json,sys;print(json.load(sys.stdin).get('url',''))" 2>/dev/null || echo "")
[ -n "$RAW_URL" ] || { echo "❌ handoff: raw upload failed: $UP"; exit 1; }
echo "  ✅ raw: $RAW_URL"

# Timed captions from the transcript, if extract-clip wrote one next to the raw.
CAPTIONS_JSON="[]"
VTT="$(dirname "$RAW")/transcript.en.vtt"
if [ -f "$VTT" ]; then
  CAPTIONS_JSON=$(python3 "$HERE/../scripts/clipengine/vtt-to-captions.py" "$VTT" "$START" "$DUR" 2>/dev/null || echo "[]")
fi

echo "→ handoff: dispatching render-clip (Remotion branding)..."
gh workflow run render-clip.yml --ref main \
  -f video_url="$RAW_URL" \
  -f youtube_video_id="$VIDEO_ID" \
  -f river_slug="$RIVER" \
  -f river_name="$RIVER_NAME" \
  -f creator="$CREDIT" \
  -f source_url="$SRC_URL" \
  -f youtube_channel="$CHANNEL" \
  -f peak_number="$PEAK" \
  -f duration_secs="$DUR" \
  -f clip_start_secs="$START" \
  -f orientation="portrait" \
  -f heatmap_score="$SCORE" \
  -f captions="$CAPTIONS_JSON"
echo "  ✅ dispatched — Remotion will brand it and insert clip_library (pending)."
