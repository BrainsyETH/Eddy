# The Eddy social design system

Every social surface Eddy publishes — the Remotion reels, their OG covers, the
clip wrapper — is drawn from one set of tokens and one set of primitives. This
document is the rules; the numbers live in `shared/social-brand.ts`, and the
primitives in `remotion/src/components/` (reels) and `src/lib/og/social-cover.tsx`
(covers).

## Why it exists

The cover is the reel's thumbnail. On Instagram the OG image is passed as the
Reel's `cover_url` (`src/lib/social/meta-client.ts`), so the cover and the
video's first frame sit in the same grid tile. Before this system the covers
were a dark, glow-and-gradient family, the route reel was a light Organic
Brutalist card, and the other reels were a third dialect — all describing the
same post. One token file, imported by both pipelines, is the only thing that
keeps them from drifting again.

## Two layers

1. **The system** (this document, `shared/social-brand.ts`): tones, palette,
   card primitives, type scale, safe zones, copy, motion rules.
2. **Storytelling** per format, built only on the primitives: the scrolling
   river for the Float Pick, the chart for the Weekly Trend, the gauge
   instrument for Eddy Says, stacked river cards for the Digest and Forecast,
   the ruled media card for clips. The river-scroll camera stays specific to
   route-based posts; nothing else scrolls a map.

## Tones

| Tone | Ground | Ink | Used by |
| --- | --- | --- | --- |
| `light` (default) | off-white `neutral-50` | `neutral-900` | Float Pick, Digest, Forecast, Trend, Eddy Says report, ordinary ClipReels, tips |
| `dark` — the severity surface | deep teal `primary-900`, washed faintly toward the condition colour | white | the high-water / all-clear alert family, including high-water ClipReels |

The dark tone is sanctioned, not a fallback: a cream card reads calmer than
high water deserves. An ordinary clip remains an editorial post on the light
canvas, with its footage taking the place of the chart, route or illustration.
Only a severity clip may put the dark chrome over footage and scrims.

## Primitives

Every panel on a reel or cover is one of these. Reel component → cover twin.

- **Page** — `ReelPage` → `CoverPage`. The tone's ground, the body font and
  ink. Optional photo: a faint texture on light, full-bleed under a scrim on dark.
- **Masthead** — `ReelMasthead` → `CoverMasthead`. Series-label pill and the
  `eddy.guide` wordmark on one row, then the hero line (usually the river
  name) and a subtitle. Left-aligned inside the safe zone. Alerts fill the pill
  with the condition colour and put Eddy's condition-mood otter beside the
  wordmark.
- **Card / tile / pill / callout** — `BrandCard`, `StatTile`, `BrandPill`,
  `BrandCallout` → `CoverCard`, `CoverTile`, `CoverPill`. White (light) or
  deep-teal (dark) surface, thick teal rule, hard offset shadow. No glass, no
  glow, no ambient gradients.
- **Dock** — `ReelDock` → `CoverDock`. The bottom card: stat tiles, a detail
  line, the CTA, and the optional follow line beneath.
- **CTA** — `BrandCTA` → `CoverButton`. The coral, black-ruled button. Copy is
  short because the masthead already carries the wordmark. A CTA that points
  at the caption rather than the site ("Full report below ▼") is text, not a
  button.
- **Subtitle** — `Captions` (reels only; covers have no transcript). A spoken
  line over footage is a subtitle, not a fourth panel: a quiet deep-teal wash
  under subtitle-sized body type (`subtitleStyle`, `TYPE.subtitle_media`), no
  rule, no offset shadow, no glow. It must never compete with the masthead
  above it or the dock below it.

Condition colours are the canonical ones from `shared/condition-system.ts`.
As TEXT on the light surface they are pulled toward the ink (`conditionInk`)
so yellow and lime stay legible on cream; as a swatch or pill fill they stay
canonical, with the pill's text colour chosen by luminance (`inkOn`).

## Type

Fredoka for display (labels, titles, numbers in tiles, buttons), Geist for
body, Geist Mono for units, miles and instrument numerals. Sizes are in
`TYPE`. Covers render through Satori, which only has Fredoka and Geist Mono
embedded, so covers set body copy in Fredoka and every arrow, ▲▼ and ° in mono.

## Safe zones

- Reels: `REEL_SAFE` — 250px of Instagram chrome at the top, 420px at the
  bottom, 60px sides. Only a stage may run under the chrome, and it fades out
  at both edges.
- Covers: a portrait cover is cropped to 4:5 in the grid and in-feed, taking
  ~285px off the top AND bottom. `coverGeometry` keeps everything inside that
  band.

## Frame zero

Frame 0 is the thumbnail and the first autoplay frame. Every composition's
frame 0 is a complete branded card — masthead, stage, dock — with entrances
that only settle elements by a few pixels. No fade from black, no empty
chart, no late-arriving title. The CI still gate renders frame 0 of every
social composition (`remotion/test/check-stills.sh`).

## Motion

Springs from `remotion/src/lib/spring-presets.ts`. The story animates (the
river scrolls, the gauge fills, the line inks in, the rows slide); the chrome
does not. The CTA button lands ~70 frames before the end. Portrait reels dip
toward the loop seam with `reelLoopOpacity`.

## Copy

Series labels and CTAs live in `LABELS` and `CTA`. The Float Pick's label is
the same whether the pick is live or the evergreen favourite: the caption says
"Float Pick", so must the art.

A reposted clip has no float page of its own to promise, so its button — on
the reel and the cover — is `CTA.download`, "Get the app →": as short as every
other button, because the masthead already says whose app. The caption spells
out the full line ("Download the Eddy River Guide on iOS",
`CLIP_CAPTION_CTA` in `src/lib/social/clip-credit.ts`). The high-water clip
keeps the gauge CTA. The clip's dock carries the creator credit as its detail
line, beside the button — an `@handle` there is the creator's Instagram
account, and the caption tags the same handle (`docs/clipengine-ops.md`,
*Credit and tagging*).

## Fallbacks are still the system

When PostGIS has no drawable line for a Float Pick, `route-scene.ts` still
fetches the stops and hazards (ordered by mile) and the reel renders its
itinerary stage — the same masthead, dock and pauses, the stops as rows down
a schematic channel. It never reverts to an older card, and an evergreen pick
never claims a live condition. A failed route-point query (not missing
geometry) returns no points at all, so a route is never presented as "what you
pass" with a data source silently missing.

## Changing it

- A token change edits `shared/social-brand.ts` and nothing else.
- A composition change lands with its CI baselines refreshed: run the
  `Remotion Check` workflow with `update_baselines` from the branch. One
  surface per PR keeps the diff readable.
- Verify locally with `npm run render:check-stills` in `remotion/`
  (`REMOTION_STILL_ARGS="--browser-executable=…"` outside the CI image).
