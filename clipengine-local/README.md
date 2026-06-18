# ClipEngine — Local Runner

Run the Eddy YouTube→Reels pipeline on this machine, no cloud. Uses the exact
repo scripts in `../scripts/clipengine/`, so captions and branding are identical
to the production GitHub Actions workflow. The only differences: channels come
from `channels.json` (not the `YOUTUBE_CHANNELS_JSON` secret) and finished clips
are written to `output/` instead of uploaded to Vercel Blob / Supabase.

## Add channels

Edit `channels.json` — a JSON array of `{url, river_slug}` objects (bare URL
strings also work). `river_slug` is metadata only; it is NOT drawn on the video.

```json
[
  { "url": "https://www.youtube.com/@SomeChannel", "river_slug": "current" }
]
```

This is the same format as the `YOUTUBE_CHANNELS_JSON` GitHub secret, so you can
paste this file's contents straight into the secret when you want it running in
the cloud too.

## Run

```bash
# One specific video, pick heatmap peak #1:
./run-local.sh --url "https://youtu.be/VIDEO_ID" --river current --peak 1

# Scan every channel in channels.json (newest 5 each, up to 3 clips):
./run-local.sh
```

Output → `output/<videoId>-peak<N>.mp4`.

## Requirements

`yt-dlp`, `ffmpeg`/`ffprobe`, `python3`. On a home IP you usually don't need
cookies. If YouTube bot-blocks you, export a Netscape `cookies.txt` and point at
it: `export YOUTUBE_COOKIES_FILE=/path/to/cookies.txt`.

## Format (from `finalize-reel.sh`)

- 1080×1920 vertical Reel.
- Vertical source → passed through untouched.
- Landscape source → dark-teal `#0F2D35` frame, video band centered, `eddy.guide`
  watermark on top, transcript captions at the bottom.
- Clip length defaults to 13s at the YouTube "Most Replayed" peak.
