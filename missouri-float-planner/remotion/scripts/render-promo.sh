#!/usr/bin/env bash
# Render the 3-feature promo. Resolves a local Chrome (Puppeteer's cached build)
# so the render works even when Remotion can't download its own headless browser
# (e.g. TLS-intercepted networks). Pass a clip path to swap in live map motion.
#
#   ./scripts/render-promo.sh                       # vertical + landscape, stills
#   ./scripts/render-promo.sh --map-clip video/promo-map-portrait.mp4
# No `-u`: macOS bash 3.2 treats an empty array expansion (BROWSER_ARG/PROPS_ARG
# when unset) as an unbound-variable error under nounset.
set -eo pipefail
cd "$(dirname "$0")/.."

MAP_CLIP=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --map-clip) MAP_CLIP="$2"; shift 2 ;;
    *) echo "unknown arg: $1"; exit 1 ;;
  esac
done

CHROME="$(node -e "console.log(require('puppeteer').executablePath())" 2>/dev/null || true)"
BROWSER_ARG=()
if [[ -n "$CHROME" && -f "$CHROME" ]]; then
  BROWSER_ARG=(--browser-executable="$CHROME")
  echo "Using Chrome: $CHROME"
fi

PROPS_ARG=()
if [[ -n "$MAP_CLIP" ]]; then
  PROPS_ARG=(--props="{\"mapClip\":\"$MAP_CLIP\"}")
  echo "Map beat motion clip: $MAP_CLIP"
fi

mkdir -p out
echo "=== Rendering promo (vertical 1080x1920) ==="
npx remotion render src/index.ts promo out/promo-vertical.mp4 "${BROWSER_ARG[@]}" "${PROPS_ARG[@]}"

echo "=== Rendering promo (landscape 1920x1080) ==="
npx remotion render src/index.ts promo-landscape out/promo-landscape.mp4 "${BROWSER_ARG[@]}" "${PROPS_ARG[@]}"

echo "=== Rendering promo-current (vertical) ==="
npx remotion render src/index.ts promo-current out/promo-current-vertical.mp4 "${BROWSER_ARG[@]}"

echo "=== Rendering promo-current (landscape) ==="
npx remotion render src/index.ts promo-current-landscape out/promo-current-landscape.mp4 "${BROWSER_ARG[@]}"

echo "=== Done -> out/promo-vertical.mp4, out/promo-landscape.mp4, out/promo-current-vertical.mp4, out/promo-current-landscape.mp4 ==="
