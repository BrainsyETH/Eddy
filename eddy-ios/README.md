# Eddy for iOS

Expo app consuming the Next.js backend in `../missouri-float-planner` as a
headless API.

## Running it

```bash
cd eddy-ios
npm install
npx expo start
```

Then scan the QR code with the Camera app and open in **Expo Go**.

Two things that are not optional:

- **`--legacy-peer-deps` is no longer required, and must not be used.** It was,
  and the reason was real: `react-dom` is peer-depended on as `"*"` by `expo`,
  `expo-router`, `@expo/metro-runtime` and `@rnmapbox/maps` and pinned by none of
  them, so npm resolved the newest one, which peer-requires a React past the
  19.2.3 that SDK 57 pins. A plain `npm install` failed outright.

  The flag was the wrong size of fix. It does not skip one bad peer — it skips
  peer installation entirely, which quietly left `react-native-reanimated`,
  `react-native-gesture-handler` and `react-native-worklets` out of the tree.
  The `overrides` block in `package.json` constrains the one offending package
  instead, and `npm install` / `npm ci` both work unflagged. Passing the flag
  now REMOVES packages the app ships.
- **Run commands from inside `eddy-ios/`.** There is deliberately no
  `package.json` at the repo root (see below), so `npx expo` run from the root
  will fetch the latest Expo from the registry instead of using this project's
  pinned SDK 57.

`npx expo start --ios` needs Xcode plus an installed iOS simulator runtime. If
you see `No iOS devices available`, either the runtime is missing
(`xcodebuild -downloadPlatform iOS`) or Xcode is not the selected developer
directory (`sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`).
Note `Simulator.app` lives *inside* `Xcode.app`, so deleting Xcode removes it.

### `react-native-svg could not be found within the project`

Or any other module Metro reports missing right after pulling. It means
`node_modules` predates the `package.json` that needs it — `npm install`.

**A NATIVE module needs more than that.** `react-native-svg` is one (so are
`@rnmapbox/maps` and `react-native-purchases`): autolinking happens when the
native project is generated, so an installed package that is not in the binary
you are running still fails. After installing one, rebuild the client:

```bash
npx expo run:ios          # local rebuild, or
eas build --profile development --platform ios
```

Expo Go bundles `react-native-svg` itself, so the charts work there — but Expo
Go cannot run the Map tab, which is why the dev client exists.

### `Unimplemented component: <RNSVGSvgView>` on a build you did not just make

The same failure, reached from the other direction, and the one that shipped: the
gauge chart came back as an "Unimplemented component" box on TestFlight builds
that were fine the day before.

Nobody had broken the chart. `ios.runtimeVersion` was the string `"1.0.0"`, so
**every** OTA update was compatible with **every** binary that had ever existed.
Adding `react-native-svg` changed the JS bundle and not that string, and the new
JS went out to binaries with no `RNSVGSvgView` view manager. Over-the-air updates
carry JavaScript; they cannot carry a native module.

`ios.runtimeVersion` is now `{ "policy": "fingerprint" }`, matching `android`.
The fingerprint is computed from the native project — dependencies, config
plugins, app config — so adding a native module mints a new runtime version and
old binaries simply stop being offered the update. **Do not put a literal string
back.** When the fingerprint changes, ship a build, not an update.

`GaugeChart`'s `ChartBoundary` is a second net rather than the fix. It catches a
render that *throws*, which is what the New Architecture does here; the old
architecture renders a placeholder view instead and throws nothing, so a boundary
can never be the whole answer. The runtime version is.

### Three ways to run this, and when each applies

| Command | Needs | Use it for |
|---|---|---|
| `npx expo start` | Expo Go on a device | everything except the Map tab |
| `npx expo run:ios` | Xcode + CocoaPods, locally | native modules, i.e. the Map tab |
| `eas build` | an Expo account | builds for testers and the App Store |

`run:ios` prebuilds — it generates the native project and resolves every entry in
`app.json`'s `plugins` before Xcode ever starts. Which leads to the one rule that
is easy to break:

**`plugins` may only list packages that actually ship a config plugin** — one
exporting `app.plugin.js`. That is not the same thing as a dependency, and most
dependencies are not one. Every entry in the current list is valid; you can check
any of them with `ls node_modules/<pkg>/app.plugin.js`.

### `PluginError: Unable to resolve a valid config plugin for …`

Almost always **stale `node_modules`**, not a bad `app.json`.

Prebuild resolves plugins out of `node_modules`, so a checkout whose packages
predate the config will report a perfectly valid plugin as invalid. The SDK 57
upgrade is the case that bites: `expo-status-bar` gained an `app.plugin.js` at
57.0.1 and is correctly listed in `plugins`, but at 3.0.9 (SDK 54) it had none.
Pull the new `app.json` without reinstalling and prebuild looks for a plugin in
the old package and does not find one:

```
PluginError: Unable to resolve a valid config plugin for expo-status-bar.
Error: Stripping types is currently unsupported for files under node_modules,
for ".../expo-status-bar/src/StatusBar.ts"
```

The fix:

