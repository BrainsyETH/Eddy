#!/bin/bash
# detect-river.sh — print the matching Eddy river slug for the given text
# (video title, optionally + description), or nothing if no river is named.
# Used as a cheap pre-filter so we only deep-scrape/download matching videos.
#
# Usage: detect-river.sh "Float trip on the Current River"
#        → current

python3 - "$@" <<'PYEOF'
import sys
text = " ".join(sys.argv[1:]).lower()
RIVERS = {
    "big-piney": ["big piney"],
    "courtois": ["courtois"],
    "current": ["current river", "the current"],
    "eleven-point": ["eleven point", "eleven-point", "11 point"],
    "huzzah": ["huzzah"],
    "jacks-fork": ["jacks fork", "jack's fork", "jacks-fork"],
    "meramec": ["meramec"],
    "niangua": ["niangua"],
}
hits = []
for slug, kws in RIVERS.items():
    found = [text.find(k) for k in kws if k in text]
    if found:
        hits.append((min(found), slug))
hits.sort()
print(hits[0][1] if hits else "")
PYEOF
