# Home-base river board

> **Status: implemented.** Device verification on the partner's monitor is
> **unconfirmed**, and so is Pine Valley's own location (see [Open items](#open-items)).

`/embed/board/<id>` is a self-running portrait wall display for a lodging
partner: the rivers around one place, read from where the guests are staying.
Pine Valley at Dillard Mill (`/embed/board/pine-valley`) is the first board.
Unlike the landscape [River Window](river-window.md) and the
[Missouri mills collection](missouri-mills.md), it is a dashboard. It is laid
out for a widescreen monitor turned on its side.

## Layout

A canvas 1080 wide, scaled to the screen, so a 4K panel gets the same layout
at 2×. Type sizes are wall-distance sizes at 1080 wide. The height follows the
screen (`boardLayout`):

- **9:16, or wider** (1080 × 1920, 4K, a 16:10 panel): the 1920-tall design,
  with bars at the sides on a wider screen.
- **Taller than 9:16** (a 21:9 monitor on its side, e.g. 1080 × 2560): the
  board grows to fill the height instead of leaving bars at the top and
  bottom. The first 174px adds the **forecast** card (when a forecast is
  available). The rest grows the **map**, half above and half below, so it
  shows more of the region: the Meramec running to the Mississippi, and the
  Current and Black heading south toward Arkansas. The map grows at most
  `2 × reliefPad` (520px for Pine Valley), the extent of the baked relief and
  geometry. Beyond that the board is centred.

From the top:

1. **The place's mill painting, full bleed**, fading into the paper. The
   partner's logo and the board's title sit on framed plaques over it. The
   doorstep river's rated reading is on the mill's own sign, using the board
   rectangle from `mill-scenes.ts`; it appears nowhere else on the hero.
   The painting's **water moves**: the millpond ripples with glints drifting
   downstream, the falls rush with foam, and where they land, rings spread
   across the pool and mist rises.
2. **At the door**: the doorstep river's name, condition badge, trend and
   other-unit reading; how today's flow compares with the same date in past
   years, and the water temperature; and **Eddy's take** in a small bubble
   beside the otter.
3. **The map**: the board's rivers in their condition colours with flow
   animated downstream, gauge readings in framed tags, rings every 10 miles,
   an approximate drainage divide, and the place marked with the partner's
   logo. Below it, the **spotlight** strip: one river's condition, tip and
   drive time, with a QR code to that river's eddy.guide page.
4. **Farther afield**: the other rivers, nearest first, with seven days of
   flow over a strip of the condition at each step, the rated reading and
   drive time.
5. **Forecast** (tall screens only): four days from
   `/api/weather/<doorstep>/forecast`, refreshed hourly, labelled with the
   forecast's own place. A rain chance of 40% or more is in coral, Eddy's
   rain-coming threshold.
6. **Footer**: sunrise and sunset, the Eddy credit and a QR code to Eddy's app
   page tagged with the partner's campaign.

Alignment: content placed directly on the page sits 48px from both edges;
content inside a card sits 79px from both edges (48 + 3px frame + 28px
padding). Sections are 24px apart.

Design system: Eddy's light Organic Brutalist tokens (`.stitch/DESIGN.md`),
condition colours only from `shared/condition-system.ts`, chart ink in the
embed data teal. The partner's brand appears only as their logo files.

## Behaviour

- **Loop.** Spotlight each river for 9 seconds, nearest first; replay the past
  seven days in about 15 seconds; hold on the week's summary for 6 seconds;
  repeat. Tapping a row (on a touchscreen) jumps the spotlight.
- **The replay is rated.** Every past reading is classified with Eddy's own
  ladder (`classifyReading` from `shared/condition-ladder.ts`, strict unit)
  using each river's primary-gauge thresholds from `/api/gauge-thresholds`, so
  each line wears the condition Eddy would have given it at that hour. A
  reading with no rating is warm stone, never a condition colour. The map's
  title turns into a coral-dotted "Past 7 days · <time>" chip, so the past is
  never mistaken for the present, and the key lists only the conditions on
  screen. Line width still shows flow against the river's own week.