```bash
rm -rf node_modules && npm ci
```

Two things make this hard to diagnose, which is why it is written down:

- **`rm -rf ios` does not help**, and it is the natural first instinct. That
  clears the generated native project while leaving the packages prebuild
  actually reads.
- **The second line is a red herring.** It sends people hunting through Node
  versions and TypeScript settings. It appears because the old package's `main`
  points at `src/StatusBar.ts` — Metro compiles that, Node never should — so a
  failed plugin lookup surfaces as a type-stripping error from deep inside Node
  rather than "this package is not a plugin". Changing Node does not fix it.

Only if a reinstall does not clear it is the entry itself wrong — then confirm
with `ls node_modules/<pkg>/app.plugin.js` before removing anything.

### Node version

`.nvmrc` pins **Node 20**, matching what all five CI workflows use
(`.github/workflows/app-ci.yml`), and `package.json` declares
`engines: node >=20 <23`. Run `nvm use` in this directory.

This is drift prevention, not a fix for anything in particular — Node 22 LTS
works fine. The upper bound exists because Node 23+ strips TypeScript types by
default, which turns some Expo failures into internal Node errors that read as
unrelated to their real cause. The stale-`node_modules` case above is the
clearest example: the real problem is an out-of-date package, but what surfaces
is `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`. Pinning Node does not fix
that; it just keeps the error message honest more often.

## Why this is a monorepo without an npm workspace

Vercel builds the web app with **Root Directory = `missouri-float-planner/`**.
Adding a root `package.json` with workspaces changes how installs resolve there
— a real risk to a live deploy, for no benefit to the backend.

So instead of a workspace, the shared code is pulled in as **`file:`
dependencies**. npm symlinks each one into `node_modules`, so they resolve like
any other package and Vercel never sees them:

| Package | Points at | Holds |
|---|---|---|
| `@eddy/types` | `../packages/eddy-types` | API contracts shared with the backend |
| `@eddy/geo` | `../packages/eddy-geo` | viewport quantisation and navigation-app links |
| `@eddy/sync` | `../packages/eddy-sync` | favourites reconciliation |
| `@eddy/hazards` | `../packages/eddy-hazards` | hazard classification |
| `@eddy/conditions` | `../missouri-float-planner/shared` | the canonical condition system |

`@eddy/conditions` is the odd one: it lives inside the **web app** rather than
`packages/`, because 38 files there import it through that app's own `@shared/*`
alias. Adding a `package.json` beside it lets this app consume the same file
without moving it or touching those imports.

`eddy-geo` is shared rather than app-local for a specific reason: it is pure and
it needs tests. The app has no test runner yet, so the alternative was
re-implementing it inside a web test — the duplicate-then-drift pattern this repo
has already been bitten by. It is covered by `src/lib/geo-tiles.test.ts` and
`src/lib/geo-viewport.test.ts` in the web app, which import it by relative
path. Its own imports are relative for the same reason: both Metro and the
web's plain `tsx` runner have to resolve them.

### These used to be path aliases. Do not put them back.

Until SDK 57 the same modules resolved through `metro.config.js` `watchFolders`
plus `tsconfig` `compilerOptions.paths`. That stopped working, and the way it
stopped is worth knowing before anyone reaches for an alias again:

- **Expo's tsconfig-paths emulation only matches wildcard patterns now.** `@/*`
  kept resolving; the exact mappings (`@eddy/types` and friends) were not even
  attempted — from a `tsconfig.json` that had not changed.
- **Metro's file map does not index files outside the project root during
  `expo export`**, whatever `watchFolders` says. Point a resolver at one and the
  bundle dies with `Failed to get the SHA-1 for .../packages/eddy-types/index.ts`.

The second is the dangerous one: `expo start` indexes those files fine, so the
**dev server works and every production bundle fails** — including every EAS
build. `watchFolders` is still set, but only so edits to the shared code
hot-reload; nothing resolves through it.

### What this costs on EAS, and why it works anyway

Reaching outside the project directory is the thing that usually breaks a
non-workspace monorepo on EAS, so it is worth stating what actually happens.

`eas build` does **not** archive the Expo project directory. It clones from
`git rev-parse --show-toplevel` (`eas-cli/build/vcs/clients/git.js`,
`makeShallowCopyAsync`), so the repository root is the archive root and
`packages/` + `missouri-float-planner/shared/` arrive on the worker — which is
exactly what the `file:` dependencies need, since `npm ci` resolves them from
disk. Verified end to end against a copy of the real archive: `npm ci` then
`npx expo export --platform ios` both succeed.

The cost is that the archive is the whole repo: 87 MB, mostly Remotion audio and
blog imagery the app never touches. `/.easignore` trims it to 3 MB.

**`.easignore` replaces `.gitignore` entirely** — when the file exists, eas-cli
stops reading `.gitignore` (`eas-cli/build/vcs/local.js`), so every ignored path
is uploaded unless re-stated, `.env` included. That is why it is written as an
allowlist rather than a denylist, and why it has a test:

```bash
python3 eddy-ios/scripts/check-easignore.py
```

