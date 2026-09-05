#!/bin/bash
# load-secrets.sh — Load ClipEngine publishing secrets from the macOS keychain
# into the environment. Sourced by run-local.sh.
#
# Keychain service: eddy-clipengine
# Accounts: SUPABASE_URL, SUPABASE_KEY, BLOB_READ_WRITE_TOKEN
#
# Already-set env vars (or values from an optional .env) take precedence, so you
# can override per-run without touching the keychain. Store values with:
#   ./set-secret.sh SUPABASE_KEY

# `|| true` so a missing item (security exits 44) never aborts a `set -e` caller.
_kc() { security find-generic-password -s eddy-clipengine -a "$1" -w 2>/dev/null || true; }

: "${SUPABASE_URL:=$(_kc SUPABASE_URL)}"
: "${SUPABASE_KEY:=$(_kc SUPABASE_KEY)}"
: "${BLOB_READ_WRITE_TOKEN:=$(_kc BLOB_READ_WRITE_TOKEN)}"

: "${META_PAGE_ACCESS_TOKEN:=$(_kc META_PAGE_ACCESS_TOKEN)}"
: "${META_PAGE_ID:=$(_kc META_PAGE_ID)}"
: "${META_INSTAGRAM_ACCOUNT_ID:=$(_kc META_INSTAGRAM_ACCOUNT_ID)}"

export SUPABASE_URL SUPABASE_KEY BLOB_READ_WRITE_TOKEN
export META_PAGE_ACCESS_TOKEN META_PAGE_ID META_INSTAGRAM_ACCOUNT_ID

# YouTube cookies (Netscape cookies.txt) are stored in the keychain. Materialize
# them to a private temp file so yt-dlp can read them via YOUTUBE_COOKIES_FILE.
if [ -z "${YOUTUBE_COOKIES_FILE:-}" ]; then
  _ck="$(_kc YOUTUBE_COOKIES)"
  if [ -n "$_ck" ]; then
    _ckf="${TMPDIR:-/tmp}/eddy-clipengine-cookies.txt"
    (
      umask 077
      # macOS `security -w` hex-encodes multiline generic-password values.
      # Decode that representation back to Netscape cookies; retain backward
      # compatibility with keychain entries that are returned as plaintext.
      if printf '%s' "$_ck" | grep -Eq '^[[:xdigit:]]+$' && [ $((${#_ck} % 2)) -eq 0 ]; then
        printf '%s' "$_ck" | xxd -r -p > "$_ckf"
        if ! head -n 1 "$_ckf" | grep -q 'Netscape HTTP Cookie File'; then
          printf '%s\n' "$_ck" > "$_ckf"
        fi
      else
        printf '%s\n' "$_ck" > "$_ckf"
      fi
    )
    export YOUTUBE_COOKIES_FILE="$_ckf"
  fi
  unset _ck
fi
