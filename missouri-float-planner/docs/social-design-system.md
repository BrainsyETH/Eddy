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

Every panel on a reel is one of these. Reel component → cover twin (the
twins now serve only the trend and clip covers; the other covers use the
editorial layout in *Covers* below).

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
- `REEL_SAFE` is the conservative intersection used by shared Reel masters
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
- Float Pick selects a destination with `platform` and a `placement` of `reel`
  or `story`. Reels use 800px (Instagram), 860px (Facebook), or 750px (TikTok)
  content widths instead of the shared 690px column. Meta Story exports use
  960px. Unlabelled exports keep the shared fallback. These are existing
  organic-playback working bounds, not universal ad-safe guarantees. All
  layers use the same layout origin, including the terrain camera and credits.
- The Float Pick footer crossfades compact stats into the final CTA in one fixed
  slot. Photo reveals use a taller image, readable captions, and the shared
  card border/shadow. Good smaller photos receive sandbar side matting on wider
  cards instead of being upscaled or replaced with a thumbnail.
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

## Covers

A cover is not a miniature of its reel. People meet a Reel as a small 3:4
tile in a three-column profile grid, so the cover's only job is to earn the
tap; distance, conditions, access details and the plan link belong to the
reel and the caption. Rules live in `src/lib/social/cover-plan.ts` (pure,
tested in `cover-plan.test.ts`); `EditorialCover` in
`src/lib/og/social-cover.tsx` draws them.

**Hierarchy:** one grounded headline, one visual, river + location, a small
Eddy mark (the otter and wordmark, once, top-left, with the series label). No
stat tiles, cards, buttons or tiny numbers. The headline is always Fredoka at
104px (87px on the square), so the grid reads as one publication; it sits
upper-left or lower-left, wherever the art leaves quiet room. Everything
essential stays inside the centered 3:4 crop (y 240–1680 on 1080×1920), which
also keeps it clear of the 9:16 view's edges; Facebook gets the same layout
on its 1080 square.

**Three treatments**

| Treatment | Used by | Art |
| --- | --- | --- |
| Photo | Float Pick (live and Trip Idea), Weekend Forecast | A catalogued public-domain photo of that river, full bleed, with a scrim only behind the text |
| Illustration | Tips, Eddy's Read, weekend Read, digest — and any photo cover without a usable photo | Eddy's otter art on teal, sand or cream with river strokes; three compositions rotate |
| Conditions | High-water, easing, recovery and storm alerts | The dark severity surface and one big observation (the pinned gauge reading) |

The trend cover (retired from scheduling) and the clip cover (already the
clip's own frame) keep their earlier layouts. The AI `og_backgrounds` art is
no longer used by these covers; only the clip cover still falls back to it.

**Headlines say only what the data supports.** Float Picks use the first of
four patterns that fits: the real endpoints ("Big Tree to Gooseneck"), a
spring at least 2 mi inside both ends ("Past Welch Spring" — the guidebook's
spring miles can be off by about that much), the guide's own section name
(Trip Ideas), or "Float the Current". Alerts state the observed transition
("The Caddo is running high", "…is coming down", "…is floatable again").
Never "perfect", "best", or a time of day inferred from float length. 3–7
words is a guideline the preview flags, not a rule.

**Photos.** `src/data/social-cover-photos.json` is the whole system: being
listed is the suitability flag. An entry is public domain (checked on its
Commons page), shows that river's water or scenery (not a ramp, sign or
parking lot), holds the headline in its `textZone`, and points at a bounded
JPEG on upload.wikimedia.org. The test suite checks the license, host, river
and fields. A photo cover adds "📷 Cover photo: {author} (public domain, via
Wikimedia Commons)" to the caption. A river with no entry, or a photo that
fails to load or isn't JPEG/PNG, gets the illustration — never a weaker photo.

**Variety, without a recommendation engine**

