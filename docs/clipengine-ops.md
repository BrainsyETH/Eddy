# ClipEngine — Operations Playbook

The YouTube→Reels pipeline: scan paddling channels, clip the "Most Replayed"
peak, brand with Remotion, gate with brand-check, auto-post to FB/IG.

**This doc is the single source of truth for how the pipeline behaves.** Any PR
that changes pipeline behavior must update this doc in the same PR. Agent- and
machine-specific notes (operator role, cron job names, keychain) live in the
operator's workspace, not here.

## The three surfaces

| Surface | What it is | Runs |
|---|---|---|
| `clipengine-local/` | Local runner on the operator's Mac (`run-local.sh`) | Local cron, twice daily |
| `.github/workflows/youtube-clip-pipeline.yml` | Cloud scan (same scripts) | Daily 13:00 UTC |
| `.github/workflows/render-clip.yml` | Remotion branding + `clip_library` insert | Dispatched by both paths, always from `main` |

Shared logic lives in `scripts/clipengine/` (`scrape-heatmap.sh`,
`extract-clip.sh`, `detect-river.sh`, `detect-paddling.sh`,
`vtt-to-captions.py`) so local and cloud behave identically.

The local clone self-updates to `origin/main` before every run (PR #739,
`NO_SELF_UPDATE=1` to skip) — **the repo is the source of truth; never rely on
local-only edits to the pipeline scripts.**

## Full flow

```
channels.json → title gate (river / paddling topic; detect-flood → high_water) → video-level dedup
  → scrape-heatmap (peaks, river detect, Tier-1 fallback)
  → extract-clip (windowed download, 12–60s at the peak)
  → upload raw to Vercel Blob → dispatch render-clip.yml
  → Remotion clip-reel brand → clip_library (brand_check_status=pending)
  → /api/cron/brand-check-pending (13:00 & 23:00 UTC, Claude vision) → approved/review/rejected
  → /api/cron/post-clip (14:00 & 00:00 UTC) posts OLDEST unused approved clip → FB+IG
    (records social_posts row with post_type=river_highlight, marks used_in_posts)
```

Production is decoupled from posting (commit `c5b488b3`): scans just fill the
backlog; the two Vercel crons drain it. Empty backlog → post-clip is a no-op —
**watch approved-unused depth**. Admin "Send" (`POST /api/admin/clips/post`) is
the manual override, same `publishClip()` (`lib/social/clip-poster.ts`).

## Channels — one source of truth

`clipengine-local/channels.json` (`{url, river_slug, instagram}` objects; bare
URL strings also work) drives **both** the local runner and the cloud pipeline —
the workflow reads it from the repo checkout. Commit to `main` and both paths
pick it up. There is no `YOUTUBE_CHANNELS_JSON` secret anymore.

- `river_slug` is a per-channel default; river is otherwise detected per-video
  from the title (`detect-river.sh`).
- `instagram` is the credit @handle (local runner threads it through; the cloud
  path credits the channel name).

## Dedup

Two layers, both against `clip_library`:

1. **Video-level, before any download** (scan loops in both `run-local.sh` and
   the workflow): `youtube_video_id` already has a clip → skip. Costs one REST
   call; does **not** count toward `MAX_CLIPS`. Fails open on API errors.
2. **Exact video+start backstop** in `clipengine-local/handoff-clip.sh` (guards
   manual `--url`/`--peak` runs and races). Exits **3** on dupe so the caller
   can tell "skipped" (3) from "dispatched" (0) and real failures (≠0,3);
   neither dupes nor failures count toward `MAX_CLIPS`.

## Gates and tiers

- **Title gate:** known river ⇒ Tier 1; else paddling topic
  (`detect-paddling.sh`) ⇒ Tier 2; else skip. (PR #716: river is a soft tag,
  not a gate — Tier-2 clips legitimately have `river_slug` NULL.)
- **Heatmap gate (PR #740):** no "Most Replayed" heatmap ⇒ skip (empirically
  needs roughly 75k+ views). Clip length is heatmap-driven, 12–60s.
- **Tier-1 bypass (`TIER1_HEATMAP_OPTIONAL`, PR #748/#749, ON in prod):**
  known-river videos with no heatmap get ONE synthesized fallback window
  (anchored 30% in, length 10% of runtime clamped to [12,60]s) with
  **`heatmap_score=0.0` as the sentinel**. Tier-2 stays strictly gated. The
  keep/kill metric:
  `SELECT brand_check_status, count(*) FROM clip_library WHERE heatmap_score=0 GROUP BY 1;`
  Flag lives in the workflow scan-job env AND `clipengine-local/.env` — set
  `"0"` in both to revert.
- **River validation:** the cloud path skips clips whose slug isn't in the live
  `rivers` table (8 slugs). The `RIVERS` keyword map is duplicated in
  `scrape-heatmap.sh` + `detect-river.sh` — edit both. Don't add new slugs
  without adding the river to the DB first (orphaned `river_slug` breaks the
  Tier-1 CTA). **Exception:** `high_water` clips (below) are region-agnostic and
  bypass this gate.

## Content categories

A clip can carry a `category` that switches its branding and its brand-check
policy. Default (no category) = the normal paddling clip. Today there is one:

**`high_water`** — a flood-safety PSA: dramatic high-water / flood-stage footage
branded to sell Eddy's core value, *know your river levels before you go.*

- **Detection:** `scripts/clipengine/detect-flood.sh` tags a title `high_water`
  (flood / high-water / carnage / swim / near-miss keywords). It **excludes**
  titles signalling a fatality or serious injury, so the PSA never rides on a
  death — brand-check is the visual backstop on the footage itself.
- **Branding:** orange "HIGH WATER" eyebrow, warning accent, and the CTA
  "Know your river levels — check the gauge at eddy.guide" (`remotion/src/lib/brand.ts`,
  `ClipReel.tsx`). Out-of-region clips use a neutral "When Rivers Rise" hero
  instead of a river name.
- **Region-agnostic:** the safety message is universal, so `high_water` clips
  **bypass the river-validation gate** — an unknown/empty river is fine. Every
  other category still requires a known Eddy river.
- **Brand-check policy:** `brand-check-clip.yml` reads `content_type` and, for
  `high_water`, treats dramatic/dangerous-looking high water as EXPECTED (not a
  rejection) while still auto-rejecting injury / body-recovery / fatalities.
- **Storage:** written to `clip_library.content_type`.
- **Threading:** `category` flows scan → `handoff-clip.sh` / dispatch →
  `render-clip.yml` (props + `content_type`). Manual runs:
  `run-local.sh --url <u> --category high_water`, or the `category` input on the
  `youtube-clip-pipeline` / `render-clip` workflows.

### Flood-only source channels

A channel object in `channels.json` can set `"flood_only": true` — the scan then
keeps **only** that channel's high-water uploads (its normal paddling uploads are
skipped). Use it for out-of-region big-water creators whose everyday content
isn't a fit but whose flood clips are. Seeded with `@serrasolsesmedia` and
`@toekneegreen37`.

