#!/bin/bash
# publish-clip.sh — Upload a finished local clip to Vercel Blob and insert it
# into Supabase clip_library (brand_check_status=pending), exactly like the
# cloud youtube-clip-pipeline.yml callback. This does NOT post to FB/IG — it
# hands the clip to the deployed Eddy app's brand-check → decide → post-social
# flow, which is what actually publishes (and gates) it.
#
# Usage: ./publish-clip.sh <final-mp4> <heatmap-json> <peak-number> <river-slug> <source-url>
#
# Requires env (load via .env): BLOB_READ_WRITE_TOKEN, SUPABASE_URL, SUPABASE_KEY

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Load secrets (optional .env override, then macOS keychain) when run standalone.
[ -f "$HERE/.env" ] && set -a && . "$HERE/.env" && set +a
[ -f "$HERE/load-secrets.sh" ] && . "$HERE/load-secrets.sh"

FINAL="$1"; HEATMAP="$2"; PEAK="${3:-1}"; RIVER="${4:-}"; SRC_URL="${5:-}"

for v in BLOB_READ_WRITE_TOKEN SUPABASE_URL SUPABASE_KEY; do
  if [ -z "${!v:-}" ]; then echo "❌ publish: missing \$$v (set it in .env)"; exit 2; fi
done
[ -f "$FINAL" ]   || { echo "❌ publish: clip not found: $FINAL"; exit 1; }
[ -f "$HEATMAP" ] || { echo "❌ publish: heatmap json not found: $HEATMAP"; exit 1; }

read_json() { python3 -c "import json,sys;d=json.load(open('$HEATMAP'));print($1)" 2>/dev/null || echo ""; }
VIDEO_ID=$(read_json "d['video_id']")
CHANNEL=$(read_json "d.get('channel','Unknown')")
TITLE=$(read_json "d.get('title','')")
IDX=$((PEAK - 1))
PEAK_START=$(read_json "d.get('peaks',[])[$IDX]['start_secs'] if len(d.get('peaks',[]))>$IDX else ''")
PEAK_DUR=$(read_json "d.get('peaks',[])[$IDX].get('duration_secs',13) if len(d.get('peaks',[]))>$IDX else 13")
PEAK_SCORE=$(read_json "d.get('peaks',[])[$IDX].get('score',0) if len(d.get('peaks',[]))>$IDX else 0")

# Real dims/duration from the finished file
DIMS=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "$FINAL" 2>/dev/null)
W=${DIMS%x*}; H=${DIMS#*x}
ORIENTATION="landscape"; [ "${H:-0}" -gt "${W:-0}" ] 2>/dev/null && ORIENTATION="portrait"
DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$FINAL" 2>/dev/null | cut -d. -f1)

# Dedup: skip if this video+start already exists
EXISTING=$(curl -s "${SUPABASE_URL}/rest/v1/clip_library?youtube_video_id=eq.${VIDEO_ID}&clip_start_secs=eq.${PEAK_START}&select=id" \
  -H "apikey: ${SUPABASE_KEY}" -H "Authorization: Bearer ${SUPABASE_KEY}" 2>/dev/null || echo "")
if echo "$EXISTING" | python3 -c "import json,sys;d=json.loads(sys.stdin.read() or 'null');exit(0 if isinstance(d,list) and d else 1)" 2>/dev/null; then
  echo "⏭️  publish: clip already in clip_library ($VIDEO_ID @ ${PEAK_START}s) — skipping"
  exit 0
fi

# Step 1: upload to Vercel Blob (public URL)
DATE_PREFIX=$(date -u +%Y-%m-%d)
BLOB_PATH="clips/${DATE_PREFIX}/${VIDEO_ID}-peak${PEAK}.mp4"
echo "→ publish: uploading to Vercel Blob ($BLOB_PATH)..."
UPLOAD=$(curl -s -X PUT "https://blob.vercel-storage.com/${BLOB_PATH}" \
  -H "Authorization: Bearer ${BLOB_READ_WRITE_TOKEN}" \
  -H "x-content-type: video/mp4" \
  -H "x-cache-control-max-age: 31536000" \
  --data-binary "@${FINAL}")
CLIP_URL=$(echo "$UPLOAD" | python3 -c "import json,sys;print(json.load(sys.stdin).get('url',''))" 2>/dev/null || echo "")
if [ -z "$CLIP_URL" ] || [ "$CLIP_URL" = "null" ]; then
  echo "❌ publish: Blob upload failed: $UPLOAD"; exit 1
fi
echo "  ✅ uploaded: $CLIP_URL"

# Step 2: insert into clip_library (brand_check_status=pending)
echo "→ publish: inserting into clip_library..."
ROW=$(CLIP_URL="$CLIP_URL" VIDEO_ID="$VIDEO_ID" CHANNEL="$CHANNEL" RIVER="$RIVER" \
  DURATION="${DURATION:-0}" PEAK_START="$PEAK_START" PEAK_DUR="${PEAK_DUR:-13}" \
  ORIENTATION="$ORIENTATION" PEAK_SCORE="$PEAK_SCORE" SRC_URL="$SRC_URL" python3 -c "
import json, os
print(json.dumps({
  'youtube_video_id': os.environ['VIDEO_ID'],
  'youtube_channel': os.environ['CHANNEL'],
  'river_slug': os.environ['RIVER'] or None,
  'clip_url': os.environ['CLIP_URL'],
  'duration_secs': int(os.environ['DURATION'] or 0),
  'clip_start_secs': float(os.environ['PEAK_START']),
  'clip_end_secs': float(os.environ['PEAK_START']) + float(os.environ['PEAK_DUR']),
  'orientation': os.environ['ORIENTATION'],
  'heatmap_score': float(os.environ['PEAK_SCORE'] or 0),
  'source_creator': os.environ['CHANNEL'],
  'source_url': os.environ['SRC_URL'],
  'brand_check_status': 'pending',
}))
")
RESP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${SUPABASE_URL}/rest/v1/clip_library" \
  -H "apikey: ${SUPABASE_KEY}" -H "Authorization: Bearer ${SUPABASE_KEY}" \
  -H "Content-Type: application/json" -H "Prefer: return=minimal" \
  -d "$ROW")
if [ "$RESP" = "201" ] || [ "$RESP" = "200" ]; then
  echo "  ✅ inserted into clip_library (brand_check_status=pending) — app will gate & post"
else
  echo "❌ publish: clip_library insert returned HTTP $RESP"; exit 1
fi