which asserts every Metro-resolved path is still in the archive and that no
secret or media file has crept in. Run it after touching `.easignore`, the
`file:` dependencies in `package.json`, or `metro.config.js` watchFolders.

**Do not add `nodeModulesPaths` or `disableHierarchicalLookup` to
`metro.config.js`.** Those appear in every workspace-monorepo guide and are
wrong here: this project has a single `node_modules` and npm nests some
transitive dependencies (`expo-asset` under `node_modules/expo/`). Disabling
hierarchical lookup makes Metro refuse to look inside them and the bundle fails
with `Unable to resolve module expo-asset`.

## Theming

Light and dark, following the system setting (`useColorScheme`). `DESIGN.md` is a
light, desktop-first web system; its neutral scale also names the dark-mode
surfaces, so both palettes come from the document rather than one being an
inversion of the other.

**The rule that makes it work:** `StyleSheet.create` runs ONCE at module import,
so a colour written into a StyleSheet is frozen at whichever scheme the app
launched with. The convention is therefore a split:

- `StyleSheet.create` — layout, spacing, radii, type. **Never colour.**
- inline `style` props — colour, from `useTheme()`.

`src/lib/app-theme.test.ts` in the web app enforces this, along with both
palettes defining every semantic role (a missing key renders as a transparent
label on one scheme only, which is easy to miss).

### Translating, not transcribing

`DESIGN.md`'s signature is a hard-edged offset shadow (`3px 3px 0 #A49C8E`,
never blurred) with a hover lift. That is a web idiom — it reads as an
affectation on iOS and pairs with a hover state touch does not have. So the
brand's *structure* carries over (cards stay distinct, bordered objects) while
depth is retranslated in `elevation()`: soft downward shadow on light, border
weight on dark, where a shadow against near-black is invisible anyway.

Fredoka, Geist and Geist Mono carry over unchanged. Mono for gauge readings is
functional, not decorative: proportional digits change width as a number ticks,
so a reading going from `1.51 ft` to `1.62 ft` shifts the whole row.

**Import fonts from the weight subpath** (`@expo-google-fonts/geist/400Regular`),
never the package root. Each package's index re-exports every weight it ships and
Metro bundles what is reachable — the root import put ~8 MB of TTFs in the export
for the eight faces actually used.

### Eddy the Otter

`CONDITION_SYSTEM` assigns every condition an `otter` mood, so which otter to
show is already a decision the canonical system has made — `src/components/Otter.tsx`
just draws it. The source art in `remotion/public/eddy` is video resolution
(~700 KB each); `assets/otter/` holds 300px copies, which took the set from
4.58 MB to 193 KB.

## Condition colours and labels

Import them from `@eddy/conditions` via `src/theme/conditions.ts`. Never
hardcode condition hex — that file says so explicitly, and an earlier version of
this app ignored it and immediately drifted (`#DC2626` here vs the canonical
`#ef4444`), so the app showed different colours than the website for the same
river.

Two severity orderings exist and **must not be conflated**:

- `CONDITION_SYSTEM[code].severity` — most-alarming-first, for alerts
- `WEEKEND_SEVERITY` — floatable-first, for "where can I go" lists

Search uses the second. Public "floatable now" counts use `FLOATABLE_NOW`
(strictly `flowing`/`good`), which is narrower than `WEEKEND_FLOATABLE`.

## Maps (Mapbox)

`@rnmapbox/maps` is a **native module**, so from here on the Map tab needs a
development build — Expo Go cannot load it. The other three tabs still work in
Expo Go: the map is reached through a lazy `require` in `src/map/runtime.ts` and
the tab shows an explanatory panel instead of crashing the bundle.

One environment variable is needed:

```bash
echo 'EXPO_PUBLIC_MAPBOX_TOKEN=pk.your_public_token' > .env   # gitignored
```

`EXPO_PUBLIC_` is deliberate. A Mapbox `pk.` token is public by design and ships
inside every app binary regardless of where you put it — protect it with URL and
scope restrictions in the Mapbox dashboard, not by hiding it. For EAS builds set
it as an environment variable per environment (`eas env:create`); `eas.json`
declares `environment` on each profile so builds pick up the right set.

**You do not need a secret `sk.` download token.** Most guides still tell you to
create one and pass `RNMapboxMapsDownloadToken` to the config plugin. That prop is
deprecated — the plugin's own types say "Download token is no longer required by
Mapbox. Do not set this."

### The logo is not a preference

Mapbox's terms require their logo on every map they render. It may be moved to
another corner; it may not be restyled, and **no plan tier exempts you** from
showing it. The attribution notice (the `(i)` button, which discloses
© Mapbox / © OpenStreetMap) is likewise required — its text may be repositioned
and recoloured to match a theme so long as it stays legible, and if you ever
disable the built-in button you must render the same credits as text yourself.

So `logoEnabled` and `attributionEnabled` are passed **explicitly** in
`src/map/RiverMap.tsx` rather than left to a default, and both are positioned to
sit clear of the locate button — at the default inset the 44×44 locate button
covers the wordmark, and attribution you have covered up is attribution you have
not given.