- **The week's moments** are written from the data (`weekStory`): each
  river's sharpest six-hour rise of 15% or more, and its latest change of
  condition. They play as captions at their moment ("Tue 3 pm: Huzzah up 21% in
  6 hours"), and the summary ("This week: Jacks Fork rose 78%, the most on the
  board") holds after the replay. A rise of 3% or more in a step sends a bright
  pulse down the river. Rivers rated from another row's gauge are not told or
  pulsed twice.
- **Compared with usual** comes from `/api/gauges/<site>` (`seasonalContext`),
  worded and coloured with Eddy's flow bands (`shared/flow-band.ts`): a
  comparison, never a verdict, so never in condition colours. **Water
  temperature** from the same payload is shown only if observed within six
  hours. A river rated from another river's gauge says so.
- **Data.** `/api/rivers` every 5 minutes, `/api/eddy-update/<doorstep>`
  every 15, `/api/gauges/<site>/history?days=7` and `/api/gauges/<site>` every
  30, the forecast hourly, `/api/gauge-thresholds` every 6 hours. Readings use the
  River Window's rules (`toWindowSign`): the rated unit, staleness that drops
  the condition, the last good snapshot kept and marked when a refresh fails.
  A river missing from the snapshot is left out; another river's reading is
  never shown in its place. Two rivers rated from one gauge say so.
- **Eddy's take** is shown only when its snapshot matches the current
  condition and reading (`conditionSnapshotMatches`, the RiverCard rule).
  Otherwise the bubble is hidden.
- **QR codes** are drawn on the server, as on `/app` and `/river-map`. River
  pages carry Apple's Smart App Banner, so an iPhone scan offers **Open** in
  the Eddy app or **Get** from the App Store. Universal links do not claim
  `/rivers/*` (see `apple-app-site-association.ts`).
- **Moving water.** Only inside the board's water polygons (`water.pool`,
  `water.falls` in the config, in % of the artwork), so rocks, banks, the mill
  and its sign stay still. Each region is a small box (`artRegion`) holding a
  copy of the painting run through an animated SVG displacement filter, with a
  tiled glint or foam layer that slides exactly one tile per loop, so there is
  no seam. Regions sit under the hero's fade. They are separate from the Mills
  display's subtler `water` region in `mill-scenes.ts`.
- **Always-on screen.** The canvas drifts a few pixels over ten minutes, and
  dims between sunset and sunrise at the place. Hidden tabs stop the loop.
  Reduced motion (or `?motion=off`) skips the replay, leaves the painting's
  water still, and stops the drift and flow animation.

## Adding a board

A board is one `HomeBaseConfig` in `src/lib/display/home-base.ts`: the place,
its logo, its doorstep river and mill scene with the painting's water polygons, the rivers with drive times and
one factual tip each, the map frame, gauge tag sides, label positions and the
divide. `home-base.test.ts` fails if a configured river has no line or label,
if the mill scene does not exist, or if the logo or relief file is missing.

- **River lines** live in a geometry module (`home-base-geometry.ts` for Pine
  Valley), generated from Eddy's river geometry with the read-only query in
  its header. They must reach past the frame grown by `reliefPad`.
- **Relief**: `npx tsx scripts/build-board-relief.ts <id>` writes
  `public/display/<id>/relief.jpg` in the board's map frame, extended by
  `reliefPad` above and below, from public SRTM
  terrain tiles, the same source as `scripts/build-mo-hillshade.ts`.
- **Drive times**: road routing from the place to each river's nearest
  approved access point, rounded to 5 minutes, stored in the config. They do
  not change with the river, so the board never calls a router.

## Open items

- **Pine Valley's coordinates.** The board places the cabin at Dillard Mill
  State Historic Site until the owners supply the cabin's location. The
  marker, the distance rings and the drive times all follow from it.
- **Drive times** came from the public OSRM demo router (car profile) on
  2026-11-04. They are longer than a local would quote for some rivers, as
  the nearest access is sometimes down gravel. Check them with the owners.
- **Device check.** Not yet run on the partner's monitor and player. Confirm
  that the full-screen browser keeps the screen awake and that both QR codes
  scan from where guests stand.
