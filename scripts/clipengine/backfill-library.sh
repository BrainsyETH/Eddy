#!/usr/bin/env bash
# Regenerate unposted clip_library rows from their original YouTube sources.
#
# Dry-run by default. Pass --execute to quarantine each selected row, extract a
# fresh raw clip, upload it, and dispatch render-clip.yml in in-place rerender
# mode. Published rows are never selected.
#
# Usage: backfill-library.sh [--execute] [--ref branch] [--limit N]

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
LOCAL_DIR="$REPO_ROOT/clipengine-local"
EXECUTE=false
REF=$(git -C "$REPO_ROOT" branch --show-current)
LIMIT=1000

while [ "$#" -gt 0 ]; do
  case "$1" in
    --execute) EXECUTE=true; shift ;;
    --ref) REF="$2"; shift 2 ;;
    --limit) LIMIT="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

case "$LIMIT" in
  ''|*[!0-9]*) echo "--limit must be a positive integer" >&2; exit 2 ;;
esac
[ "$LIMIT" -gt 0 ] || { echo "--limit must be a positive integer" >&2; exit 2; }

# The established local runner keeps these credentials in the macOS keychain
# and materializes the optional YouTube cookies file with mode 0600.
# shellcheck source=../../clipengine-local/load-secrets.sh
. "$LOCAL_DIR/load-secrets.sh"

for name in SUPABASE_URL SUPABASE_KEY BLOB_READ_WRITE_TOKEN; do
  [ -n "${!name:-}" ] || { echo "Missing $name" >&2; exit 2; }
done
for command_name in curl jq gh ffmpeg ffprobe yt-dlp python3; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "Missing required command: $command_name" >&2
    exit 2
  }
done

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
INVENTORY="$TMP/inventory.json"

curl -fsS \
  "$SUPABASE_URL/rest/v1/clip_library?select=id,youtube_video_id,youtube_channel,river_slug,clip_url,duration_secs,clip_start_secs,orientation,heatmap_score,source_creator,source_url,content_type,used_in_posts,brand_check_status&order=created_at.asc&limit=1000" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY" \
  -o "$INVENTORY"

ROWS=$(jq -c --argjson limit "$LIMIT" \
  '[.[] | select(((.used_in_posts // []) | length) == 0)] | .[:$limit]' \
  "$INVENTORY")
COUNT=$(jq 'length' <<<"$ROWS")

echo "Unposted clips selected: $COUNT"
echo "$ROWS" | jq -r '.[] | "  \(.id)  \(.youtube_video_id)  \(.brand_check_status)  \(.duration_secs)s"'

if [ "$EXECUTE" != "true" ]; then
  echo "Dry run only. Re-run with --execute to regenerate these rows."
  exit 0
fi

[ "$COUNT" -gt 0 ] || exit 0

