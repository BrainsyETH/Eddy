#!/bin/bash
# set-cookies.sh — Deploy a YouTube cookies.txt to BOTH:
#   • the macOS keychain (for the local runner), and
#   • the YOUTUBE_COOKIES GitHub secret (for the cloud daily pipeline).
#
# First export cookies from a browser logged into YouTube (run in YOUR terminal
# so you can approve the keychain prompt):
#   yt-dlp --cookies-from-browser brave --cookies ~/yt-cookies.txt \
#     --skip-download "https://youtu.be/_eRGIZ4KgAQ"
# Then:
#   ./set-cookies.sh ~/yt-cookies.txt   &&   rm ~/yt-cookies.txt

set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILE="${1:-}"
[ -f "$FILE" ] || { echo "Usage: $0 <cookies.txt>"; exit 1; }

# Sanity: Netscape cookies.txt with YouTube/Google auth cookies.
if ! grep -qiE "youtube\.com|google\.com" "$FILE"; then
  echo "❌ $FILE doesn't look like YouTube cookies (no youtube/google domains)."; exit 1; fi
LINES=$(grep -cvE '^\s*#|^\s*$' "$FILE" || true)
echo "Cookie file: $LINES cookie lines"

echo "→ Storing in keychain (local runner)..."
"$HERE/set-secret.sh" YOUTUBE_COOKIES --file "$FILE"

echo "→ Setting GitHub secret YOUTUBE_COOKIES (cloud pipeline)..."
if command -v gh >/dev/null 2>&1; then
  gh secret set YOUTUBE_COOKIES < "$FILE" && echo "  ✅ GitHub secret set"
else
  echo "  ⚠️ gh not found — skipped cloud secret. Set it manually in repo settings."
fi
echo "✅ Done. Local runs read it from keychain; the daily workflow reads the secret."
