#!/usr/bin/env bash
#
# Compare EAS environment variable NAMES across the environments we build.
#
# WHY THIS EXISTS: the failure mode is asymmetry, not absence. `eas env:list`
# shows one environment at a time, so a variable set for `production` and
# forgotten for `preview` looks correct from either side — you have to hold two
# screens in your head to see the gap.
#
# That gap is not hypothetical. SENTRY_ORG and SENTRY_PROJECT were set on
# `production` only while every build used `--profile preview`, which eas.json
# maps to the `preview` environment. The Sentry config plugin adds a source-map
# upload step to the Xcode build and sentry-cli reads those from the environment
# at that moment, so the build failed inside Xcode — naming a phase, never the
# variable. Two `env:list` runs each looked fine.
#
# Names only. Values are never printed: some are secrets the API will not return
# anyway, and the rest belong in the dashboard rather than in terminal scrollback.
#
# ── WRITTEN FOR BASH 3.2, DELIBERATELY ─────────────────────────────────────
#
# macOS ships bash 3.2 as /bin/bash and always will — 4.0 went GPLv3 and Apple
# will not ship it. This script's first version used `declare -A`, which is a
# bash 4 feature, so it worked on Linux and died on the only platform that runs
# it: `declare: -A: invalid option`. `bash -n` does not catch that, because the
# syntax is valid — the builtin simply lacks the flag at runtime.
#
# So: no associative arrays, no `${x^^}`, no `mapfile`. Sorted temp files and
# `comm` do the same job and run anywhere. If you extend this, check it against
# /bin/bash on a Mac, not just the bash on your PATH.

set -euo pipefail

ENVIRONMENTS="preview production"

# What a build needs to be complete. EXPO_PUBLIC_* are inlined into the bundle
# by Metro and are public by construction; the Sentry three are build-time only,
# and SENTRY_AUTH_TOKEN is a write credential that must never take the prefix.
REQUIRED="
EXPO_PUBLIC_MAPBOX_TOKEN
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
EXPO_PUBLIC_REVENUECAT_IOS_KEY
EXPO_PUBLIC_SENTRY_DSN
SENTRY_ORG
SENTRY_PROJECT
SENTRY_AUTH_TOKEN
"

cd "$(dirname "$0")/.."

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# One sorted file of variable NAMES per environment.
for env in $ENVIRONMENTS; do
  echo "==> reading $env"
  npx eas-cli@latest env:list --environment "$env" 2>/dev/null |
    grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' |
    tr -d '=' |
    sort -u > "$work/$env" || true

  if [ ! -s "$work/$env" ]; then
    echo ""
    echo "  Could not read any variables for '$env'."
    echo "  Check you are logged in:  npx eas-cli@latest whoami"
    echo ""
    exit 1
  fi
done

status=0

# 1. Asymmetry — the bug this script was written for.
for env in $ENVIRONMENTS; do
  for other in $ENVIRONMENTS; do
    [ "$env" = "$other" ] && continue
    # Lines in $other that are absent from $env.
    missing="$(comm -13 "$work/$env" "$work/$other")"
    if [ -n "$missing" ]; then
      echo ""
      echo "  Set in '$other' but MISSING from '$env':"
      echo "$missing" | sed 's/^/    /'
      status=1
    fi
  done
done

# 2. Absence — a variable missing everywhere is invisible to the check above.
for env in $ENVIRONMENTS; do
  for want in $REQUIRED; do
    if ! grep -qx "$want" "$work/$env"; then
      echo ""
      echo "  '$env' is missing a required variable: $want"
      status=1
    fi
  done
done

if [ "$status" -ne 0 ]; then
  echo ""
  echo "  Fix with, for example:"
  echo "    npx eas-cli@latest env:create --environment preview \\"
  echo "      --name SENTRY_ORG --value <org> --visibility plaintext"
  echo ""
  echo "  SENTRY_AUTH_TOKEN must be created with --visibility secret."
  echo ""
  exit 1
fi

echo ""
echo "EAS variables agree across: $ENVIRONMENTS"