## Branding

Cloud-only Remotion (`clip-reel` composition), PR #715/#750. `run-local.sh`
hard-requires Blob + Supabase creds + `gh` and never renders locally. Brand
primitives shared across all reels live in `remotion/src/` (`lib/brand.ts`,
`ReelBrandFrame.tsx`, `BrandCTA.tsx`, `ReelMasthead.tsx`). Captions come from
the video transcript via `vtt-to-captions.py`.

## Download efficiency & reliability

- `extract-clip.sh` downloads only the clip window
  (`yt-dlp --download-sections`, ±3s pad) — ~14 MB instead of the full video;
  falls back to a full download when the windowed grab is empty (PR #740).
- Channel listing calls use `--socket-timeout 30 --retries 3` so a stalled
  YouTube connection can't hang a scheduled run for hours.
- **YouTube bot-check is the #1 failure mode on CI** (shared IPs): "Sign in to
  confirm you're not a bot" at info-fetch, run "succeeds" with 0 renders
  dispatched. Fix = refresh cookies: export from a logged-in browser
  (`yt-dlp --cookies-from-browser brave --cookies cookies.txt --skip-download <url>`)
  then `clipengine-local/set-cookies.sh cookies.txt` (deploys to BOTH the local
  keychain and the `YOUTUBE_COOKIES` GitHub secret). Residential IPs usually
  don't need cookies.

## Secrets (locations only — never commit values)

- Local: macOS keychain, service `eddy-clipengine` (`SUPABASE_URL`,
  `SUPABASE_KEY`, `BLOB_READ_WRITE_TOKEN`, Meta creds); `load-secrets.sh`
  loads them, `set-secret.sh` stores them. Optional gitignored
  `clipengine-local/.env` for toggles only.
- Cloud: repo Actions secrets (`NEXT_PUBLIC_SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `BLOB_READ_WRITE_TOKEN`, `YOUTUBE_COOKIES`,
  optional `GH_PAT`).
- Supabase project: FloatMe (`ilefwfpvphadsbptiaur`).

## Health checks

```sql
-- Backlog depth (keep ≥ 2–3 so both daily post windows have ammo):
SELECT count(*) FROM clip_library
 WHERE brand_check_status='approved'
   AND (used_in_posts IS NULL OR used_in_posts = '{}');

-- Is anything new arriving? (newest insert should be recent)
SELECT max(created_at) FROM clip_library;

-- Are clips actually posting? (clip posts are river_highlight)
SELECT max(created_at) FROM social_posts WHERE post_type='river_highlight';
```

Signals that the pipeline is stalled even though workflows are "green":
`youtube-clip-pipeline` finishing in ~2 min with "0 render(s) dispatched"
(bot-check), `render-clip.yml` not dispatched for days, backlog at 0.

## Diagnosing a dry backlog

1. Cloud run logs: bot-check errors? → refresh cookies (above).
2. Local `clipengine-local/output/cron.log`: hangs, 403s, "already in
   clip_library" churn?
3. Both healthy but zero candidates → the heatmap gate is starving the funnel:
   consider more high-traffic channels, or more small Tier-1 river channels
   (the bypass makes them productive).
4. Refill on demand (safe anytime — posting stays gated). A full scan re-walks
   every channel and heatmap-scrapes each Tier-2 candidate (a `yt-dlp -J` per
   video — slow), so prefer a targeted mode when you know what you want:
   - Whole list: `cd clipengine-local && VIDEOS_PER_CHANNEL=20 MAX_CLIPS=15 ./run-local.sh`
   - One channel only (e.g. a newly-added source):
     `./run-local.sh --channel https://www.youtube.com/@ShowMeCreeks`
   - Hand-picked videos — fastest, no channel scan, and each URL is pre-deduped
     against `clip_library` BEFORE any download:
     `./run-local.sh --urls-file videos.txt`. Each line is a YouTube URL with an
     optional trailing river slug (`<url> current`); `#` comments and blank lines
     are ignored. Add `--category high_water` to tag the whole batch as flood PSAs.
   (yt-dlp has no metadata fetch lighter than `-J`, so the win here is *not
   scanning* + skipping already-clipped videos before the download — not a
   cheaper per-video call.)
