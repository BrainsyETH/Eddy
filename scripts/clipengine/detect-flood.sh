#!/bin/bash
# detect-flood.sh — print "high_water" if the given text (video title, optionally
# + description) looks like dramatic high-water / flood-stage paddling content,
# else nothing. This is the CATEGORY signal that switches a clip to the
# safety-PSA branding ("HIGH WATER" eyebrow + "know your river levels" CTA).
#
# It LAYERS on top of the existing topic gates (detect-river / detect-paddling):
# the scanner only ever feeds it titles from paddling channels, so terms like
# "swept" or "raging" read as high water, not noise.
#
# Editorial line for this category: dramatic rapids, swamped/pinned boats, swims,
# and swiftwater rescues / near-misses are IN scope. Titles that signal a real
# FATALITY or serious injury are excluded here so the safety PSA never amplifies
# a death — brand-check (Claude vision) is the final visual backstop on the
# footage itself.
#
# Usage: detect-flood.sh "River at flood stage — insane high water swim"  → high_water

python3 - "$@" <<'PYEOF'
import sys
text = " ".join(sys.argv[1:]).lower()

# A title signalling a real death / serious injury never gets the high_water
# treatment. Kept deliberately narrow (and distinct from the near-miss keywords
# below) so "almost drowned" / "close call" framing still qualifies.
EXCLUDE = [
    "died", "dies", "death", "fatal", "fatality", "drowns", "drowning",
    "body found", "body recovered", "passed away", "memorial", "r.i.p",
]
if any(k in text for k in EXCLUDE):
    print("")
    sys.exit(0)

# Positive signals: high-water / flood conditions, or the carnage / swim /
# rescue framing that essentially only happens when a river is running too high.
KEYWORDS = [
    "flood", "flooding", "flood stage", "flood-stage", "floodwater",
    "high water", "high-water", "highwater", "high flow", "high and fast",
    "swollen", "blown out", "blown-out", "raging", "record high", "record water",
    "at flood", "torrent", "big water", "huge rapids", "massive rapids",
    "carnage", "close call", "near miss", "near-miss", "capsize", "capsized",
    "pinned", "swept away", "beatdown", "beat down", "getting destroyed",
    "worst swim", "almost drowned", "nearly drowned", "sketchy", "too high",
    "spring runoff", "snowmelt",
]
print("high_water" if any(k in text for k in KEYWORDS) else "")
PYEOF
