#!/bin/bash
# detect-river.sh — print the matching Eddy river slug for the given text
# (video title, optionally + description), or nothing if no river is named.
# Used as a cheap pre-filter so we only deep-scrape/download matching videos.
#
# The river map itself lives in rivers.py, shared with scrape-heatmap.sh so the
# two gates can't drift apart.
#
# Usage: detect-river.sh "Float trip on the Current River"
#        → current

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$SCRIPT_DIR/rivers.py" "$@"
