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

## Publishing to Facebook / Instagram

This machine does NOT post to social directly. Instead, when publish creds are
present it uploads each finished clip to Vercel Blob and inserts it into Supabase
`clip_library` (`brand_check_status=pending`) — exactly like the cloud
`youtube-clip-pipeline.yml`. The deployed Eddy app then runs its brand-check →
decide → `post-social` flow and publishes approved clips to FB/IG. The review
gate stays intact; inserting a clip does not post it.

Secrets live in the **macOS keychain** (service `eddy-clipengine`), not on disk.
Store them with `set-secret.sh` (value read silently, straight into the keychain):

```bash
./set-secret.sh SUPABASE_KEY          # Supabase service-role key
./set-secret.sh BLOB_READ_WRITE_TOKEN # Vercel Blob read/write token
# SUPABASE_URL is already stored (FloatMe project)
```

`load-secrets.sh` pulls them into the environment at runtime. With all three set,
`run-local.sh` auto-publishes after each render; use `--no-publish` to render only.
`publish-clip.sh` can also run standalone. An optional gitignored `.env` overrides
the keychain per-run if present.

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
