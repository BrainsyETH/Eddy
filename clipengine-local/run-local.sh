#!/bin/bash
# run-local.sh — Run the Eddy ClipEngine pipeline locally (scan/scrape/extract on
# this machine; branding happens in the cloud).
#
# Mirrors .github/workflows/youtube-clip-pipeline.yml: reads channels from
#   clipengine-local/channels.json (not a GH secret), scrapes + extracts the clip
#   locally, then hands the RAW clip to Remotion (render-clip.yml), which brands it
#   and inserts clip_library. Branding is cloud-only — there is no local ffmpeg
#   render, so this needs the Blob + Supabase creds and gh (see load-secrets.sh).
#
# Usage:
#   ./run-local.sh                                  # scan all channels in channels.json
#   ./run-local.sh --channel <youtube-channel-url>  # scan ONE channel only (targeted)
#   ./run-local.sh --url <youtube-url> [--river current] [--peak 1] [--category high_water]
#   ./run-local.sh --urls-file <file>               # batch-add hand-picked URLs (one per line,
#                                                   #   optional trailing river slug), pre-deduped,
#                                                   #   no channel scan — the fast "add videos" path
#
# Env (optional):
#   YOUTUBE_COOKIES_FILE   Netscape cookies.txt — only needed if YouTube bot-blocks you
#   VIDEOS_PER_CHANNEL     newest uploads to scan per channel (default 5)
#   MAX_CLIPS              stop after this many clips when scanning (default 3)
#   TIER1_HEATMAP_OPTIONAL=1  let known-river (Tier-1) videos produce a fallback
#                          clip when they have no Most-Replayed heatmap (small
#                          Ozark channels). Tier-2 stays gated. Default off.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
CE="$REPO/scripts/clipengine"
OUT="$HERE/output"
mkdir -p "$OUT"

# ── Self-update guard ────────────────────────────────────────────────────────
# The GitHub repo is the source of truth; this clone exists only to download &
# clip locally. Sync to origin/main before doing any work so the cron never runs
# a stale pipeline, then re-exec the (possibly updated) script once — re-execing
# avoids running a half-old copy of this very file. Set NO_SELF_UPDATE=1 to skip
# (e.g. while iterating on local script edits).
if [ "${NO_SELF_UPDATE:-0}" != 1 ] && [ -z "${_EDDY_SELF_UPDATED:-}" ] \
   && command -v git >/dev/null 2>&1 \
   && git -C "$REPO" rev-parse --git-dir >/dev/null 2>&1; then
  echo "↻ self-update: syncing $REPO to origin/main…"
  if git -C "$REPO" fetch --quiet origin main 2>/dev/null \
     && git -C "$REPO" checkout --quiet main 2>/dev/null \
     && git -C "$REPO" merge --ff-only --quiet origin/main 2>/dev/null; then
    echo "  ✓ now at $(git -C "$REPO" rev-parse --short HEAD) (origin/main)"
  else
    echo "  ⚠️  could not fast-forward to origin/main — running current checkout"
    echo "     (branch: $(git -C "$REPO" rev-parse --abbrev-ref HEAD 2>/dev/null), likely local edits or divergence)"
  fi
  export _EDDY_SELF_UPDATED=1
  exec "$HERE/run-local.sh" "$@"
fi
# ─────────────────────────────────────────────────────────────────────────────

PEAK_NUMBER=1
SINGLE_URL=""
SINGLE_RIVER=""
SINGLE_CATEGORY=""
SINGLE_CHANNEL=""
URLS_FILE=""
VIDEOS_PER_CHANNEL="${VIDEOS_PER_CHANNEL:-5}"
MAX_CLIPS="${MAX_CLIPS:-3}"

