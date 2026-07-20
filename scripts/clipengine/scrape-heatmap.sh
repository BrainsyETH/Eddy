#!/bin/bash
# scrape-heatmap.sh — Extract YouTube heatmap (Most Replayed) data
# Finds the most-watched moments in a video for clip extraction.
#
# Usage: ./scrape-heatmap.sh <youtube-url> [output-dir]
# Output: heatmap-data.json in output-dir
#
# Env (optional):
#   MAX_CLIP_SECS=60            cap on clip length
#   TIER1_HEATMAP_OPTIONAL=1    opt-in: if a KNOWN Eddy river is detected but the
#                               video has no Most-Replayed heatmap, emit ONE
#                               deterministic fallback clip (source="fallback")
#                               instead of skipping. Tier-2 (no river) still skips.
#                               Default off → strict PR#740 gate. Unset to revert.
#
# Uses yt-dlp (-J) for metadata + heatmap so it shares the same auth (cookies)
# and JS runtime as the downloader — HTML scraping gets bot-blocked on CI.

set -e

YOUTUBE_URL="$1"
OUTPUT_DIR="${2:-.}"

if [ -z "$YOUTUBE_URL" ]; then
    echo "Usage: $0 <youtube-url> [output-dir]"
    exit 1
fi

mkdir -p "$OUTPUT_DIR"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Scraping YouTube Heatmap Data"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "URL: $YOUTUBE_URL"

# Extract video ID
VIDEO_ID=$(echo "$YOUTUBE_URL" | grep -oE '([a-zA-Z0-9_-]{11})' | head -1)
if [ -z "$VIDEO_ID" ]; then
    echo "❌ Could not extract video ID from URL"
    exit 1
fi
echo "Video ID: $VIDEO_ID"

# Fetch metadata + heatmap via yt-dlp (authenticated, JS-runtime aware).
python3 << PYEOF
import json, os, subprocess, sys

video_id = "$VIDEO_ID"
url = f"https://www.youtube.com/watch?v={video_id}"
output_dir = "$OUTPUT_DIR"
cookies_file = os.environ.get("YOUTUBE_COOKIES_FILE", "")

cmd = ["yt-dlp", "-J", "--no-warnings", "--no-playlist", "--retries", "5"]
if cookies_file and os.path.exists(cookies_file):
    cmd += ["--cookies", cookies_file]
cmd.append(url)

try:
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    if proc.returncode != 0 or not proc.stdout.strip():
        print(f"❌ yt-dlp info fetch failed (exit {proc.returncode})")
        print((proc.stderr or "")[:400])
        sys.exit(1)
    info = json.loads(proc.stdout)
except Exception as e:
    print(f"❌ yt-dlp info fetch error: {e}")
    sys.exit(1)

title = info.get("title") or "Unknown"
duration = int(info.get("duration") or 0)
views = int(info.get("view_count") or 0)
channel = info.get("channel") or info.get("uploader") or "Unknown"
heatmap = info.get("heatmap") or []

print(f"  Title: {title}")
print(f"  Duration: {duration}s")
print(f"  Views: {views:,}")
print(f"  Channel: {channel}")

# Clip length tracks the WIDTH of the most-replayed span, not a fixed window:
# find contiguous runs of high-engagement heatmap segments and use their extent,
# clamped to [CLIP_MIN, CLIP_MAX]. CLIP_MAX overridable via MAX_CLIP_SECS.
CLIP_MIN = 12
CLIP_MAX = int(os.environ.get("MAX_CLIP_SECS", "60"))
# Tier-1 bypass (opt-in, default OFF): when a KNOWN Eddy river is detected but the
# video has no "most replayed" heatmap (almost always a smaller upload), synthesize
# ONE deterministic fallback clip instead of skipping — so genuine Ozark-river
# content from small channels isn't lost to the gate. Tier-2 (no river detected)
# keeps the strict PR#740 gate untouched. Revert by unsetting the env var.
TIER1_HEATMAP_OPTIONAL = os.environ.get("TIER1_HEATMAP_OPTIONAL", "0") == "1"
peaks = []
source = "none"

def fmt(s):
    return f"{int(s // 60)}:{int(s % 60):02d}"

