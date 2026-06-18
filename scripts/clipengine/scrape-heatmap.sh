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

CLIP_DURATION = 13
peaks = []
source = "fallback"

# yt-dlp heatmap entries look like {start_time, end_time, value}.
hm = [h for h in heatmap if isinstance(h, dict) and "start_time" in h and "value" in h]
if hm:
    source = "heatmap"
    windows = []
    for h in hm:
        start = float(h["start_time"])
        end = start + CLIP_DURATION
        score = sum(float(x.get("value", 0)) for x in hm if start <= float(x["start_time"]) < end)
        windows.append((start, end, score))
    windows.sort(key=lambda x: x[2], reverse=True)
    selected = []
    for start, end, score in windows:
        if all(not (start < e and end > s) for s, e, _ in selected):
            selected.append((start, end, score))
            if len(selected) >= 5:
                break
    selected.sort(key=lambda x: x[0])
    for start, end, score in selected:
        peaks.append({
            "start_secs": round(start, 1),
            "end_secs": round(start + CLIP_DURATION, 1),
            "duration_secs": CLIP_DURATION,
            "score": round(score, 3),
            "start_formatted": f"{int(start//60)}:{int(start%60):02d}",
            "end_formatted": f"{int((start+CLIP_DURATION)//60)}:{int((start+CLIP_DURATION)%60):02d}",
        })
    print(f"  Heatmap: {len(hm)} points -> {len(peaks)} peaks")

if not peaks:
    print("  ⚠️  No heatmap data — using evenly-spaced fallback positions")
    source = "fallback"
    if duration > CLIP_DURATION * 2:
        for pct in [0.25, 0.50, 0.75]:
            pos = round(duration * pct, 1)
            peaks.append({
                "start_secs": pos,
                "end_secs": round(pos + CLIP_DURATION, 1),
                "duration_secs": CLIP_DURATION,
                "score": 0.3,
                "start_formatted": f"{int(pos//60)}:{int(pos%60):02d}",
                "end_formatted": f"{int((pos+CLIP_DURATION)//60)}:{int((pos+CLIP_DURATION)%60):02d}",
            })
    else:
        peaks.append({
            "start_secs": 0.0,
            "end_secs": float(CLIP_DURATION),
            "duration_secs": CLIP_DURATION,
            "score": 0.3,
            "start_formatted": "0:00",
            "end_formatted": f"0:{CLIP_DURATION:02d}",
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