while [ $# -gt 0 ]; do
  case "$1" in
    --url)        SINGLE_URL="$2"; shift 2 ;;
    --urls-file)  URLS_FILE="$2"; shift 2 ;;
    --channel)    SINGLE_CHANNEL="$2"; shift 2 ;;
    --river)      SINGLE_RIVER="$2"; shift 2 ;;
    --peak)       PEAK_NUMBER="$2"; shift 2 ;;
    --instagram)  SINGLE_IG="$2"; shift 2 ;;
    --category)   SINGLE_CATEGORY="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# Load secrets: optional .env override first, then the macOS keychain.
[ -f "$HERE/.env" ] && set -a && . "$HERE/.env" && set +a
. "$HERE/load-secrets.sh"

# Branding is cloud-only: every clip is branded by the Remotion clip-reel
# composition (handoff-clip.sh → render-clip.yml), the exact path production uses,
# so a local run can never produce the old divergent ffmpeg look. That handoff
# uploads the raw clip to Blob, dedups against + inserts clip_library, and
# dispatches the render via gh — so it needs the Blob + Supabase creds and gh.
# Require them up front (the local ffmpeg finalize path was removed).
MISSING=""
[ -z "${BLOB_READ_WRITE_TOKEN:-}" ] && MISSING="$MISSING BLOB_READ_WRITE_TOKEN"
[ -z "${SUPABASE_URL:-}" ]         && MISSING="$MISSING SUPABASE_URL"
[ -z "${SUPABASE_KEY:-}" ]         && MISSING="$MISSING SUPABASE_KEY"
command -v gh >/dev/null 2>&1      || MISSING="$MISSING gh"
if [ -n "$MISSING" ]; then
  echo "❌ Branding is cloud-only (Remotion); this run needs:$MISSING"
  echo "   Store secrets with ./set-secret.sh <NAME> and install/auth gh, then retry."
  exit 1
fi
# handoff-clip.sh dispatches render-clip via `gh`, which resolves the repo from
# the CWD's git remote. The cron cd's into this dir first, but manual runs
# (--url/--urls-file/--channel) can start anywhere — a wrong CWD dispatches to the
# wrong repo (a 404, no clip lands). Pin gh to THIS clone's origin unless already set.
if [ -z "${GH_REPO:-}" ]; then
  _slug="$(git -C "$REPO" remote get-url origin 2>/dev/null | sed -E 's#^(git@github.com:|https://github.com/)##; s#\.git$##' || true)"
  [ -n "${_slug:-}" ] && export GH_REPO="$_slug"
  unset _slug
fi
echo "Branding: Remotion clip-reel (cloud handoff) → Blob + clip_library (app gates & posts)"

