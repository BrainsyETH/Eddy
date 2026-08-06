#!/usr/bin/env python3
"""rivers.py — single source of truth for "which Eddy river is this video about?"

Both detect-river.sh (cheap title pre-filter) and scrape-heatmap.sh (title +
description, and the Tier-1 heatmap bypass) import `detect()` from here. The map
used to be copy-pasted into both scripts, which meant every expansion had to be
made twice or the two gates would silently disagree.

Matching rules per river:
    kw   at least one must appear  → names the river
    req  optional; at least one must ALSO appear → disambiguator for river names
         that are shared with a better-known river elsewhere
    not  optional; none may appear → rules out the out-of-region namesake

When several rivers match, the one mentioned EARLIEST in the text wins (a title
usually leads with its subject). No match → "" and the clip is not posted.

Slugs MUST exist in the app's `rivers` table — a slug with no row ships a broken
Tier-1 CTA link. Verified in parity with all 25 rows on 2026-08-05.
"""

RIVERS = {
    # ── The original 8. Keywords unchanged — do not tighten without re-checking
    # the existing clip_library, these already produce most of the backlog. ──
    "big-piney":        {"kw": ["big piney"]},
    "courtois":         {"kw": ["courtois"]},
    "current":          {"kw": ["current river", "the current"]},
    "eleven-point":     {"kw": ["eleven point", "eleven-point", "11 point"]},
    "huzzah":           {"kw": ["huzzah"]},
    "jacks-fork":       {"kw": ["jacks fork", "jack's fork", "jacks-fork"]},
    "meramec":          {"kw": ["meramec"]},
    "niangua":          {"kw": ["niangua"]},

    # ── Added 2026-08-05 to reach parity with the `rivers` table. These were
    # already supported by the app but invisible here, so every video naming one
    # was discarded as "no known river" and then killed by the Tier-2 heatmap
    # gate. Detecting them makes those videos Tier-1 (heatmap bypass). ──

    # Distinctive names — the river is the only thing called this.
    "bourbeuse":        {"kw": ["bourbeuse"]},
    "gasconade":        {"kw": ["gasconade"]},
    "bryant-creek":     {"kw": ["bryant creek"]},
    "war-eagle-creek":  {"kw": ["war eagle"]},
    # bare "mulberry" is a street/fruit; require the river word.
    "mulberry":         {"kw": ["mulberry river"]},
    # "st. francis" alone is a saint/hospital/school; require the river or one of
    # its whitewater landmarks.
    "st-francis": {
        "kw": ["st. francis river", "st francis river", "saint francis river",
               "millstream garden", "silver mines", "tiemann shut"],
    },

    # ── Shared names. A wrong slug ships a wrong CTA, so these are deliberately
    # conservative: better to detect nothing than to mislabel. ──

    # Dominant float subject on YouTube is the Ozark river, so exclude the
    # out-of-region namesakes rather than requiring a landmark.
    "buffalo": {
        "kw": ["buffalo national river", "buffalo river"],
        "not": ["tennessee", "new york", "wisconsin", "west virginia",
                "buffalo bayou"],
    },
    "james": {
        "kw": ["james river"],
        "not": ["virginia", "richmond", "lynchburg", "scottsville",
                "chesapeake", "south dakota", "jamestown"],
    },
    "kings-river": {
        "kw": ["kings river", "king's river"],
        "not": ["california", "sierra", "kings canyon", "fresno",
                "garnet dike", "cedar grove"],
    },
    "caddo-river": {
        "kw": ["caddo river", "caddo gap"],
        "not": ["caddo lake", "texas", "louisiana"],
    },
    "north-fork-white": {
        "kw": ["north fork of the white", "north fork white", "north fork river",
               "norfork river", "dawt mill", "hammond camp"],
        "not": ["feather", "payette", "american river", "salmon river",
                "snoqualmie", "virgin river", "shoshone"],
    },

    # Genuinely 50/50 names — require an Ozark landmark or the state.
    "black": {
        "kw": ["black river"],
        "req": ["missouri", "arkansas", "poplar bluff", "clearwater",
                "williamsville", "annapolis", "lesterville", "hendrickson"],
        "not": ["black river falls", "wisconsin", "michigan", "vermont",
                "jamaica", "new york"],
    },
    "elk": {
        "kw": ["elk river"],
        "req": ["missouri", "noel", "pineville", "ginger blue", "tiff city",
                "grand falls"],
        "not": ["west virginia", "tennessee", "colorado", "minnesota", "idaho"],
    },
    "big-river": {
        # "big river" is the most generic name on this list — landmark required.
        "kw": ["big river"],
        "req": ["missouri", "washington state park", "st. francois",
                "irondale", "bonne terre", "desloge", "byrnesville",
                "cedar hill", "morse mill", "browns ford"],
    },
    "crooked-creek": {
        "kw": ["crooked creek"],
        "req": ["arkansas", "yellville", "kelly's slab", "pyatt", "harrison",
                "fred berry", "snow creek"],
    },
    # Two different Spring Rivers, both in the table. Bare "spring river" is
    # ambiguous, so each side needs its own landmark; if neither matches, the
    # video is correctly left with no river.
    "spring-river": {
        "kw": ["spring river"],
        "req": ["arkansas", "hardy", "mammoth spring", "saddler falls",
                "many islands", "cherokee village", "ravenden"],
    },
    "spring-river-mo": {
        "kw": ["spring river"],
        "req": ["missouri", "carthage", "joplin", "la russell", "verona",
                "mount vernon", "carl junction"],
    },
}


def detect_all(text):
    """Every river named in `text`, ordered by where it is mentioned."""
    text = (text or "").lower()
    hits = []
    for slug, rule in RIVERS.items():
        found = [text.find(k) for k in rule["kw"] if k in text]
        if not found:
            continue
        if any(n in text for n in rule.get("not", [])):
            continue
        req = rule.get("req")
        if req and not any(r in text for r in req):
            continue
        hits.append((min(found), slug))
    hits.sort()
    return [slug for _, slug in hits]


def detect(text):
    """Return the slug of the river named earliest in `text`, or ""."""
    hits = detect_all(text)
    return hits[0] if hits else ""


if __name__ == "__main__":
    import sys
    print(detect(" ".join(sys.argv[1:])))
