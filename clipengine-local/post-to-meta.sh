#!/bin/bash
# post-to-meta.sh — Publish a clip directly to Facebook (Page video) and
# Instagram (Reel) via the Meta Graph API, using a PUBLIC video URL.
# Mirrors the app's src/lib/social/meta-client.ts video publish flow.
#
# Usage: ./post-to-meta.sh <public-video-url> <caption> [fb|ig|both]
#
# Requires (keychain): META_PAGE_ACCESS_TOKEN, META_PAGE_ID, META_INSTAGRAM_ACCOUNT_ID

set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ -f "$HERE/load-secrets.sh" ] && . "$HERE/load-secrets.sh"

VIDEO_URL="${1:-}"; CAPTION="${2:-}"; TARGET="${3:-both}"
[ -n "$VIDEO_URL" ] && [ -n "$CAPTION" ] || { echo "Usage: $0 <public-video-url> <caption> [fb|ig|both]"; exit 1; }

GRAPH="https://graph.facebook.com/v24.0"

post_facebook() {
  [ -n "${META_PAGE_ACCESS_TOKEN:-}" ] && [ -n "${META_PAGE_ID:-}" ] || { echo "  FB: missing META_PAGE_ACCESS_TOKEN/META_PAGE_ID — skipping"; return; }
  echo "→ Facebook: posting Page video..."
  local resp
  resp=$(curl -s -X POST "${GRAPH}/${META_PAGE_ID}/videos" \
    --data-urlencode "file_url=${VIDEO_URL}" \
    --data-urlencode "description=${CAPTION}" \
    --data-urlencode "access_token=${META_PAGE_ACCESS_TOKEN}")
  local id; id=$(echo "$resp" | python3 -c "import json,sys;print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")
  if [ -n "$id" ]; then echo "  ✅ FB video posted: id=$id"; else echo "  ❌ FB failed: $resp"; fi
}

post_instagram() {
  [ -n "${META_PAGE_ACCESS_TOKEN:-}" ] && [ -n "${META_INSTAGRAM_ACCOUNT_ID:-}" ] || { echo "  IG: missing META_PAGE_ACCESS_TOKEN/META_INSTAGRAM_ACCOUNT_ID — skipping"; return; }
  echo "→ Instagram: creating Reel container..."
  local resp cid
  resp=$(curl -s -X POST "${GRAPH}/${META_INSTAGRAM_ACCOUNT_ID}/media" \
    --data-urlencode "video_url=${VIDEO_URL}" \
    --data-urlencode "media_type=REELS" \
    --data-urlencode "caption=${CAPTION}" \
    --data-urlencode "access_token=${META_PAGE_ACCESS_TOKEN}")
  cid=$(echo "$resp" | python3 -c "import json,sys;print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")
  [ -n "$cid" ] || { echo "  ❌ IG container failed: $resp"; return; }
  echo "  container=$cid — waiting for processing..."

  local i status
  for i in $(seq 1 30); do
    sleep 5
    status=$(curl -s "${GRAPH}/${cid}?fields=status_code&access_token=${META_PAGE_ACCESS_TOKEN}" \
      | python3 -c "import json,sys;print(json.load(sys.stdin).get('status_code',''))" 2>/dev/null || echo "")
    echo "    [$((i*5))s] status=$status"
    [ "$status" = "FINISHED" ] && break
    [ "$status" = "ERROR" ] && { echo "  ❌ IG processing error"; return; }
  done
  [ "$status" = "FINISHED" ] || { echo "  ❌ IG container not ready (timeout)"; return; }

  echo "→ Instagram: publishing..."
  resp=$(curl -s -X POST "${GRAPH}/${META_INSTAGRAM_ACCOUNT_ID}/media_publish" \
    -H "Content-Type: application/json" \
    -d "{\"creation_id\":\"${cid}\",\"access_token\":\"${META_PAGE_ACCESS_TOKEN}\"}")
  local pid; pid=$(echo "$resp" | python3 -c "import json,sys;print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")
  if [ -n "$pid" ]; then echo "  ✅ IG Reel published: id=$pid"; else echo "  ❌ IG publish failed: $resp"; fi
}

echo "Video: $VIDEO_URL"
echo "Caption: $CAPTION"
echo "Target: $TARGET"
echo ""
case "$TARGET" in
  fb) post_facebook ;;
  ig) post_instagram ;;
  both) post_facebook; post_instagram ;;
  *) echo "Unknown target: $TARGET (use fb|ig|both)"; exit 1 ;;
esac