process_video() {
  local URL="$1" RIVER="$2" PEAK="$3" IG="${4:-}" CATEGORY="${5:-}"
  local WORK; WORK="$(mktemp -d)"

  echo ""
  echo "════════════════════════════════════════════"
  echo "Processing: $URL  (river: ${RIVER:-none})"
  echo "════════════════════════════════════════════"

  bash "$CE/scrape-heatmap.sh" "$URL" "$WORK" || true
  if [ ! -f "$WORK/heatmap-data.json" ]; then
    echo "⚠️  No heatmap data, skipping"; rm -rf "$WORK"; return 1; fi

  local PEAK_IDX PEAK_START PEAK_DURATION
  # On-screen/caption credit (IG @handle else channel name) is derived inside
  # handoff-clip.sh from the IG arg + heatmap-data.json — run-local doesn't here.

  # River is detected per-video by scrape-heatmap (a channel covers many rivers).
  # A passed-in --river overrides detection. No known river → Tier 2: still
  # produce the clip with generic "Ozark paddling" branding (the channel scan
  # already gated on paddling topic, and brand-check is the final backstop).
  local DETECTED; DETECTED="$(python3 -c "import json;print(json.load(open('$WORK/heatmap-data.json')).get('river_slug','') or '')" 2>/dev/null || echo "")"
  if [ -z "$RIVER" ]; then RIVER="$DETECTED"; fi
  if [ -n "$RIVER" ]; then echo "   River: $RIVER"; else echo "   River: (none — generic Ozark paddling)"; fi

  PEAK_IDX=$((PEAK - 1))
  PEAK_START="$(python3 -c "import json;p=json.load(open('$WORK/heatmap-data.json')).get('peaks',[]);print(p[$PEAK_IDX]['start_secs'] if len(p)>$PEAK_IDX else '')")"
  PEAK_DURATION="$(python3 -c "import json;p=json.load(open('$WORK/heatmap-data.json')).get('peaks',[]);print(p[$PEAK_IDX].get('duration_secs',13) if len(p)>$PEAK_IDX else '')")"
  if [ -z "$PEAK_START" ]; then
    echo "⚠️  No peak at position $PEAK, skipping"; rm -rf "$WORK"; return 1; fi

  # Dedup happens in handoff-clip.sh, which checks clip_library before dispatching
  # the render — there's no local output file to guard against anymore.
  echo "→ Extracting clip at ${PEAK_START}s for ${PEAK_DURATION}s..."
  bash "$CE/extract-clip.sh" "$URL" "$PEAK_START" "$PEAK_DURATION" "$WORK/raw-clip.mp4" --transcript || true
  if [ ! -f "$WORK/raw-clip.mp4" ]; then
    echo "⚠️  Extraction failed, skipping"; rm -rf "$WORK"; return 1; fi

  # Brand via cloud Remotion only: upload the RAW clip and hand off. render-clip.yml
  # brands it (clip-reel composition) and inserts clip_library (pending). Branding
  # lives in exactly one place — no local finalize, so it's never double-branded.
  # Only a DISPATCHED render counts as a produced clip: dupes (rc=3) and failed
  # handoffs return 1 so the scan loop doesn't burn MAX_CLIPS on them.
  echo "→ Handing off to cloud Remotion branding..."
  local HANDOFF_RC=0
  bash "$HERE/handoff-clip.sh" "$WORK/raw-clip.mp4" "$WORK/heatmap-data.json" "$PEAK" "$RIVER" "$URL" "$IG" "$CATEGORY" || HANDOFF_RC=$?
  rm -rf "$WORK"
  if [ "$HANDOFF_RC" -ne 0 ]; then
    [ "$HANDOFF_RC" -eq 3 ] || echo "⚠️  handoff failed (rc=$HANDOFF_RC)"
    return 1
  fi
  return 0
}

# ── Add-by-URL helpers (used by --urls-file batch adds) ──────────────────────
# Extract the 11-char YouTube id from a URL (same pattern as scrape-heatmap.sh).
video_id_of() { printf '%s' "$1" | grep -oE '[a-zA-Z0-9_-]{11}' | head -1 || true; }

# Cheap clip_library pre-dedup by youtube_video_id — echoes exists|new|error.
# One REST call; fails OPEN ('error' → caller proceeds) so a flaky API never
# silently blocks a clip. Same query the channel scan uses inline below.
dedup_status() {
  local vid="$1" existing
  existing="$(curl -s "${SUPABASE_URL}/rest/v1/clip_library?youtube_video_id=eq.${vid}&select=id&limit=1" \
    -H "apikey: ${SUPABASE_KEY}" -H "Authorization: Bearer ${SUPABASE_KEY}" 2>/dev/null || echo "")"
  printf '%s' "$existing" | python3 -c "import json,sys;d=json.loads(sys.stdin.read() or 'null');print('exists' if isinstance(d,list) and d else ('new' if isinstance(d,list) else 'error'))" 2>/dev/null || echo error
}

# Add ONE hand-picked video: pre-dedup (one REST call) BEFORE any yt-dlp -J or
# download, so an already-clipped URL costs a call instead of a full scrape +
# extract. Returns 0 only when a render was actually dispatched.
add_one_url() {
  local url="$1" river="${2:-}" ig="${3:-}" category="${4:-}" vid status
  vid="$(video_id_of "$url")"
  if [ -n "$vid" ]; then
    status="$(dedup_status "$vid")"
    if [ "$status" = exists ]; then
      echo "  ⏭️  already in clip_library — skipping $url"; return 1
    elif [ "$status" = error ]; then
      echo "  ⚠️  dedup check failed — proceeding without dedup: $url"
    fi
  fi
  process_video "$url" "$river" "$PEAK_NUMBER" "$ig" "$category"
}

