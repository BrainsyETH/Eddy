#!/bin/bash
# set-secret.sh — Store a ClipEngine secret in the macOS keychain.
# The value is read silently (never echoed, never written to disk).
#
# Usage:
#   ./set-secret.sh SUPABASE_KEY --clip          # read value from clipboard (most reliable)
#   ./set-secret.sh SUPABASE_KEY                  # silent prompt (paste may truncate long tokens)
#   ./set-secret.sh SUPABASE_URL https://xxxx     # value as arg (non-secret only — hits shell history)

set -euo pipefail

ACC="${1:-}"
case "$ACC" in
  SUPABASE_URL|SUPABASE_KEY|BLOB_READ_WRITE_TOKEN|YOUTUBE_COOKIES) ;;
  META_PAGE_ACCESS_TOKEN|META_PAGE_ID|META_INSTAGRAM_ACCOUNT_ID) ;;
  *) echo "Usage: $0 <name> [value | --clip | --file <path>]  (names: SUPABASE_URL|SUPABASE_KEY|BLOB_READ_WRITE_TOKEN|YOUTUBE_COOKIES|META_PAGE_ACCESS_TOKEN|META_PAGE_ID|META_INSTAGRAM_ACCOUNT_ID)"; exit 1 ;;
esac

if [ "${2:-}" = "--file" ]; then
  [ -f "${3:-}" ] || { echo "File not found: ${3:-}"; exit 1; }
  VAL="$(cat "$3")"
  echo "Read $(printf '%s' "$VAL" | wc -l | tr -d ' ') lines from ${3} for $ACC"
elif [ "${2:-}" = "--clip" ] || [ "${2:-}" = "-c" ]; then
  VAL="$(pbpaste | tr -d '\r\n')"      # strip stray newlines from the copied value
  echo "Read $(printf '%s' "$VAL" | wc -c | tr -d ' ') chars from clipboard for $ACC"
elif [ -n "${2:-}" ]; then
  VAL="$2"
else
  read -r -s -p "Value for $ACC: " VAL; echo
fi
[ -n "$VAL" ] || { echo "Empty value — aborting"; exit 1; }

# Guard against accidentally storing command text / wrong clipboard contents.
# Real tokens (JWTs, vercel_blob_rw_…, URLs) contain no spaces. (Cookies do.)
case "$ACC" in
  SUPABASE_KEY|BLOB_READ_WRITE_TOKEN)
    case "$VAL" in
      *" "*|*"set-secret"*|"cd "*)
        echo "❌ Value contains spaces/command text — looks like the wrong clipboard contents. Copy the actual secret and retry."; exit 1 ;;
    esac ;;
esac

# -U update if exists; -T /usr/bin/security lets the `security` CLI read it back
# without a GUI prompt (so unattended cron runs work), while other apps still prompt.
security add-generic-password -U -s eddy-clipengine -a "$ACC" -T /usr/bin/security -w "$VAL"
echo "✅ Stored $ACC in keychain (service: eddy-clipengine)"
