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
    ( umask 077; printf '%s\n' "$_ck" > "$_ckf" )
    export YOUTUBE_COOKIES_FILE="$_ckf"
  fi
  unset _ck
fi