If the branding genuinely has to go, the answer is not a prop: it is changing
renderer. The website already runs **MapLibre** against self-hosted styles in
`missouri-float-planner/public/map-styles/` with no API key and no Mapbox
dependency at all. `@maplibre/maplibre-react-native` is a fork of this very
library with a near-identical API, so the port is tractable — but offline packs
would have to be rebuilt on MapLibre's own offline API, which is the reason it
has not been done.

Do not pin `RNMapboxMapsVersion` unless you have a reason. `@rnmapbox/maps` 10.3.5
pins Mapbox iOS `~> 11.23.1` in its own `package.json`, and overriding it with a
lower version silently builds against an SDK the library is not tested on.

### Adding a screen, and the generated route types

Add the file under `app/` and push to it. There is no second step — but the
history is worth knowing, because this used to fail and the failure was
convincing.

`app.json` sets `experiments.typedRoutes`, so expo-router generates the union of
every route into `.expo/types/router.d.ts` and `router.push()` accepts only
members of it. That file is **gitignored**, and for a long time the **dev
server** was the only thing that wrote one. So a brand-new route looked broken
when it was fine:

```
error TS2345: Argument of type '"/storage"' is not assignable to parameter of
type '"/" | ... | "/floats" | ... 68 more ...'
```

That was a declaration written before your screen existed. The same gap ran the
other way in CI, which had no declaration at all — so route errors could not
fire there and never had.

`npm run typecheck` now regenerates the declaration before running `tsc`, via
`npm run typegen` (`expo customize tsconfig.json` — the supported way into
Expo's type generation without a dev server; **not** `expo export`, which was
tried in both the Makefile and CI and generates nothing). It costs about two
seconds, picks up added *and* deleted routes, and `make check-mobile` and CI
both go through it. `eddy-ios/package.json` has the detail.

So a TS2345 naming a route is now a real answer: the route is misspelled,
renamed, or not there. Do **not** reach for `asHref()` to silence it.

Second, independent coverage that owes nothing to Expo:
`missouri-float-planner/src/lib/ios-routes.test.ts` reads the files under `app/`
and asserts every route the app pushes resolves to one. It stays, because if
typed-route generation ever breaks or is turned off the check should not vanish
with it. `src/lib/href.ts` has the full history.

Reach for `asHref()` only when a path is genuinely assembled at runtime. A
template literal written inline — ``router.push(`/river/${slug}`)`` — is checked
properly and needs nothing.

## Search, layers, and the float plan

The Map tab is three features sharing one screen, and each of them has a
constraint worth writing down.

### Search is half local, half server

`src/hooks/useEddySearch.ts` matches **rivers and gauges in memory** and asks the
server for **access points**. The split is not arbitrary:

| Source | Where it is matched | Why |
|---|---|---|
| Rivers | Local (`/api/rivers`, already loaded) | ~24 rows the screen holds anyway |
| Gauges | Local (`/api/gauges`, one flat request) | ~40 rows, fetched once, reused as a map layer |
| Access points | Server (`/api/search`) | Several hundred rows, served per river — an index would be downloaded on cellular at a put-in |

Local hits render on the keystroke, with no spinner; the server's fuller list
replaces them when it lands. **`/api/search` is allowed to be missing.** It is
newer than some deployed builds of the website this app talks to, so a 404 marks
it unavailable for the session and search continues as rivers-and-gauges only —
`searchEddy()` in `src/api/client.ts` never throws for this reason.

### The map opens on the network, not on a river

The Map tab draws **every** curated river, coloured by its live condition, and
the selected one brighter on top. It used to draw only the selection, which
meant the map could show you a river you had already chosen and nothing else —
so the one question a map is best placed to answer, *where can I float today?*,
was the one it could not answer.

That also fixed how it opened. There was no default coordinate anywhere: the
river list was sorted starred-first, then floatable-first, then alphabetically,
and `ordered[0]` became the opening river. With nothing starred and several
rivers sharing the top band, the alphabetical tiebreak decided — which is why it
always opened on Big River, a river nobody had chosen. It now opens on the whole
network, or on **your own position if location was already granted** —
`useLocation` resolves that through `getForegroundPermissionsAsync`, the getter,
which reports an existing grant and never shows the dialog. The prompt is still
only ever spent on an explicit tap of the locate button.

Two payloads, two jobs, and they are easy to confuse: `/api/rivers/{slug}`
serves the **full-resolution** centreline used to snap a float route and still
loads one river at a time, while `/api/usgs/mo-dataset?slim=1` serves coarse
geometry for all 24 at once (~260 KB, CDN-cached) purely as context. Readings
come separately from `/api/usgs/mo-statewide` and are graded on the phone, the
same way gauge pins are.

One wrinkle worth knowing: a single physical gauge can be the primary for two
rivers, and the readings payload emits it under only one of them. Courtois
Creek's primary gauge *is* Huzzah Creek's, so a strict river+site lookup left
Courtois grey. `statewideNetwork.ts` falls back to a site-only match — borrowing
the number, never the verdict, because the ladder it is graded against is still
the river's own.

