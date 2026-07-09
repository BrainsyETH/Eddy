# Promo reels

Two reels built from **real, live** eddy.guide data:

- **`promo` / `promo-landscape`** (~46s) — 3-feature product promo: hook → live
  river map → river levels → plan a float → CTA.
- **`promo-current` / `promo-current-landscape`** (~31s) — Current River focus:
  hook → **Eddy Says** verdict (native card from `/api/eddy-update/current`) →
  plan the float (Akers → Pulltite) → CTA.

Both share the scaffold, media/Ken-Burns, captions, music bed and voiceover
pipeline below. `npm run promo:render` renders all four.

## Render it

```bash
# 1. Refresh the hero screenshots from the live site (Puppeteer)
npm run promo:capture

# 2. Render both orientations -> remotion/out/promo-vertical.mp4 + promo-landscape.mp4
npm run promo:render
```

`render-promo.sh` auto-resolves Puppeteer's cached Chrome and passes it as
`--browser-executable`, so rendering works even when Remotion can't download its
own headless browser (TLS-intercepted networks). Preview live in the Studio with
`npm run video:studio` (compositions `promo`, `promo-landscape`).

## Where things live

| Piece | File |
| --- | --- |
| Scene list, narration, timing | `src/lib/voiceover.ts` → `promoScenes` |
| Top-level composition | `src/compositions/PromoFull.tsx` |
| Shared beat frame (portrait + landscape) | `src/compositions/promo/PromoScaffold.tsx` |
| Chromed Ken-Burns media (+ `HighlightRing`) | `src/compositions/promo/PromoMedia.tsx` |
| Beats | `src/compositions/promo/Promo{Hook,LiveMap,Levels,Plan,CTA}.tsx` |
| Captions per beat | inside each beat file (`CAPTIONS`) |
| Asset capture | `scripts/capture-promo.mjs` |
| Screenshots | `public/screenshots/promo/*.png` |

The "plan a float" shot is deep-linked to a **computed** Akers Ferry → Pulltite
Spring float (`/plan?river=current&putIn=…&takeOut=…`) so it shows real distance,
time and condition — no expired demo plan. Access-point IDs come from
`/api/rivers/current/access-points`.

## Voiceover

On by default — OpenAI `gpt-4o-mini-tts`, voice **`marin`** (its most natural,
human-sounding voice; `coral`/`sage` are good fallbacks). Each beat plays its
narration and the music ducks under it; beat lengths are sized to the measured
clip durations so nothing is clipped, and `AutoCaptions` spreads each beat's
caption phrases across its voiceover automatically.

For an even more natural read, ElevenLabs / Cartesia / Hume beat any OpenAI voice
— swap the provider in `generate-promo-vo.ts` (it's just an HTTP call) and keep
the rest of the pipeline.

Regenerate the narration (single source of truth = `promoScenes` in
`voiceover.ts`):

```bash
OPENAI_API_KEY=sk-... npx tsx scripts/generate-promo-vo.ts     # writes promo-0{1..5}-*.mp3
```

It uses `curl` (macOS Secure Transport) rather than Node fetch, which fails on
TLS-intercepting networks. If you change a script's wording, regenerate, then
re-measure with `ffprobe` and update that scene's `voDuration` in `voiceover.ts`
so the beat still matches the audio. Prefer your own voice? Drop MP3s named per
`promoScenes[].audioFile` into `public/audio/voiceover/`.

Music-only cut: render with `--props '{"voiceover":false}'` (the bed comes back
up to full).

## Live map motion

The map beat can play a real screencast of the live map (the painted rivers'
flow animation) instead of a still:

```bash
CLIP_ONLY=true node scripts/capture-promo.mjs     # writes public/video/promo-map.mp4
./scripts/render-promo.sh --map-clip video/promo-map.mp4
```

`PromoFull`'s `mapClip` prop swaps the still for a looping `<OffthreadVideo>` in
the map beat only; the Ken-Burns push-in still rides on top, so the frame both
zooms and shimmers.

Capture notes (learned the hard way): synthetic **mouse** drags/zooms time out on
this heavy WebGL page (`Input.dispatchMouseEvent timed out`), so the capture uses
a **static camera** — it just grabs frames of the live flow animation, then
ffmpeg mirrors them into a **seamless forward+reverse palindrome** so the loop has
no seam. `CLIP_FRAMES` (default 165) sets the capture length; the palindrome
doubles it. Launch uses `protocolTimeout: 120000` for the same reason.

## Music

`background-music.wav` (~18.7s) has ~1.7s of trailing silence, so looping it left
an audible gap at every repeat. Instead the promo plays `promo-music-bed.wav` — a
gapless ~65s bed made by trimming that silence and crossfade-concatenating the
loop. It's longer than the promo (no loop needed), under a fade-in/out envelope,
ducked to ~5.5% below narration. Rebuild it if the source track changes:

```bash
cd public/audio
ffmpeg -y -i background-music.wav -af "atrim=0.20:16.90,asetpts=N/SR/TB" _loop.wav
ffmpeg -y -i _loop.wav -i _loop.wav -i _loop.wav -i _loop.wav -filter_complex \
  "[0][1]acrossfade=d=0.6:c1=tri:c2=tri[a];[a][2]acrossfade=d=0.6:c1=tri:c2=tri[b];[b][3]acrossfade=d=0.6:c1=tri:c2=tri[out]" \
  -map "[out]" promo-music-bed.wav && rm _loop.wav
```
