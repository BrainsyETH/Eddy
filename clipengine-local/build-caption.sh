#!/bin/bash
# build-caption.sh — Generate a clip caption with creator attribution.
#
# Attribution rule: credit the Instagram @handle if known, else the YouTube
# channel name. On Facebook (where links are clickable) append the original
# YouTube URL; Instagram captions aren't clickable so the link is omitted there.
#
# Usage:
#   ./build-caption.sh --river "Buffalo National River" --channel "Ozark Media Co" \
#       [--instagram ozarkmediaco] [--url https://youtu.be/ID] [--platform ig|fb]

set -euo pipefail
RIVER=""; CHANNEL=""; IG=""; URL=""; PLATFORM="ig"
while [ $# -gt 0 ]; do
  case "$1" in
    --river) RIVER="$2"; shift 2 ;;
    --channel) CHANNEL="$2"; shift 2 ;;
    --instagram) IG="$2"; shift 2 ;;
    --url) URL="$2"; shift 2 ;;
    --platform) PLATFORM="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

# Credit: @handle if known, else channel name (else generic).
if [ -n "$IG" ]; then
  CREDIT="🎥 Clip via @${IG#@}"
elif [ -n "$CHANNEL" ]; then
  CREDIT="🎥 Clip via ${CHANNEL}"
else
  CREDIT="🎥 Clip via the original creator"
fi

# Tier 1 (known river) vs Tier 2 (no river → generic "Ozark paddling"). Tier 2
# drops the river + Missouri hashtags (the clip may be out of state) and uses a
# softer CTA, since there's no specific float page to point at.
if [ -n "$RIVER" ]; then
  HEADER="🛶 ${RIVER}."
  CTA="Plan your float trip at eddy.guide"
  TAGS="#${RIVER//[^A-Za-z0-9]/} #kayaking #canoe #float #paddling #Ozarks #Missouri #eddyguide"
else
  HEADER="🛶 Ozark paddling."
  CTA="Find your next float at eddy.guide"
  TAGS="#kayaking #canoe #float #paddling #Ozarks #eddyguide"
fi

CAPTION="${HEADER}

${CREDIT}
${CTA}"

# Facebook only: append the clickable original video link.
if [ "$PLATFORM" = "fb" ] && [ -n "$URL" ]; then
  CAPTION="${CAPTION}
▶️ Full video: ${URL}"
fi

CAPTION="${CAPTION}

${TAGS}"

printf '%s\n' "$CAPTION"
