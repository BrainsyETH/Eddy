#!/bin/bash
# detect-paddling.sh — print "yes" if the given text (video title, optionally +
# description) looks like paddling / float content, else nothing.
#
# This is the TOPIC gate for the clip pipeline. detect-river.sh tags the clip to
# one of Eddy's known rivers (and is the high-value path); detect-paddling.sh is
# the broader net that lets good paddling clips through even when no known river
# is named — they post with generic "Ozark paddling" branding instead of being
# skipped. Keep it tight enough that non-paddling uploads (vlogs, gear unboxings)
# on a paddling channel don't slip through; brand-check (Claude vision) is the
# final backstop downstream.
#
# Usage: detect-paddling.sh "Kings River float trip with the crew"  → yes

python3 - "$@" <<'PYEOF'
import sys
text = " ".join(sys.argv[1:]).lower()
# Clear paddling signals. River/creek alone are intentionally included because
# the scanner only ever feeds this titles from paddling channels; the cost of a
# rare false positive is one brand-check rejection, not a bad post.
KEYWORDS = [
    "kayak", "canoe", "paddle", "paddling", "paddleboard", "paddle board",
    "sup ", "stand up paddle", "standup paddle",
    "raft", "rafting", "whitewater", "white water", "rapids",
    "float trip", "floating", "float the", "float on", "tubing",
    "drift boat", "on the water", "river", "creek", "fork",
]
print("yes" if any(k in text for k in KEYWORDS) else "")
PYEOF
