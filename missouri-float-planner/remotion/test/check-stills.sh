#!/usr/bin/env bash
# Renders the visual-regression stills. ONE list, used by both
# `npm run render:check-stills` and .github/workflows/remotion-check.yml, so the
# CI gate and a local run always render the same frames.
#
# Each entry is composition:frame[,frame...]. Output: $STILLS_DIR/<comp>@<frame>.png,
# which is also the baseline filename under test/baselines/.
#
# Env: STILLS_DIR (default /tmp/stills); REMOTION_STILL_ARGS for extra flags
# (e.g. --browser-executable=… when rendering outside the CI image).
set -euo pipefail

STILLS_DIR="${STILLS_DIR:-/tmp/stills}"
mkdir -p "$STILLS_DIR"

STILLS=(
  # Route reel — three frames because the composition has three distinct
  # states, and a mid-float frame alone would pass while either end regressed:
  #   0    the grid thumbnail: whole-float overview, every stop, put-in callout
  #   120  mid-float under the following camera
  #   230  the first stop's pause with its callout up
  # (frame 230 is Echo Bluff on the Pulltite → Round Spring defaultProps.)
  "social-route-portrait:0,120,230"
  "social-section-portrait:120"
  "social-gauge:120"
  "social-gauge-alert:120"
  "social-trend-portrait:120"
  "social-digest:120"
)

for entry in "${STILLS[@]}"; do
  comp="${entry%%:*}"
  IFS=',' read -ra frames <<< "${entry#*:}"
  for frame in "${frames[@]}"; do
    echo "→ rendering still: $comp @ $frame"
    # shellcheck disable=SC2086  # REMOTION_STILL_ARGS is intentionally word-split
    npx remotion still --entry-point=src/index.ts --public-dir=./public \
      "$comp" "$STILLS_DIR/${comp}@${frame}.png" --frame="$frame" ${REMOTION_STILL_ARGS:-}
  done
done

ls -la "$STILLS_DIR"
