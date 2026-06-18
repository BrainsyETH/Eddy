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
[ -n "$RIVER" ] || { echo "--river is required" >&2; exit 1; }

# Credit: @handle if known, else channel name (else generic).
if [ -n "$IG" ]; then
  CREDIT="🎥 Clip via @${IG#@}"
elif [ -n "$CHANNEL" ]; then
  CREDIT="🎥 Clip via ${CHANNEL}"
else
  CREDIT="🎥 Clip via the original creator"
fi

CAPTION="🛶 ${RIVER}.

${CREDIT}
Plan your float trip at eddy.guide"

# Facebook only: append the clickable original video link.
if [ "$PLATFORM" = "fb" ] && [ -n "$URL" ]; then
  CAPTION="${CAPTION}
▶️ Full video: ${URL}"
fi

# River hashtag (spaces stripped) + a base set.
RIVERTAG="#${RIVER//[^A-Za-z0-9]/}"
CAPTION="${CAPTION}

${RIVERTAG} #kayaking #canoe #float #paddling #Ozarks #Missouri #eddyguide"

printf '%s\n' "$CAPTION"