if [ -n "$URLS_FILE" ]; then
  # Batch add a hand-picked list: one URL per line, optional trailing river slug
  # ("<url> current"); '#' comments and blank lines ignored. Each URL is
  # pre-deduped against clip_library BEFORE any yt-dlp download, and NO channels
  # are scanned — the efficient path for adding specific videos.
  [ -f "$URLS_FILE" ] || { echo "❌ No urls file at $URLS_FILE"; exit 1; }
  echo "→ Batch add from $URLS_FILE (river default: ${SINGLE_RIVER:-auto-detect}, category: ${SINGLE_CATEGORY:-default})"
  N=0; ADDED=0
  # Read the list on fd 3, not stdin: add_one_url → process_video runs ffmpeg,
  # which consumes stdin; a stdin-fed loop loses every URL after the first.
  while IFS= read -r RAW <&3 || [ -n "$RAW" ]; do
    LINE="${RAW%%#*}"                       # drop trailing # comments
    read -r U REST <<< "$LINE" || true      # U=url, REST=optional river slug
    [ -z "${U:-}" ] && continue
    N=$((N + 1))
    if add_one_url "$U" "${REST:-$SINGLE_RIVER}" "${SINGLE_IG:-}" "${SINGLE_CATEGORY:-}"; then
      ADDED=$((ADDED + 1))
    fi
  done 3< "$URLS_FILE"
  echo "→ Batch add complete: $ADDED dispatched of $N URL(s)"
elif [ -n "$SINGLE_URL" ]; then
  process_video "$SINGLE_URL" "$SINGLE_RIVER" "$PEAK_NUMBER" "${SINGLE_IG:-}" "${SINGLE_CATEGORY:-}"
