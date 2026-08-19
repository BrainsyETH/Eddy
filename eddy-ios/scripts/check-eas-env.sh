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

# ── THE READ IS SLOW, AND MUST NOT BE SILENT ABOUT WHY ─────────────────────
#
# This takes the better part of a minute: `npx` re-resolves `eas-cli@latest`
# on every run, then each environment is a network round trip. That is normal
# and there is nothing to fix about it — but the read used to be
# `npx eas-cli@latest env:list … 2>/dev/null |`, which puts stdout in a pipe
# and stderr in the bin, so the wait looked identical to a hang and a genuine
# failure looked identical to both.
#
# Two guards, neither of which costs a call:
#
#   `--yes`        answers npx's "Ok to proceed?" before it downloads the CLI,
#                  which is a real prompt this script cannot display.
#   `< /dev/null`  gives every invocation an empty stdin, so any OTHER prompt
#                  — an expired login, most likely — hits EOF and fails at
#                  once instead of blocking on a question nobody can see.
#                  Flag-independent, so it holds for prompts not invented yet.
#
# Stderr is captured and PRINTED on failure rather than discarded. A script
# written to make an invisible misconfiguration visible has no business hiding
# the reason it could not look.
run_eas() {
  npx --yes eas-cli@latest "$@" < /dev/null
}

# One sorted file of variable NAMES per environment.
for env in $ENVIRONMENTS; do
  echo "==> reading $env (a slow network read, not a hang)"
  if ! raw="$(run_eas env:list --environment "$env" 2>"$work/$env.err")"; then
    echo ""
    echo "  Could not read '$env':"
    sed 's/^/    /' "$work/$env.err"
    echo ""
    exit 1
  fi

  printf '%s\n' "$raw" |
    grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' |
    tr -d '=' |
    sort -u > "$work/$env" || true

  # A successful call that named nothing: the environment exists and is empty,
  # which is a real answer and a different one from a failure above.
  if [ ! -s "$work/$env" ]; then
    echo ""
    echo "  '$env' returned no variables at all."
    echo "  Create them with:  npx eas-cli@latest env:create --environment $env"
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
