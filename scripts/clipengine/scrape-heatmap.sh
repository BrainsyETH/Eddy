#!/bin/bash
# scrape-heatmap.sh — Extract YouTube heatmap (Most Replayed) data
# Finds the most-watched moments in a video for clip extraction.
#
# Usage: ./scrape-heatmap.sh <youtube-url> [output-dir]
# Output: heatmap-data.json in output-dir
#
# Uses yt-dlp --dump-single-json instead of scraping HTML, which is:
#   - far more robust to YouTube layout changes
#   - able to use cookies to bypass bot checks on CI runners
#
# Auth: set YT_DLP_COOKIES_FILE to a Netscape-format cookie jar.

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

YTDLP_ARGS=(
    --dump-single-json
    --skip-download
    --no-playlist
    --no-warnings
    --retries 5
    --sleep-requests 2
    --extractor-args "youtube:player_client=android,web"
)
if [ -n "${YT_DLP_COOKIES_FILE:-}" ] && [ -f "${YT_DLP_COOKIES_FILE}" ]; then
    YTDLP_ARGS+=(--cookies "$YT_DLP_COOKIES_FILE")
    echo "🔑 Using cookies from $YT_DLP_COOKIES_FILE"
else
    echo "⚠️  YT_DLP_COOKIES_FILE not set — may hit YouTube bot check on CI runners"
fi

INFO_JSON="$OUTPUT_DIR/video-info.json"
if ! yt-dlp "${YTDLP_ARGS[@]}" "$YOUTUBE_URL" > "$INFO_JSON"; then
    echo "❌ yt-dlp failed to fetch video metadata (bot check? refresh YT_DLP_COOKIES)"
    rm -f "$INFO_JSON"
    exit 1
fi

python3 << PYEOF
import json, os, sys

info_path = "$INFO_JSON"
output_dir = "$OUTPUT_DIR"

with open(info_path) as f:
    info = json.load(f)

video_id = info.get("id") or info.get("display_id") or ""
title = info.get("title") or "Unknown"
channel = info.get("channel") or info.get("uploader") or "Unknown"
duration = int(info.get("duration") or 0)
views = int(info.get("view_count") or 0)

print(f"  Video ID: {video_id}")
print(f"  Title: {title}")
print(f"  Duration: {duration}s")
print(f"  Views: {views:,}")
print(f"  Channel: {channel}")

# yt-dlp surfaces heatmap as: [{"start_time": float, "end_time": float, "value": float}, ...]
raw_heatmap = info.get("heatmap") or []
peaks = []
source = "fallback"

CLIP_DURATION = 13

if raw_heatmap:
    print(f"  Heatmap: {len(raw_heatmap)} data points found")
    source = "heatmap"

    # Sliding 13s window over heatmap points to pick top-scoring non-overlapping peaks
    windows = []
    for i, marker in enumerate(raw_heatmap):
        start = float(marker.get("start_time") or 0)
        end = start + CLIP_DURATION
        score = sum(
            float(m.get("value") or 0)
            for m in raw_heatmap
            if float(m.get("start_time") or 0) >= start
            and float(m.get("start_time") or 0) < end
        )
        windows.append((start, end, score))

    windows.sort(key=lambda w: w[2], reverse=True)
    selected = []
    for start, end, score in windows:
        if any(start < e and end > s for s, e, _ in selected):
            continue
        selected.append((start, end, score))
        if len(selected) >= 5:
            break

    selected.sort(key=lambda w: w[0])
    for start, end, score in selected:
        peaks.append({
            "start_secs": start,
            "end_secs": end,
            "duration_secs": CLIP_DURATION,
            "score": round(score, 3),
            "start_formatted": f"{int(start//60)}:{int(start%60):02d}",
            "end_formatted": f"{int(end//60)}:{int(end%60):02d}",
        })
else:
    print("  ⚠️  No heatmap data — trying chapters / even spacing")

    chapters = info.get("chapters") or []
    if len(chapters) >= 3:
        source = "chapters"
        for ch in chapters[:5]:
            cs = float(ch.get("start_time") or 0)
            peaks.append({
                "start_secs": cs,
                "end_secs": cs + CLIP_DURATION,
                "duration_secs": CLIP_DURATION,
                "score": 0.5,
                "start_formatted": f"{int(cs//60)}:{int(cs%60):02d}",
                "end_formatted": f"{int((cs+CLIP_DURATION)//60)}:{int((cs+CLIP_DURATION)%60):02d}",
            })
    elif duration > 0:
        for pct in (0.25, 0.50, 0.75):
            pos = duration * pct
            peaks.append({
                "start_secs": pos,
                "end_secs": pos + CLIP_DURATION,
                "duration_secs": CLIP_DURATION,
                "score": 0.3,
                "start_formatted": f"{int(pos//60)}:{int(pos%60):02d}",
                "end_formatted": f"{int((pos+CLIP_DURATION)//60)}:{int((pos+CLIP_DURATION)%60):02d}",
            })

if not peaks:
    print("❌ No peaks could be derived (no heatmap, no chapters, no duration)")
    sys.exit(1)

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

print("")
for i, p in enumerate(peaks):
    print(f"  Peak {i+1}: {p['start_formatted']} → {p['end_formatted']} (score: {p['score']})")

print("")
print(f"✅ Heatmap data saved to {outpath} (source: {source})")
PYEOF
