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

Playback and cover crops are different constraints and must not share one
rectangle:

- `SOCIAL_VIDEO_SAFE` holds separate 1080×1920 UI bounds for Instagram,
  Facebook and TikTok, with a `reel` and `story` profile for each platform.
- `REEL_SAFE` is the conservative intersection used by the single Reel master
  cross-posted to all three platforms. Text, logos, faces, captions and CTAs
  stay inside it. TikTok's profile/action rail gets a 270px right reserve, and
  ruled media cards stay inside that edge so their border is not cut off.
  Instagram's Reel profile also includes the horizontal loss from aspect-fill
  playback on tall phones: a 9:16 master loses about 52 source pixels per side
  in the observed iPhone viewport, so its 120px left inset still presents as a
  deliberate ~60px gutter instead of collapsing against the screen edge. The
  route camera uses the centre of this usable editorial corridor, not x=540,
  so its river and canoe align with the masthead and dock after that crop.
- `STORY_SAFE` is the corresponding intersection for a dedicated Story export.
  Story navigation reserves different top and bottom strips and does not reuse
  the Reel rectangle.
- `SOCIAL_COVER_ASPECT` and `coverGeometry` own profile-thumbnail crops.
  Instagram and TikTok use a centered 3:4 tile; Eddy's Facebook cover artifact
  is square. A cover never borrows Reel or Story UI padding.

The bounds are intentionally conservative working values because native app
chrome can shift. Check Meta's Reels safe-zone template and TikTok Creative
Center when changing them, then refresh the visual baselines.

## Frame zero

Frame 0 is the thumbnail and the first autoplay frame. Every composition's
frame 0 is a complete branded card — masthead, stage, dock — with entrances
that only settle elements by a few pixels. No fade from black, no empty
chart, no late-arriving title. The CI still gate renders frame 0 of every
social composition (`remotion/test/check-stills.sh`).

## Motion

Springs from `remotion/src/lib/spring-presets.ts`. The story animates (the
river scrolls, the gauge fills, the line inks in, the rows slide); the chrome
does not. Where a data post has a CTA, it lands ~70 frames before the end.
Portrait reels dip toward the loop seam with `reelLoopOpacity`.

### Eddy’s Read

The full report (`quote_text`, falling back to the retained public summary)
scrolls continuously upward from the bottom of a clipped reading window. Do
not prepend the separate `eddy_read` interpretation or summarize/truncate the
full report. The complete reel is capped at 30 seconds, including a three-second
ending; short reports finish sooner. Long reports therefore move faster, while
the complete text also remains in the caption for paused reading.

Eddy’s existing condition-mood artwork remains visible beside the reported
condition and gauge height (when available). Water, weather and launch-advice
illustrations mark relevant passages; measurements are emphasized verbatim.
These are topic markers, never invented forecasts or synthetic data charts.
The masthead, mascot and footer remain fixed while the text moves. Browser
measurement after font loading determines the complete scroll distance, so
wrapped names and long reports cannot strand the final lines offscreen.

## Copy

Series labels and CTAs live in `LABELS` and `CTA`. The Float Pick's label is
the same whether the pick is live or the evergreen favourite: the caption says
"Float Pick", so must the art.

A reposted clip has no clickable destination inside the video, so neither its
reel nor its cover draws a fake CTA button. The real CTA stays in the caption
("Download the Eddy River Guide on iOS", `CLIP_CAPTION_CTA` in
`src/lib/social/clip-credit.ts`). The clip's dock carries creator provenance;
an `@handle` there is the creator's Instagram account, and the caption tags the
same handle (`docs/clipengine-ops.md`, *Credit and tagging*). High-water clips
use that same rule and keep their safety guidance as plain information.

Lower docks carry category-specific utility instead of generic filler:
high-water clips show a three-step launch checklist and live-level destination;
Float Picks identify the put-in-to-take-out route alongside time, distance and
conditions. Gauge, Trend and Digest reels retain their own readings, movement
and roundup summaries.

Clip covers are visual-first: the render workflow captures a representative
frame from the unbranded source and stores it as `clip_library.thumbnail_url`.
The cover uses that still before any river artwork fallback. Creator provenance
stays in the Reel dock and caption, where it remains readable instead of being
shrunk into profile-grid text.

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

## Route reel terrain background

