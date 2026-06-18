#!/bin/bash
# load-secrets.sh — Load ClipEngine publishing secrets from the macOS keychain
# into the environment. Sourced by run-local.sh and publish-clip.sh.
#
# Keychain service: eddy-clipengine
# Accounts: SUPABASE_URL, SUPABASE_KEY, BLOB_READ_WRITE_TOKEN
#
# Already-set env vars (or values from an optional .env) take precedence, so you
# can override per-run without touching the keychain. Store values with:
#   ./set-secret.sh SUPABASE_KEY

_kc() { security find-generic-password -s eddy-clipengine -a "$1" -w 2>/dev/null; }

: "${SUPABASE_URL:=$(_kc SUPABASE_URL)}"
: "${SUPABASE_KEY:=$(_kc SUPABASE_KEY)}"
: "${BLOB_READ_WRITE_TOKEN:=$(_kc BLOB_READ_WRITE_TOKEN)}"

export SUPABASE_URL SUPABASE_KEY BLOB_READ_WRITE_TOKEN
