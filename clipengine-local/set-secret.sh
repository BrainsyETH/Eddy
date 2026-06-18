#!/bin/bash
# set-secret.sh — Store a ClipEngine secret in the macOS keychain.
# The value is read silently (never echoed, never written to disk).
#
# Usage:
#   ./set-secret.sh SUPABASE_KEY
#   ./set-secret.sh BLOB_READ_WRITE_TOKEN
#   ./set-secret.sh SUPABASE_URL https://xxxx.supabase.co   # value as arg (non-secret)

set -euo pipefail

ACC="${1:-}"
case "$ACC" in
  SUPABASE_URL|SUPABASE_KEY|BLOB_READ_WRITE_TOKEN) ;;
  *) echo "Usage: $0 <SUPABASE_URL|SUPABASE_KEY|BLOB_READ_WRITE_TOKEN> [value]"; exit 1 ;;
esac

if [ -n "${2:-}" ]; then
  VAL="$2"
else
  read -r -s -p "Value for $ACC: " VAL; echo
fi
[ -n "$VAL" ] || { echo "Empty value — aborting"; exit 1; }

# -U update if exists; -T /usr/bin/security lets the `security` CLI read it back
# without a GUI prompt (so unattended cron runs work), while other apps still prompt.
security add-generic-password -U -s eddy-clipengine -a "$ACC" -T /usr/bin/security -w "$VAL"
echo "✅ Stored $ACC in keychain (service: eddy-clipengine)"
