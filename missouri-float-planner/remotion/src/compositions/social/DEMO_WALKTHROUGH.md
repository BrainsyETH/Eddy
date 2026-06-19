# Demo Walkthrough — branded cut of the raw screen recording

A tightened, on-brand edit built from one raw screen recording of eddy.guide,
driven entirely by an EDL (edit decision list). It reuses this project's brand
tokens, loaded fonts, Eddy mascot, watermark, and music bed — so it reads as
part of the same render pipeline as the `reel` / `social-*` compositions, not a
bolt-on.

Ported and upgraded from a standalone Remotion prototype. See
[what changed](#what-changed-from-the-prototype).

## Quick start

1. **Drop the recording in `public/`** as `eddy-demo-source.mp4`
   (or pass a different name via `--props='{"sourceSrc":"my-capture.mp4"}'`).
2. **Preview**

   ```bash
   npm run studio          # open the editor; scrub the timeline
   ```

   No footage yet? It renders a **branded storyboard** (one card per clip) so
   you can preview structure first. Pass `--props='{"sourceSrc":""}'` to force
   storyboard mode even after the file exists.
3. **Render**

   ```bash
   npm run render:demo         # 9:16  (~39s)  → out/eddy-demo.mp4
   npm run render:demo:short   # 9:16  (~33s)  → out/eddy-demo-30.mp4
   npm run render:demo:feed    # 4:5   (~39s)  → out/eddy-demo-4x5.mp4
   ```

## Compositions

| id | aspect | size | length | use |
|---|---|---|---|---|
| `demo-walkthrough` | 9:16 | 1080×1920 | ~39s | TikTok / Reels / Shorts |
| `demo-walkthrough-short` | 9:16 | 1080×1920 | ~33s | tighter feed retention |
| `demo-walkthrough-feed` | 4:5 | 1080×1350 | ~39s | Instagram in-feed |

Durations are **derived** from the EDL via `calculateMetadata` — change a
timecode and the runtime updates itself.

## How it's structured

- **`src/lib/demo-edl.ts`** — the only file you normally touch. Each footage
  clip is a source `srcIn`/`srcOut` (seconds), a `speed`, an optional eased
  `ramp`, a `caption`, an `entrance` transition, the `variants` it belongs to,
  and an optional `mascot` pop-in. The accidental iOS share sheet and the Google
  Maps detour are simply never referenced — that's how they get "trimmed".
- **`DemoWalkthrough.tsx`** — maps the EDL to `<Sequence>`s, plays each clip
  full-bleed with `<OffthreadVideo>` (`startFrom`/`endAt` in composition frames
  = seconds × 30), runs transitions, and lays the brand chrome on top.
- **`src/components/DemoCaption.tsx`** — muted-safe lower third (Fredoka + coral
  underline), height-proportional safe area.

## The knobs (per-render `--props`)

| prop | default | notes |
|---|---|---|
| `sourceSrc` | `eddy-demo-source.mp4` | `""` → storyboard mode |
| `variant` | `full` | `short` ≈ :30, `full` ≈ :40 |
| `captions` | `true` | muted-safe lower thirds |
| `music` | `true` | lo-fi bed (`public/audio/background-music.wav`) |
| `hook` | `false` | sung "Eddy dot guide" over the end card — drop `audio/eddy-hook.mp3` and enable |
| `showMascot` | `true` | Eddy pop-ins + end-card wave |
| `videoObjectPosition` | `center` | vertical anchor; source is taller than 9:16, so nudge (e.g. `"center 42%"`) to keep key UI in frame |

Example:

```bash
npx remotion render demo-walkthrough out/promo.mp4 \
  --props='{"variant":"short","videoObjectPosition":"center 40%","music":true}'
```

## Transitions, ramps, captions, mascot

- **Transitions** read off the *next* clip's `entrance`, so both sides of a cut
  animate together: zoom-punch (`zoom`), read→do whip (`whip`), dip-to-brand
  (`dip`). Hand-rolled (no extra deps) and deterministic.
- **Eased speed-ramps** (`ramp: true`): the scroll accelerates into the content
  and decelerates as it lands, instead of a flat fast-forward. Implemented by
  splitting the clip into constant-rate slices along a raised-cosine curve
  (`speed` is the *peak*; `rampMin` the floor) — OffthreadVideo can't vary
  playbackRate per frame, so this is the correct, render-safe equivalent.
- **Captions** keep ≤ 6 words and sit above a height-proportional safe area that
  clears the Reels/TikTok bottom chrome.
- **Mascot** Eddy peeks in on a few beats (`mascot` field) and waves on the end
  card — the brand's connective tissue between cuts.

## Common tweaks

- **Trim to :30** — already done: `demo-walkthrough-short` drops `S5`, `S7`,
  `S10`. To drop a beat from the full cut too, remove its variant tag in the EDL.
- **Hold a beat longer** — lower that clip's `speed` (e.g. `S8` to `0.9`).
- **Re-time after a recapture** — update the clip's `srcIn`/`srcOut`; durations
  re-derive automatically.
- **Brand colors / fonts** — come from `design-tokens/colors.ts` +
  `design-tokens/fonts.ts`. Don't hardcode hexes here.

## What changed from the prototype

The original standalone prototype was architecturally clean but off-brand and
not render-ready. This port keeps its best idea — the EDL as a single source of
truth — and fixes the rest:

- **On-brand**: real `colors` + `fontFamilies`, Eddy mascot, watermark, and the
  shared music bed — instead of invented hexes and an unloaded "Inter" (which
  would have fallen back to system fonts on Lambda).
- **Correct API for this repo's Remotion (4.0.242)**: `startFrom`/`endAt`, not
  the prototype's `trimBefore`/`trimAfter` (which only exist in ≥ 4.0.319 and
  wouldn't have compiled here).
- **Real transitions** (zoom-punch / whip / dip-to-brand) on both sides of a
  cut, not entrance-only transforms.
- **True eased speed-ramps**, which the prototype flagged as unimplemented.
- **Parameterized** via props + `calculateMetadata`: :30/:40 × 9:16/4:5 with no
  code edits.
- **Audio wired** (bed + optional sung hook), **mascot pop-ins**, a **standard
  9:16 canvas** (not 1080×2340), and a **storyboard fallback** so it previews
  and passes CI before the footage lands.
