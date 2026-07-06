# ClipEngine — Local Runner

Run the Eddy YouTube→Reels pipeline on this machine. Uses the exact repo
scripts in `../scripts/clipengine/`, so captions and branding are identical to
the production GitHub Actions workflow — both paths hand the raw clip to cloud
Remotion (`render-clip.yml`), which brands it and inserts `clip_library`.
`channels.json` here is the single channel list for BOTH the local runner and
the cloud pipeline (the workflow reads it from the repo checkout).

Full operational playbook: [`docs/clipengine-ops.md`](../docs/clipengine-ops.md).

## Add channels

Edit `channels.json` — a JSON array of `{url, river_slug}` objects (bare URL
strings also work). `river_slug` is metadata only; it is NOT drawn on the video.

```json
[
  { "url": "https://www.youtube.com/@SomeChannel", "river_slug": "current" }
]
```

The cloud pipeline (`youtube-clip-pipeline.yml`) reads this same file from the
repo checkout, so committing a channel change to `main` updates both the local
runner and the daily cloud scan — nothing else to sync. (The optional
`instagram` field is used locally for the on-screen credit; the cloud parser
ignores it.)

## Run

```bash
# One specific video, pick heatmap peak #1:
./run-local.sh --url "https://youtu.be/VIDEO_ID" --river current --peak 1

# Scan every channel in channels.json (newest 5 each, up to 3 clips):
./run-local.sh
```

Nothing is written to `output/` (branding is cloud-only) — results land in
Supabase `clip_library` as `pending`; `output/cron.log` has the run logs.

Already-clipped videos are skipped *before* any download (video-level dedup
against `clip_library`), and skips don't count toward `MAX_CLIPS`, so a scan
budget is only spent on genuinely new clips.

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

`load-secrets.sh` pulls them into the environment at runtime. Branding is
cloud-only (Remotion), so these creds + `gh` are **required**: `run-local.sh`
hands each raw clip to `render-clip.yml`, which brands it and inserts
`clip_library`. An optional gitignored `.env` overrides the keychain per-run.

## Requirements

`yt-dlp`, `ffmpeg`/`ffprobe`, `python3`. On a home IP you usually don't need
cookies. If YouTube bot-blocks you, export a Netscape `cookies.txt` and point at
it: `export YOUTUBE_COOKIES_FILE=/path/to/cookies.txt`.

## Format (Remotion `clip-reel` composition)

- 1080×1920 vertical Reel, branded by `render-clip.yml` in the cloud — the same
  composition production uses, so there's no local ffmpeg render to diverge from.
- Dark-teal `#0F2D35` brand frame, `eddy.guide` masthead, transcript captions.
- Clip length is heatmap-driven (12–60s) at the YouTube "Most Replayed" peak, or a
  Tier-1 fallback window when a known river has no heatmap (`TIER1_HEATMAP_OPTIONAL`).