- Float Pick selection (`pickByRiver` in `section-picker.ts`): the existing
  eligibility rules choose the candidates (floatable river, 5–9 mi, car
  access, a float-time estimate). Each eligible river then gets one turn —
  previously each *section* did, so the Current's 42 access points made it
  10 of 13 posts. The previous Float Pick's river is skipped when another
  eligible river exists. Warnings don't count against a river's next pick.
- Cover art: a photo not used in the last nine Instagram covers wins; when all
  of a river's photos were used, the one used longest ago returns.
- History is read best-effort from the last nine Instagram posts made before
  the current UTC day (`river_slug`, and `art=` parsed from `image_url`).
  Old URLs simply contribute less; a failed read is an empty history and
  never blocks a post. Selection and art are seeded by the UTC day, so
  re-running a day's job picks the same float and cover.
- `art=` (`photo.<id>` or `eddy.<n>`) pins the artwork in the cover URL, so
  Meta's later re-crawls render the same image. Pinned covers are cached at
  the CDN for a day.

**Review.** The admin post preview shows the actual rendered cover in a phone-
size profile grid beside the previous eight Instagram covers, with the
route's notes (headline length, grid-size headline, photo credit, why the
illustration was used) from the `X-Cover-Notes` header.

**Measuring it.** Compare per-Reel reach, views, and where Insights has them
watch time and profile visits, normalized by days live, before and after.
Selection and covers changed together, so the comparison is directional.

## Motion

Springs from `remotion/src/lib/spring-presets.ts`. The story animates (the
river scrolls, the gauge fills, the line inks in, the rows slide); the chrome
does not. Where a data post has a CTA, it lands ~70 frames before the end.
Portrait reels dip toward the loop seam with `reelLoopOpacity`.

### Eddy’s Read

The social Read is a sequence of river scenes, with one spoken phrase visible
at a time. It no longer scrolls an article inside a card. A compact Eddy mark,
large river name and current-condition label identify the active river; a wide
scenic area separates that identity from the larger caption below. Text, the
otter and attribution remain inside the shared Reel safe area. The scenery
alone may reach the canvas edges.

The weekend builder supplies each river's complete retained summary and a
separate, explicitly forecast weekend-weather sentence. It translates display
shorthand into spoken words ("highs up to 73 degrees") and removes repeated
"Latest Read" / "Weekend weather" labels from narration. It does not rewrite,
shorten or drop the saved summary or its qualifications. The full original
reporting, source dates and current-water/forecast distinction remain in the
post caption. Single-river and previously saved props remain supported.

A river may use only its own photo from the existing public-domain cover
catalog, with an author credit and "Not live" label. Missing or failed photos
fall back to Eddy's existing condition art and brand river strokes. This is
scenery, never a visual assertion about today's water. The closing scene uses
canoeing Eddy and the app CTA. No dashboard cards or simulated buttons.

Narration uses the existing Marin voice with an engaged, conversational brief:
varied emphasis and sentence rhythm, purposeful pauses and more deliberate
cautions. It keeps a consistent identity; it is neither an announcer nor a
whispered meditation. Each complete sentence becomes a measured audio clip.
Visual captions are anchored to those sentence boundaries, with phrase timing
estimated within each sentence; they are not word-level karaoke timestamps.
The exact script and river index travel with each clip. Mismatched scene and
narration scripts fail before synthesis. New speech instructions invalidate the
audio cache. Legacy audio without text metadata uses estimated caption timing.

The measured audio determines runtime. Never speed it up, crop it or shorten
source prose to meet an arbitrary duration. The ending holds for at least three
seconds and includes the whole closing voice. The theme bed stays at 3.5% under
normalized speech, with playback speed 1. The footer identifies the AI voice.
Final audio processing preserves this mix.

`test:read-browser` samples phrases and transitions across single-river, long
report and multi-river fixtures, checking retained text, river identity, safe
bounds and footer collisions. `test:read-narration` checks measured clips,
scene identity, caching and rejection of inconsistent scripts. Listening to an
actual newly synthesized Read is still a release check: a changed prompt and
synthetic audio-processing test cannot establish how natural the voice sounds.

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