Route reels fetch one Mapbox Outdoors v12 static image before workflow dispatch.
The image fills 1080×1920, softened with reduced saturation and a cream wash;
masthead, arrivals, stats, and follow copy retain solid readable surfaces.
The camera stays north-up: a complete overview, a gentle push toward Eddy,
a follow along the river, and a return to the whole route at arrival. `shared/social-terrain-map.ts`
owns the immutable provider framing, the Mercator projection and the shared
image/overlay animation. Stored snapshots retain the original 510px origin
and 410px source stage even when the presentation layout changes. Do not rotate,
re-fit, or smooth the overlay independently. Stop progress retains the source
line's distance convention so markers stay on their correct route vertex.

“Up Next” cards are intentionally removed. They repeated the arrival name only
a moment later. The put-in, actual arrival holds, approximate-feature summary,
and take-out remain; travel shows only mileage progress.

Server configuration: `MAPBOX_ACCESS_TOKEN` with static-image access and
`BLOB_READ_WRITE_TOKEN`, in addition to the existing GitHub dispatch variables.
The server downloads once and uploads an immutable image to Blob; renderer
props carry its URL, never the provider token. A failed map fetch/upload stops
dispatch. Missing route geometry still uses the explicit itinerary layout.
A bundled, unmodified Mapbox logo and text attribution stay in a stationary
row inside the safe area. New static images omit their corner logo to avoid
the rectangular image crop used by the old renderer.

Validation: `npm run test:route-layout` in `remotion`, web terrain-map tests,
and `render:check-stills`. The `social-route-map-layout` fixture uses a labeled
synthetic grid solely to test full-canvas image placement and north-up overlay;
it is **not** a terrain preview. Before rollout, render a real route with the
configured Mapbox account and review opening, travel, arrival and ending frames
for map alignment, terrain/label density, attribution and contrast. This live
provider check remains required; a synthetic visual baseline cannot replace it.


### Float Pick engagement and stop clarity

The opening hook is “Your next [distance]-mile float”, followed by the river
and put-in → take-out names. Favorites may keep their supplied editorial hook.
The actual Eddy canoe stays legible as the map follows. Mileage occupies one
fixed location throughout the trip. Geographic lines may extend beneath the
platform rail, while the active canoe and information cards stay in the safe
corridor.

Intermediate stops hold for two seconds. Symbols represent access, campground,
spring, POI and hazard; Start and Finish identify the endpoints. Never use A/C/S
initials, which look like sequential stop labels. Each callout shows the place
name and distance from launch, without a second absolute mile-marker scale.
Existing per-place photos can accompany the stop; preserve agency attribution
when supplied, and fall back gracefully when an optional photo fails. No
unrelated river image may stand in for a named place.

Time, distance, conditions and the prepared-at timestamp remain visible in the
compact stats panel. The final three seconds return to the overview and show
“Save this float” and “Plan it on the Eddy app” as text, with no simulated
clickable button or competing follow prompt. A route with one intermediate stop
runs for 14 seconds; additional stops retain their own reading time.

The `social-route-grassy-bee` fixture preserves the Sep 27, 2026 recorded route,
its real immutable terrain snapshot, and existing place images. It is historical
preview data, not a current condition report. Camera tests check image/overlay
alignment and canvas coverage at every frame. Still checks include the middle
stop's photo and the final app CTA as well as long names, missing geometry and
approximate-feature summaries. Regenerate existing MP4s after deployment;
changing the renderer does not update previously created posts.

### Route reel layout collision protection

The masthead, mileage row, flexible map viewport, and lower information stack
share one CSS grid. Stop cards size themselves for wrapped titles, photos and
photo credits; the map uses the remaining space. The stats and closing CTA
stay anchored while a stop card reveals or collapses. Both the terrain image
and route overlay use the measured viewport, including Remotion Studio scale,
so moving a card cannot misalign the map or crop Eddy into the mileage row.

Only river strokes inherit the edge fade. Endpoint labels remain opaque and
clear the canoe's silhouette while it passes; both return in the opening and
closing overview. The complete route, estimate and “Plan it on the Eddy app”
remain in the final hold.

`social-route-black-river` reproduces the Oct 1 Mill Spring → Markham Springs
route and terrain. Its photo is an explicit synthetic fixture, not a location
photo. `npm run test:route-browser` checks actual DOM bounds at every frame of
that reel and samples the other route compositions, including missing geometry,
long names and a wrapped photo credit. It runs in Remotion CI alongside the
still comparisons; refreshing a screenshot cannot silently approve a collision.
