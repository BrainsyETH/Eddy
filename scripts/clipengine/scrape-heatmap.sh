#!/bin/bash
# scrape-heatmap.sh — Extract YouTube heatmap (Most Replayed) data
# Finds the most-watched moments in a video for clip extraction.
#
# Usage: ./scrape-heatmap.sh <youtube-url> [output-dir]
# Output: heatmap-data.json in output-dir
#
# Ported from ClawsifiedInfo/workspace/scripts/scrape-youtube-heatmap-ytdlp.sh

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

# Fetch video page and extract heatmap + metadata
python3 << PYEOF
import json, re, sys, os
import urllib.request

video_id = "$VIDEO_ID"
url = f"https://www.youtube.com/watch?v={video_id}"
output_dir = "$OUTPUT_DIR"

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}

try:
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=15) as resp:
        html = resp.read().decode("utf-8", errors="replace")
except Exception as e:
    print(f"❌ Failed to fetch video page: {e}")
    sys.exit(1)

# Extract title
title_match = re.search(r'"title"\s*:\s*"([^"]+)"', html)
title = title_match.group(1) if title_match else "Unknown"

# Extract duration
dur_match = re.search(r'"lengthSeconds"\s*:\s*"(\d+)"', html)
duration = int(dur_match.group(1)) if dur_match else 0

# Extract view count
views_match = re.search(r'"viewCount"\s*:\s*"(\d+)"', html)
views = int(views_match.group(1)) if views_match else 0

# Extract channel name
channel_match = re.search(r'"ownerChannelName"\s*:\s*"([^"]+)"', html)
channel = channel_match.group(1) if channel_match else "Unknown"

print(f"  Title: {title}")
print(f"  Duration: {duration}s")
print(f"  Views: {views:,}")
print(f"  Channel: {channel}")

# Look for heatmap markers
heatmap_data = []
heatmap_match = re.search(r'MARKER_TYPE_HEATMAP.*?heatMarkers.*?\[(.*?)\]', html, re.DOTALL)

if heatmap_match:
    markers_raw = heatmap_match.group(1)
    # Extract individual marker data points
    markers = re.findall(
        r'"heatMarkerRenderer"\s*:\s*\{[^}]*"timeRangeStartMillis"\s*:\s*(\d+)[^}]*"markerDurationMillis"\s*:\s*(\d+)[^}]*"heatMarkerIntensityScoreNormalized"\s*:\s*([\d.]+)',
        markers_raw
    )

    if markers:
        for start_ms, dur_ms, intensity in markers:
            heatmap_data.append({
                "start_ms": int(start_ms),
                "duration_ms": int(dur_ms),
                "intensity": float(intensity),
            })

source = "heatmap"
peaks = []

if heatmap_data:
    print(f"  Heatmap: {len(heatmap_data)} data points found")

    # Use sliding window (13s) to find top engagement peaks
    CLIP_DURATION = 13
    window_ms = CLIP_DURATION * 1000
    best_windows = []

    for i in range(len(heatmap_data)):
        start = heatmap_data[i]["start_ms"]
        end = start + window_ms
        score = sum(
            m["intensity"] for m in heatmap_data
            if m["start_ms"] >= start and m["start_ms"] < end
        )
        best_windows.append((start, end, score))

    # Sort by score descending, pick top 5 non-overlapping
    best_windows.sort(key=lambda x: x[2], reverse=True)
    selected = []
    for start, end, score in best_windows:
        # Ensure no overlap with already selected
        overlap = False
        for s, e, _ in selected:
            if start < e and end > s:
                overlap = True
                break
        if not overlap:
            selected.append((start, end, score))
            if len(selected) >= 5:
                break

    # Sort by time for cleaner output
    selected.sort(key=lambda x: x[0])

    for start, end, score in selected:
        start_s = start / 1000
        end_s = end / 1000
        peaks.append({
            "start_secs": start_s,
            "end_secs": end_s,
            "duration_secs": CLIP_DURATION,
            "score": round(score, 3),
            "start_formatted": f"{int(start_s//60)}:{int(start_s%60):02d}",
            "end_formatted": f"{int(end_s//60)}:{int(end_s%60):02d}",
        })
else:
    print("  ⚠️  No heatmap data — using fallback positions")
    source = "fallback"

    # Chapter markers fallback
    chapter_match = re.findall(r'"chapterRenderer".*?"timeRangeStartMillis"\s*:\s*(\d+)', html)
    if chapter_match and len(chapter_match) >= 3:
        source = "chapters"
        chapter_starts = [int(ms) / 1000 for ms in chapter_match]
        for cs in chapter_starts[:5]:
            peaks.append({
                "start_secs": cs,
                "end_secs": cs + 13,
                "duration_secs": 13,
                "score": 0.5,
                "start_formatted": f"{int(cs//60)}:{int(cs%60):02d}",
                "end_formatted": f"{int((cs+13)//60)}:{int((cs+13)%60):02d}",
            })
    else:
        # Evenly spaced fallback at 25%, 50%, 75%
        for pct in [0.25, 0.50, 0.75]:
            pos = duration * pct
            peaks.append({
                "start_secs": pos,
                "end_secs": pos + 13,
                "duration_secs": 13,
                "score": 0.3,
                "start_formatted": f"{int(pos//60)}:{int(pos%60):02d}",
                "end_formatted": f"{int((pos+13)//60)}:{int((pos+13)%60):02d}",
            })

result = {
    "video_id": video_id,
    "title": title,
    "channel": channel,
    "duration_secs": duration,
    "view_count": views,
    "source": source,
    "peaks": peaks,
}

outpath = os.path.join(output_dir, "heatmap-data.json")
with open(outpath, "w") as f:
    json.dump(result, f, indent=2)

print(f"")
for i, p in enumerate(peaks):
    print(f"  Peak {i+1}: {p['start_formatted']} → {p['end_formatted']} (score: {p['score']})")

print(f"")
print(f"✅ Heatmap data saved to {outpath}")
PYEOF