### Condition filter: chips here, sheet for layers

The chips-vs-sheet ruling below sends map **layers** to a sheet because they are
additive switches, and chips imply "narrow to this". The condition filter
genuinely means narrow to this, so it is chips — but behind a button beside the
layers button rather than a permanent band, which keeps the ruling's actual
complaint (a strip eating the one view that needs the room).

Non-matching rivers are **dimmed to 0.16, not hidden**. Hiding takes the tap
target with it, and a map that empties when you tap a filter reads as broken
rather than filtered. Counts come from `summarizeConditionCounts` and the
floatable macro from `FLOATABLE_NOW`, both out of `@eddy/conditions` — the
website hand-rolls `good + flowing` in three separate places and this is
deliberately not a fourth. The filter is not persisted: "what is floatable" is a
today question, and one restored from last week reads as rivers gone missing.

### Gauge pins are graded on the phone

`/api/gauges` sends every station's reading **and the ladder each river grades
it with**, so all forty are classified in one pass off one request — asking the
server for a condition per gauge would be forty requests to draw one map.

The comparisons are not re-implemented on the client. `classifyReading` in
`@eddy/conditions/condition-ladder` is the same function `/api/plan` and
`/api/conditions` run server-side; it moved out of the web app's
`src/lib/conditions.ts` (which imports `@/constants` and so can only run inside
Next) precisely so both sides could share it. This repo has been bitten before
by one concept implemented twice — four condition ladders, two flood-stage
overrides — and a map that disagreed with the river screen it was opened from
would be the same bug again.

Two cases deliberately return `unknown` rather than a colour: a station with no
rated ladder (a row of nulls would otherwise fall through to `too_low` and paint
a healthy river brown), and a reading USGS has flagged as suspect.

### Layers are fetched only when switched on

`src/map/layers.ts` is the single definition of what the map can draw — a row in
the layers sheet is literally the colour of the pins it toggles, so the sheet
doubles as the legend. **Access points and gauges are on by default**, because
"where do I get on" and "is there water in it" are the two questions the map
exists to answer; hazards and services are requested the first time they are
switched on.

The control is a layers button over the map opening a sheet of labelled switches
(`src/components/MapLayersSheet.tsx`), not the row of filter chips it used to be.
Chips cost a permanent band of a phone screen on the one view that wants every
pixel, hid whatever sat past the right edge, and — being the same control River
Reports uses for mutually-exclusive filters — implied "narrow to this" when they
meant "also draw this". `FilterChips` still exists for the Search tab, where the
choices really are alternatives.

The Eddy-rated gauge layer is **statewide**, not narrowed to the selected river.
It was briefly clipped to a 15-mile buffer around the river's bounds, which only
ever removed pins the camera was not looking at anyway — and removed them from
the one view where the layer earns its place, the zoomed-out "which rivers have
water in them" one.

### Two gauge rows, and the partition between them

**Eddy-rated gauges** and **Other USGS gauges** hold disjoint sets, and the
labels have to say so. The second row has always dropped the curated stations —
the map screen filters them out before building pins, so a rated gauge is not
drawn twice, once as a *verdict* in its condition colour and once as a
*comparison* in a flow band a pixel apart — but it used to be called "All U.S.
gauges", which claimed the opposite.

That one word cost real behaviour. The national tier's filter strip offered an
**Eddy-rated** chip, and it could only ever match the pins that layer excludes:
selecting it asked for the curated gauges and then removed every one of them, so
the map drew nothing while the strip said "Showing 12 gauges" and the layers
sheet said 0. **Following** was the same shape — every starrable gauge in the app
is starred from a curated pin's callout, so it too matched only what the layer
throws away. Both chips are gone. "Eddy-rated" is a *scope*, and the scope is the
row above; what remains in the strip is flow bands plus reports-flow/reports-stage,
every one of them a property of the reading, which is all this tier has.

The ordering is the durable fix, not the chip removal. `layerGauges` in
`app/(tabs)/index.tsx` computes the layer's drawable population **once, before**
anything narrows it, and the filter, the counts and the pins all read from that.
Narrowing a set the layer will never draw is not a filter anyone can reason about.

Two disclosures the strip owes and did not make: the layer draws nothing below
`MIN_ALL_GAUGES_ZOOM` (7) while the map's own cold start opens at 6.2, so
switching it on from the opening view drew nothing and reported 0 with no reason
given; and `/api/gauges/map` caps a viewport at 300, ordered curated-first then by
discharge, so a viewport holding 1,240 quietly drew 300 and looked complete.
`belowMinZoom`, `capped` and `total` had all been coming back from
`useViewportGauges` unrendered. Both now say so in the strip.

Every pin is a `CircleLayer` plus a text `SymbolLayer`, never a sprite icon. The
icon names in Mapbox's outdoors style are not a contract we control, and a
missing sprite renders as *nothing* — an invisible hazard is a worse failure
than a plain dot. Label ink is the brand's darkest stone with a white halo in
**both** appearances, because the outdoors basemap is light in both: painting
labels in `colors.text` put white text inside a white halo on dark mode.

