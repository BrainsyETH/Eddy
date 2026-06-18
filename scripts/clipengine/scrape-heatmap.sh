#!/bin/bash
# scrape-heatmap.sh — Extract YouTube heatmap (Most Replayed) data
# Finds the most-watched moments in a video for clip extraction.
#
# Usage: ./scrape-heatmap.sh <youtube-url> [output-dir]
# Output: heatmap-data.json in output-dir
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
FALLBACK_DURATION = 15
peaks = []
source = "fallback"

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
    peaks.sort(key=lambda p: p["start_secs"])
    print(f"  Heatmap: {len(hm)} segments -> {len(peaks)} popular sections (lengths: {[p['duration_secs'] for p in peaks]}s)")

if not peaks:
    print("  ⚠️  No heatmap data — using evenly-spaced fallback positions")
    source = "fallback"
    if duration > FALLBACK_DURATION * 2:
        for pct in [0.25, 0.50, 0.75]:
            pos = round(duration * pct, 1)
            peaks.append({
                "start_secs": pos,
                "end_secs": round(pos + FALLBACK_DURATION, 1),
                "duration_secs": FALLBACK_DURATION,
                "score": 0.3,
                "start_formatted": fmt(pos),
                "end_formatted": fmt(pos + FALLBACK_DURATION),
            })
    else:
        peaks.append({
            "start_secs": 0.0,
            "end_secs": float(FALLBACK_DURATION),
            "duration_secs": FALLBACK_DURATION,
            "score": 0.3,
            "start_formatted": "0:00",
            "end_formatted": fmt(FALLBACK_DURATION),
        })

# Detect which Eddy river this video is about (per-video, not per-channel — a
# channel may cover many rivers). Match the river name in title + description;
# if several appear, take the first mentioned. No match → river_slug stays empty
# and the clip won't be posted.
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