else
  CHANNELS="$HERE/channels.json"
  if [ -n "$SINGLE_CHANNEL" ]; then
    echo "→ Scanning ONE channel: $SINGLE_CHANNEL (newest $VIDEOS_PER_CHANNEL, up to $MAX_CLIPS clips)"
  else
    [ -f "$CHANNELS" ] || { echo "No channels.json at $CHANNELS"; exit 1; }
    echo "→ Scanning channels (newest $VIDEOS_PER_CHANNEL each, up to $MAX_CLIPS clips)"
  fi
  COUNT=0
  while IFS='|' read -r CH_URL CH_RIVER CH_IG CH_FLOODONLY; do
    [ -z "$CH_URL" ] && continue
    case "$CH_URL" in
      *REPLACE_WITH*|*ANOTHER_CHANNEL*) echo "  • skipping placeholder $CH_URL"; continue ;;
    esac
    # River is detected per-video (a channel covers many rivers), so scan every
    # channel; videos are gated on paddling topic, not on a known river.
    case "$CH_URL" in
      */videos|*watch?v=*|*youtu.be/*) LIST_URL="$CH_URL" ;;
      *) LIST_URL="${CH_URL%/}/videos" ;;
    esac
    CRED_DISP="${CH_IG:+@${CH_IG#@}}"; CRED_DISP="${CRED_DISP:-channel name}"
    echo "  • $LIST_URL  (credit: $CRED_DISP)"
    # One cheap listing call returns id+title for all newest videos; gate on the
    # TITLE (known river → Tier 1, else paddling topic → Tier 2) and only
    # deep-scrape/download those. Avoids a heavy per-video yt-dlp -J on every
    # video (slow + 403-prone) and skips non-paddling uploads.
    while IFS= read -r LINE; do
      [ -z "$LINE" ] && continue
      [ "$COUNT" -ge "$MAX_CLIPS" ] && { echo "  Reached MAX_CLIPS=$MAX_CLIPS"; break 2; }
      VID="${LINE%%|||*}"; VTITLE="${LINE#*|||}"
      VRIVER="$(bash "$CE/detect-river.sh" "$VTITLE")"
      VCATEGORY="$(bash "$CE/detect-flood.sh" "$VTITLE")"
      if [ -n "$VRIVER" ]; then
        echo "    🎯 $VRIVER ← ${VTITLE:0:64}"
      elif [ "$(bash "$CE/detect-paddling.sh" "$VTITLE")" = yes ] || [ "$VCATEGORY" = high_water ]; then
        echo "    🛶 paddling, no known river ← ${VTITLE:0:64}"
      else
        echo "    ⏭️  not paddling: ${VTITLE:0:64}"; continue
      fi
      [ "$VCATEGORY" = high_water ] && echo "    🌊 high water ← ${VTITLE:0:64}"
      # Flood-only source channels contribute ONLY their high-water uploads.
      if [ "$CH_FLOODONLY" = 1 ] && [ "$VCATEGORY" != high_water ]; then
        echo "    ⏭️  flood-only channel, skipping non-high-water: ${VTITLE:0:64}"; continue
      fi
      # Video-level dedup BEFORE any scrape/download (mirrors the cloud
      # pipeline): a video that already has a clip in clip_library is skipped
      # here, so it costs one cheap REST call instead of a full yt-dlp
      # download + extract, and never burns the MAX_CLIPS budget.
      EXISTING=$(curl -s "${SUPABASE_URL}/rest/v1/clip_library?youtube_video_id=eq.${VID}&select=id&limit=1" \
        -H "apikey: ${SUPABASE_KEY}" -H "Authorization: Bearer ${SUPABASE_KEY}" 2>/dev/null || echo "")
      # Only a JSON array with rows means "exists" — a PostgREST error object
      # must not read as a hit. Fail open (proceed) and log on error.
      DEDUP=$(echo "$EXISTING" | python3 -c "import json,sys;d=json.loads(sys.stdin.read() or 'null');print('exists' if isinstance(d,list) and d else ('new' if isinstance(d,list) else 'error'))" 2>/dev/null || echo error)
      if [ "$DEDUP" = exists ]; then
        echo "    ⏭️  already in clip_library — skipping"; continue
      elif [ "$DEDUP" = error ]; then
        echo "    ⚠️  dedup check failed ($(printf '%s' "$EXISTING" | head -c 120)) — proceeding without dedup"
      fi
      # Count only produced clips so no-river/failed videos don't burn MAX_CLIPS.
      if process_video "https://www.youtube.com/watch?v=${VID}" "$VRIVER" "$PEAK_NUMBER" "$CH_IG" "$VCATEGORY"; then
        COUNT=$((COUNT + 1))
      fi
    done < <(yt-dlp --socket-timeout 30 --retries 3 --flat-playlist --playlist-end "$VIDEOS_PER_CHANNEL" --print "%(id)s|||%(title)s" "$LIST_URL" 2>/dev/null || true)
  done < <(
    if [ -n "$SINGLE_CHANNEL" ]; then
      printf '%s|%s||\n' "$SINGLE_CHANNEL" "$SINGLE_RIVER"
    else
      python3 -c "
import json,sys
# Pipe-delimited (not tab): tab is IFS-whitespace, so empty middle fields would
# collapse and shift columns. '|' never appears in URLs/slugs/handles.
for c in json.load(open('$CHANNELS')):
    if isinstance(c,str): print(c+'|||')
    else: print('|'.join([(c.get('url') or ''),(c.get('river_slug') or ''),(c.get('instagram') or ''),('1' if c.get('flood_only') else '')]))
"
    fi
  )
fi

echo ""
echo "════════════════════════════════════════════"
echo "✅ Done — clips were branded by cloud Remotion and inserted into clip_library"
echo "   (pending → brand-check → post-clip cron). Nothing is written locally;"
echo "   check the admin Clip Library / Supabase for results."