### Changing river is not a reload

River geometry loads per river, and the map used to be replaced by a spinner
while the next one arrived — which on a quick tap reads as the app restarting.
The previously loaded river now keeps drawing until the new geometry and its
access points can be swapped in together, with a small pill over the map as the
only signal. Everything that describes what is on screen — the line colour, the
planner's river id, the offline row — is keyed off the river being **drawn**
rather than the one selected, so nothing is ever a half-second out of step with
what is visible. Per-river layer data is tagged with the slug it was fetched for
(`RiverScoped<T>`) so the layers sheet cannot publish one river's counts under
another's name.

### The plan lives on the screen, not in the sheet

`useFloatPlan` holds put-in → take-out → answer, and the map draws the route and
endpoints from it. Closing `PlanSheet` therefore does not discard the plan:
people plan a float and then dismiss the sheet to look at the water between the
two ends.

**Two questions, not four.** There used to be a boat picker between the take-out
and the answer, and a nights-on-the-river control under it. Both are gone. The
boat because `/api/plan` already defaults to a canoe and the difference between a
canoe and a kayak sits inside the error bars of a float-time estimate — a
mandatory tap that changes nothing anyone notices only loses people on the way to
the answer. Which boat the estimate assumed is still printed on it. The nights
because it was a planner inside a planner (a second endpoint, a segmented
control, an itinerary, and a class of "this stretch has fewer camps than you
asked for" copy) sitting under a question most people opened the app to ask about
a Saturday afternoon.

Two rules the flow is built around:

- **The take-out list is filtered, not validated.** `river_mile_downstream`
  counts from the headwaters, so a float always has `takeOut.riverMile >
  putIn.riverMile`. An impossible pair should be unreachable, not rejected after
  the fact.
- **`floatTime: null` is a verdict.** `/api/plan` refuses to estimate a time in
  dangerous water. The sheet renders that refusal rather than a number, because
  "about 5 hours" for a river in flood is an invitation.

Nothing in the plan flow is gated. It is the reason someone opens Eddy on a
Thursday night.

**What the answer says** is now mostly logistics, following the website's plan
page rather than the app's old shape. Warnings, then the time and the two numbers
that decide the day, then the reading it was built from with a tap through to
USGS, then *Getting there* — put-in, take-out and the shuttle leg, each handed to
Apple Maps (`src/lib/directions.ts`; Apple rather than Google because it is
guaranteed present and so can never bounce to a web page). Below that: hazards on
the stretch, the access points **between** the two ends — which are bail-outs, and
are listed by miles from the put-in rather than from the headwaters — and the
outfitters nearest the put-in with tap-to-call. `PlanAlongRoute` and `PlanNearby`
fetch their own data so they work identically on the screen that opens a shared
float, which holds a plan and nothing else.

**Saved floats** are local (`useSavedFloats`) because the server has no notion of
"mine": `float_plans` is keyed by share code, and most users are anonymous. Only
a stub is stored — river, both ends, distance, date. Never the numbers.
`/api/plan/[shortCode]` recalculates the whole plan against today's gauge when
one is opened, which is the only correct behaviour: a float saved in April and
opened in July is the same stretch and completely different water. So the list
works offline and opening one does not, and the screen says so.

### Location is never requested on launch

iOS gives an app one shot at the location prompt. `useLocation` therefore does
nothing until an explicit tap — the locate button on the map, the compass in
the Search tab's search field — so the ask always arrives with a visible reason
attached. A denial is not re-prompted; iOS would suppress the dialog anyway, so
the only effect would be a silent retry behind a spinner.

Coordinates never leave the phone, which is why the permission strings in
`app.json` can say so plainly.

Two things it powers. The planner's put-in list gains a **nearest-first**
ordering (headwaters-first stays the default — that is the order a river runs
in). And Search gains a distance sort, which measures to **the river's
primary gauge**: `/api/rivers` carries no coordinate, and rather than change a
CDN-cached endpoint the website depends on, the gauge is used as a point known
to be on the river. Both surfaces say "≈" and "away", never a drive time — an
Ozark river forty miles off can be ninety minutes of two-lane.

### There is no offline map download

Eddy used to sell a per-river Mapbox tile download as its Premium feature. It
was removed, and the reasoning is worth keeping because it is the kind of thing
that gets proposed again.

The download saved basemap tiles and **nothing else**. Everything that actually
makes a river readable with no signal — put-ins, hazards, the river line, the
last reading — is seeded free for all 25 rivers on every launch with a
connection (`seedOfflineBundle`, see `src/lib/riverCache.ts`). So the paid
feature sold the least valuable half, and the giveaway test showed it: download
a river, switch on airplane mode, relaunch, and everything still worked. The
button looked like it had done nothing because almost nothing was what it did.

The stronger version — computing a float time on the phone from the cached river
mile and last reading — is genuinely feasible and was scoped. It was not worth
the maintenance surface for one person, so the feature went instead of growing.

What this leaves: the basemap is blank with no signal, and every other part of a
river screen still renders. `src/map/packSweep.ts` deletes the tile packs left
on phones that downloaded one, once per install.

What stays free, online or off: conditions, gauge readings, hazards, and the
float plan itself. Eddy's written read is now the **only** entitlement gate in
the app — see `PaywallSheet` for the list and why safety data can never sit
behind a wall.

## Builds (EAS)

`eas.json` defines three profiles. `eas init` has been run — `app.json` carries
an `extra.eas.projectId` — so building only needs an Expo login:

```bash
npm install -g eas-cli
eas login
```

| Profile | Use |
|---|---|
| `development` | dev client for native modules; Expo Go cannot run those |
| `preview` | internal distribution for testers |
| `production` | App Store; `autoIncrement` bumps the build number |

Two notes:

- A development build is now **required for the Map tab**, since `@rnmapbox/maps`
  is a native module (`eas build --profile development --platform ios`). Expo Go
  still runs everything else.
- **The `development` profile needs no Apple Developer account.** It sets
  `ios.simulator: true`, and a simulator build is signed ad-hoc rather than with
  a provisioning profile — so the native modules, the icon, the splash and the
  Map tab can all be exercised before enrolment completes. Everything that
  installs on a physical device (`preview`, `production`, TestFlight) does need
  the account.
- `submit.production` is empty until the App Store Connect app record exists and
  can supply an `ascAppId`.
- **The bundle identifier is `eddy.guide.app`**, which is the domain in forward
  order rather than the reverse-DNS `guide.eddy.app` the convention implies.
  That is deliberate — it is what is registered with Apple, and a bundle ID is
  immutable once a build ships. Nothing resolves it as a hostname and Apple
  never checks it against a domain, so the difference is cosmetic. Universal
  links are unaffected: those are keyed on `TEAMID.eddy.guide.app` in the
  `apple-app-site-association` file, not on the identifier's shape.

## Icons and splash

Generated from the Eddy favicon artwork, not hand-exported:

```bash
python3 eddy-ios/scripts/build-icons.py    # needs Pillow
```

Light appearance is white, matching the website's favicon so the mark reads the
same in the App Store listing as it does in a browser tab. iOS 18's dark and
tinted variants are generated alongside it and wired through `ios.icon` — dark
is Deep River Teal rather than black, because the otter's outline is near-black
itself and dissolves into a black field.

The rule that bites: **the App Store icon must have no alpha channel.** Apple
rejects it at upload rather than at review, so `icon.png` is flattened while the
splash and tinted assets keep their alpha (the OS composites those itself).

## Launch path — read before adding anything at module scope

`src/lib/bootstrap.ts` is the first module the app evaluates. It holds the
native splash, arms an 8-second backstop that hides it no matter what, and
initialises Sentry — in that order, and **before** anything else in the app has
been imported. `app/_layout.tsx` imports it first, and that ordering is the
whole mechanism.

The reason it exists is worth understanding before touching it. Those three
things used to live in `app/_layout.tsx`'s own body, with a comment arguing the
backstop was safe because it ran "at module scope, outside React entirely, so no
render failure can prevent it." True of render failures. **Module bodies run
after every one of their imports** — and `_layout.tsx` imports
`expo-notifications` (via `usePush`, which installs its foreground handler at
module scope), `@sentry/react-native`, `expo-secure-store` and a global URL
polyfill. Any of those throwing meant the body never ran: no React, no
`ErrorBoundary`, no Sentry, no backstop. The app stopped at the splash screen
and reported nothing at all — the worst failure it has, and the only invisible
one.

So:

- **`bootstrap.ts` has no static imports.** Everything is a guarded `require`.
  A floor with a hole in it is not a floor. Keep it that way.
- **Native work at module scope needs a try/catch** if the file is anywhere in
  `app/_layout.tsx`'s import graph. `usePush.tsx` is the worked example.
- **`completeLaunch()` is what hides the splash**, called from `ThemedShell`'s
  first `onLayout` so it lifts onto a painted, correctly-themed screen. It also
  disarms the backstop — leaving it armed would file a stall report eight
  seconds into a healthy launch.
- If the backstop fires, the splash lifts onto a **"didn't finish starting"**
  screen rather than a blank one, and `warn('launch', …)` has already gone to
  Sentry.

### Diagnosing a launch that stops at the splash

In order, cheapest first:

1. `npx expo run:ios --device --configuration Release` — the same release bundle
   as an EAS preview build, but with a live Xcode console. A module-scope throw
   prints here instead of vanishing.
2. Xcode → Window → Devices and Simulators → **View Device Logs**, for a native
   crash rather than a JS one.
3. Sentry, filtered to `subsystem: launch`. Note that events are tagged with the
   EAS channel (`preview`, `production`) — see `src/lib/app-environment.ts`,
   which exists because that tag read `'unknown'` for every build until it was
   fixed.

A splash that lifts after ~8 seconds means the backstop did its job and the
report is already filed. A splash that never lifts at all means JS never
started — look at step 2, not step 3.

## Current state

| Tab | Status |
|---|---|
| Map | **live** in a dev build — search, layer filters, the float plan flow, premium-gated offline packs |
| Search | **live** against `/api/rivers`, with local search and condition filters |
| Alerts | **live** against `/api/alerts` |
| Favorites | **live**, local-first via AsyncStorage, reconciled with the server on sign-in (`useStarredRivers`) |
| Profile | **live** — Sign in with Apple, subscription state, Restore Purchases, account deletion |

Remote config and the forced-upgrade gate are wired (`/api/app-config`), and both
fail open: an unreachable config means no upgrade requirement and all features
enabled.

## Accounts, purchases and deletion

The identity model is anonymous-first and upgrades in place. `signInWithIdToken`
against an existing anonymous session links Apple to that SAME user id, so stars
collected before converting are already the new account's — nothing is migrated,
because nothing moved.

Three things about it are load-bearing rather than stylistic:

- **The session lives in the Keychain**, not AsyncStorage. RevenueCat is keyed on
  the Supabase user id, so losing the session loses the entitlement — the app
  would take a fresh anonymous identity and a paying subscriber's subscription
  would vanish. Keychain survives reinstall and is encrypted at rest. It also
  needs chunking, because a Supabase session exceeds expo-secure-store's
  2048-byte limit; that logic is in `src/lib/chunked-store.ts` and covered by
  `src/lib/chunked-store.test.ts` in the web app.
- **RevenueCat is never configured with an anonymous id.** An entitlement bought
  under one is stranded the moment the id is replaced. `configurePurchases()`
  refuses outright rather than trusting callers to check.
- **Apple returns the user's real name exactly once**, on the first
  authorisation for that Apple ID, and never again — not on reinstall. It is
  persisted immediately in `signInWithApple` for that reason.

### The purchase flow

The paywall is contextual — it appears when `/api/me/alert-subscriptions`
returns 402, i.e. at the moment someone asked to be told about a river. Three
things about how it runs:

- **Sign-in is not a step you can skip past.** The purchase controls do not
  render until there is a permanent user, because RevenueCat keys on the
  Supabase user id and a purchase made under an anonymous one is stranded by
  the next reinstall.
- **Prices are never constructed.** `priceString` comes from StoreKit already
  localised. Storefronts differ in currency, symbol placement and separator,
  and Apple charges what it says rather than what we format.
- **A completed purchase does not mean the server knows.** The entitlement
  arrives through RevenueCat's webhook, so `waitForEntitlement` polls
  `/api/me/profile` before anything claims success. On timeout the app says the
  purchase went through and may take a moment — never that it failed, because
  the money moved and Apple has the receipt.

After the entitlement lands, `onPurchased` finishes what the user originally
tapped: the alert subscription they wanted is created. That retry deliberately
does NOT re-open the paywall if it fails — bouncing someone back into the wall
they just paid to escape is the worst possible moment to ask again.

**Account deletion cannot be left to the FK cascade.** `float_plans.user_id` is
`ON DELETE SET NULL`, and float_plans treats a NULL `user_id` as the anonymous,
world-readable tier — so cascading would PUBLISH a deleted user's saved floats
instead of removing them. `src/lib/account-deletion.ts` in the web app deletes
them explicitly, before the auth user, and a test fails if that is ever removed.

Three controls here exist because App Review requires them: Sign in with Apple,
Restore Purchases (3.1.1), and in-app account deletion (5.1.1(v)). The auto-renew
disclosure sits with the subscription controls rather than behind a link, for the
same reason.

## Push

The backend was built first — outbox, `deliver-push` cron every 5 minutes,
`/api/me/device-tokens` — so the client's whole job is to acquire a token, hand
it over, and route a tap. Three things shape how it does that.

**The iOS permission prompt is a one-shot resource.** It shows once per install;
a denial is permanent, and the app can then only send someone to Settings, which
almost nobody does. So nothing calls `requestPermissionsAsync()` on its own.
`PushPrimer` explains what will arrive first, and declining THERE leaves the real
permission untouched so the app can ask again at a better moment.

**It is spent at the best moment available**, which is not first launch. The
primer appears once an alert subscription actually exists — the user has asked
to be told about a specific river and there is a concrete notification waiting
to be delivered. That is the strongest case this app will ever have.

**`getExpoPushTokenAsync` needs `projectId`.** Without it the call throws about
being unable to determine the project, and only in a real build — it is never
reached on a simulator, where `Device.isDevice` is false. It comes from the same
`extra.eas.projectId` that `eas init` wrote.

Registration requires a signed-in account, because push identity is purchase
identity: the route and the RLS policy in migration `00183` both enforce it.
Signing out and deleting an account each unregister first, while the token can
still authenticate.

Profile reports OS state rather than mirroring it in a switch — iOS owns the
permission, and a second source of truth can only disagree with Settings. The
sentence explaining why alerts will or will not arrive is a precedence order
(`src/lib/notificationCopy.ts`), tested in the web app: several reasons can be
true at once, and naming the wrong one sends someone to fix something that was
never the problem.