echo "$ROWS" | jq -c '.[]' | while IFS= read -r ROW; do
  CLIP_ID=$(jq -r '.id' <<<"$ROW")
  VIDEO_ID=$(jq -r '.youtube_video_id' <<<"$ROW")
  CHANNEL=$(jq -r '.youtube_channel // ""' <<<"$ROW")
  RIVER=$(jq -r '.river_slug // ""' <<<"$ROW")
  OLD_URL=$(jq -r '.clip_url' <<<"$ROW")
  START=$(jq -r '.clip_start_secs' <<<"$ROW")
  REQUESTED_DURATION=$(jq -r '.duration_secs' <<<"$ROW")
  CREATOR=$(jq -r '.source_creator // .youtube_channel // ""' <<<"$ROW")
  SOURCE_URL=$(jq -r '.source_url' <<<"$ROW")
  CATEGORY=$(jq -r '.content_type // ""' <<<"$ROW")
  SCORE=$(jq -r '.heatmap_score // 0' <<<"$ROW")
  CLIP_DIR="$TMP/$CLIP_ID"
  RAW="$CLIP_DIR/raw.mp4"
  mkdir -p "$CLIP_DIR"

  echo ""
  echo "[$CLIP_ID] Regenerating $VIDEO_ID at ${START}s for ${REQUESTED_DURATION}s"

  # Quarantine before network/media work so the cron cannot approve or post the
  # stale render while this replacement is being prepared.
  CLAIM_BODY=$(jq -nc \
    --arg message "Corrected rerender in progress on $REF" \
    '{brand_check_status:"failed",brand_check_result:null,brand_check_error:$message,posting_claimed_at:null}')
  curl -fsS -X PATCH \
    "$SUPABASE_URL/rest/v1/clip_library?id=eq.$CLIP_ID" \
    -H "apikey: $SUPABASE_KEY" \
    -H "Authorization: Bearer $SUPABASE_KEY" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" \
    --data "$CLAIM_BODY"

  if ! "$SCRIPT_DIR/extract-clip.sh" \
    "$SOURCE_URL" "$START" "$REQUESTED_DURATION" "$RAW" --transcript; then
    ERROR_BODY=$(jq -nc \
      --arg message "Corrected rerender extraction failed on $REF" \
      '{brand_check_status:"failed",brand_check_error:$message}')
    curl -fsS -X PATCH \
      "$SUPABASE_URL/rest/v1/clip_library?id=eq.$CLIP_ID" \
      -H "apikey: $SUPABASE_KEY" \
      -H "Authorization: Bearer $SUPABASE_KEY" \
      -H "Content-Type: application/json" \
      -H "Prefer: return=minimal" \
      --data "$ERROR_BODY"
    echo "[$CLIP_ID] Extraction failed; row remains quarantined" >&2
    continue
  fi

  ACTUAL_DURATION=$(ffprobe -v error -show_entries format=duration \
    -of default=noprint_wrappers=1:nokey=1 "$RAW")
  CAPTIONS='[]'
  if [ -f "$CLIP_DIR/transcript.en.vtt" ]; then
    CAPTIONS=$(python3 "$SCRIPT_DIR/vtt-to-captions.py" \
      "$CLIP_DIR/transcript.en.vtt" "$START" "$ACTUAL_DURATION")
  fi

  DIMS=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height \
    -of csv=s=x:p=0 "$RAW")
  SOURCE_ORIENTATION=landscape
  [ "${DIMS#*x}" -gt "${DIMS%x*}" ] 2>/dev/null && SOURCE_ORIENTATION=portrait

  RIVER_NAME="$RIVER"
  if [ -n "$RIVER" ]; then
    RIVER_NAME=$(curl -fsS \
      "$SUPABASE_URL/rest/v1/rivers?slug=eq.$RIVER&select=name" \
      -H "apikey: $SUPABASE_KEY" \
      -H "Authorization: Bearer $SUPABASE_KEY" | jq -r '.[0].name // empty')
  fi

  RAW_PATH="clips-raw/backfill/$(date -u +%Y-%m-%d)/$CLIP_ID.mp4"
  UPLOAD=$(curl -fsS -X PUT "https://blob.vercel-storage.com/$RAW_PATH" \
    -H "Authorization: Bearer $BLOB_READ_WRITE_TOKEN" \
    -H "x-content-type: video/mp4" \
    --data-binary "@$RAW")
  RAW_URL=$(jq -r '.url // empty' <<<"$UPLOAD")
  if [ -z "$RAW_URL" ]; then
    echo "[$CLIP_ID] Raw upload returned no URL; row remains quarantined" >&2
    continue
  fi

  if gh workflow run render-clip.yml --repo BrainsyETH/Eddy --ref "$REF" \
    -f clip_id="$CLIP_ID" \
    -f video_url="$RAW_URL" \
    -f youtube_video_id="$VIDEO_ID" \
    -f river_slug="$RIVER" \
    -f river_name="$RIVER_NAME" \
    -f creator="$CREATOR" \
    -f source_url="$SOURCE_URL" \
    -f youtube_channel="$CHANNEL" \
    -f peak_number="backfill-$CLIP_ID" \
    -f duration_secs="$ACTUAL_DURATION" \
    -f clip_start_secs="$START" \
    -f orientation="portrait" \
    -f heatmap_score="$SCORE" \
    -f captions="$CAPTIONS" \
    -f source_orientation="$SOURCE_ORIENTATION" \
    -f category="$CATEGORY"; then
    WAIT_BODY=$(jq -nc \
      --arg message "Corrected rerender dispatched from $REF; awaiting replacement" \
      '{brand_check_status:"failed",brand_check_error:$message}')
    curl -fsS -X PATCH \
      "$SUPABASE_URL/rest/v1/clip_library?id=eq.$CLIP_ID" \
      -H "apikey: $SUPABASE_KEY" \
      -H "Authorization: Bearer $SUPABASE_KEY" \
      -H "Content-Type: application/json" \
      -H "Prefer: return=minimal" \
      --data "$WAIT_BODY"
    echo "[$CLIP_ID] Render dispatched"
  else
    echo "[$CLIP_ID] Render dispatch failed; row remains quarantined" >&2
  fi

  # OLD_URL is intentionally read into the snapshot: operators can compare it
  # with the eventual replacement without allowing a live re-query to change
  # which rows this run owns.
  : "$OLD_URL"
done

echo "Backfill dispatch pass complete. Rows remain quarantined until each render replaces its URL."