# yt-dlp heatmap entries look like {start_time, end_time, value}, value ~0-1.
hm = sorted(
    [h for h in heatmap if isinstance(h, dict) and "start_time" in h and "value" in h],
    key=lambda x: float(x["start_time"]),
)
if hm:
    source = "heatmap"
    vals = [float(h["value"]) for h in hm]
    vmax = max(vals)
    vmean = sum(vals) / len(vals)
    # "popular" = notably above average (35% of the way from mean to the peak).
    # Adapts to the curve: a sharp spike on a flat baseline still yields a span,
    # and broadly-elevated videos give longer (capped) clips.
    thresh = vmean + (vmax - vmean) * 0.35
    runs, i, n = [], 0, len(hm)
    while i < n:
        if float(hm[i]["value"]) >= thresh:
            j = i
            while j < n and float(hm[j]["value"]) >= thresh:
                j += 1
            seg = hm[i:j]
            r_start = float(seg[0]["start_time"])
            r_end = float(seg[-1].get("end_time", seg[-1]["start_time"]))
            runs.append({"start": r_start, "end": r_end, "score": sum(float(s["value"]) for s in seg)})
            i = j
        else:
            i += 1
    runs.sort(key=lambda r: r["score"], reverse=True)
    for r in runs[:5]:
        start, dur = r["start"], r["end"] - r["start"]
        if dur > CLIP_MAX:                       # cap — center the window on the run
            mid = (r["start"] + r["end"]) / 2
            start, dur = max(0.0, mid - CLIP_MAX / 2), float(CLIP_MAX)
        elif dur < CLIP_MIN:                     # floor — pad around a sharp spike
            start, dur = max(0.0, start - (CLIP_MIN - dur) / 2), float(CLIP_MIN)
        start, dur = round(start, 1), round(dur, 1)
        peaks.append({
            "start_secs": start,
            "end_secs": round(start + dur, 1),
            "duration_secs": dur,
            "score": round(r["score"], 3),
            "start_formatted": fmt(start),
            "end_formatted": fmt(start + dur),
        })
    # "Most Replayed" intent: order by engagement score (desc) so PEAK_NUMBER=1 is
    # the STRONGEST peak, not the earliest. runs[] was already score-ranked; a
    # chronological re-sort here is what made weak 0:00 spikes win over the real peak.
    peaks.sort(key=lambda p: p["score"], reverse=True)
    print(f"  Heatmap: {len(hm)} segments -> {len(peaks)} popular sections (lengths: {[p['duration_secs'] for p in peaks]}s)")

# Detect which Eddy river this video is about (per-video, not per-channel — a
# channel may cover many rivers). Match the river name in title + description;
# if several appear, take the first mentioned. No match → river_slug stays empty
# and the clip won't be posted. Computed BEFORE the no-peaks decision below so the
# Tier-1 bypass can tell a known-river video apart from a generic one.
description = info.get("description") or ""
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
_text = (title + " " + description).lower()
_hits = []
for _slug, _kws in RIVERS.items():
    _found = [_text.find(k) for k in _kws if k in _text]
    if _found:
        _hits.append((min(_found), _slug))
_hits.sort()
river_slug = _hits[0][1] if _hits else ""
print(f"  River: {river_slug or '(none detected — will not post)'}" +
      (f"  [also matched: {[h[1] for h in _hits[1:]]}]" if len(_hits) > 1 else ""))

if not peaks:
    if TIER1_HEATMAP_OPTIONAL and river_slug and duration > 0:
        # Tier-1 bypass: a known Eddy river is named but YouTube has no "most
        # replayed" heatmap. Synthesize ONE deterministic window rather than lose
        # the river content: skip the intro by anchoring ~30% in, scale length to
        # runtime within the same [CLIP_MIN, CLIP_MAX] policy, and tag score=0.0 so
        # it's telemetry-distinguishable from a real engagement peak. (A content-
        # aware audio-loudness pick is a future drop-in; the anchor is zero-cost.)
        fb_dur = min(max(round(duration * 0.10), CLIP_MIN), CLIP_MAX)
        fb_dur = min(fb_dur, duration)            # never exceed the source
        fb_start = duration * 0.30                # anchor past the intro/title card
        if fb_start + fb_dur > duration:          # keep the window inside the video
            fb_start = max(0.0, duration - fb_dur)
        fb_start, fb_dur = round(fb_start, 1), round(float(fb_dur), 1)
        peaks.append({
            "start_secs": fb_start,
            "end_secs": round(fb_start + fb_dur, 1),
            "duration_secs": fb_dur,
            "score": 0.0,
            "start_formatted": fmt(fb_start),
            "end_formatted": fmt(fb_start + fb_dur),
        })
        source = "fallback"
        print(f"  🪝 Tier-1 fallback ({river_slug}): no heatmap — single window "
              f"{peaks[0]['start_formatted']} → {peaks[0]['end_formatted']} ({fb_dur}s)")
    else:
        # No "most replayed" heatmap (or a flat curve with no standout section)
        # means YouTube has no real engagement signal — typically a low-view
        # upload. Tier-2 (no known river), bypass off, or unknown duration: skip
        # rather than guess, so we only ever clip moments viewers actually
        # replayed. (Clip length stays heatmap-driven, never a fixed default.)
        print("  ⏭️  No replay-engagement heatmap — skipping (clips require a real engagement peak)")
        source = "none"

result = {
    "video_id": video_id,
    "title": title,
    "channel": channel,
    "duration_secs": duration,
    "view_count": views,
    "source": source,
    "river_slug": river_slug,
    "peaks": peaks,
}

outpath = os.path.join(output_dir, "heatmap-data.json")
with open(outpath, "w") as f:
    json.dump(result, f, indent=2)

print("")
for i, p in enumerate(peaks):
    print(f"  Peak {i+1}: {p['start_formatted']} -> {p['end_formatted']} (score: {p['score']})")
print("")
print(f"✅ Heatmap data saved to {outpath}")
PYEOF
