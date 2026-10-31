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

## Map sheet scroll-edge correction (iOS 26)

`modules/eddy-map-sheet` is a local Expo module, autolinked from the default
`modules/` directory. It hides UIKit's scroll-edge effects only inside the Map
sheet's page scrollers and horizontal tabs. These scrollers move by transform
and already clear the tab bar; the automatic effect can leave the body washed
out after a fast expansion. The native tab bar keeps its system material.

This change requires a rebuilt iOS development/TestFlight binary, using Xcode
26 or newer. A JavaScript reload/OTA cannot add its Swift view. The component
falls back to a regular View in older clients and on other platforms, so old
clients remain usable but don't receive the blur correction. The existing
fingerprint runtime policy separates incompatible binaries and updates.

The module's podspec and Swift source are explicitly included in `.easignore`
and required by `scripts/check-easignore.py`; generated iOS projects, module
build products, and secrets remain excluded. After changing this module, run
the mobile checks/export, inspect Expo's Apple autolinking resolution, and
verify rapid sheet expansion/collapse and horizontal tab changes in a native
build. A Metro export doesn't compile Swift or prove UIKit rendering.

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

Light and dark follow the system setting (`useColorScheme`). Light keeps the
warm web palette. Native dark appearance uses the neutral charcoal roles in
`src/theme/palette.ts`, documented in `DESIGN.md` and
[ADR 0016](../docs/decisions/0016-ios-dark-mode-uses-neutral-charcoal.md): darker
page canvas, lighter cards, foreground sheets, then raised controls. Teal marks
actions, selected labels/outlines, calendar endpoints and data. Ordinary dark
surfaces, including selected backgrounds, remain neutral.

Use `sheet` for a plain sheet and `sheetGrouped` for a sheet with grouped
content; the latter preserves the warm page tint in light appearance. Dark
content cards inside a sheet may use `card` as an inset group. Controls and
panels that should appear raised use `cardRaised`, which is lighter than the
sheet. `sheetControl(colors)` adds a visible neutral outline to filled sheet
buttons and search fields. `borderStrong` also supplies the brighter neutral
edge for `elevation(2)`. Dark error, success and coral text use lighter ink
steps so they remain readable on raised and selected surfaces too.

The camping calendar leaves unselected cells transparent. Arrival/departure
use solid teal markers; the intervening range has a neutral selected fill,
teal outline and teal text. The active Arrival/Departure field has an underline,
and the accessible list retains its checkmark. Selection cannot rely on the
background fill alone.

**The rule that makes it work:** `StyleSheet.create` runs ONCE at module import,
so a colour written into a StyleSheet is frozen at whichever scheme the app
launched with. The convention is therefore a split:

- `StyleSheet.create` — layout, spacing, radii, type. **Never colour.**
- inline `style` props — colour, from `useTheme()`.

`src/lib/app-theme.test.ts` in the web app enforces this, along with both
palettes defining every semantic role (a missing key renders as a transparent
label on one scheme only, which is easy to miss). The same tests require at
least 4.5:1 for supporting text on page, card, raised, sheet and selected
surfaces. Dark text has four levels: near-white `text` for titles and values,
`textBody` for prose, neutral `textMuted` for supporting labels, and
`textSubtle` for timestamps. Body text clears 7:1 and remains brighter than
supporting text. Increase Contrast strengthens these roles while retaining
neutral supporting labels. Mapbox colors remain strings. Native iOS tabs keep
the system material; the content palette does not repaint the tab bar. Tests
also require visible control/selection boundaries at 3:1 and verify that raised
dark controls sit above sheets, alongside text contrast on every surface.

Photo-backed Eddy’s Read cards use an opaque charcoal excerpt panel in dark
appearance and the existing warm-white panel with teal report text in light.
Loading, empty, error, retry and timestamp colors use the same appearance as
the panel. River names and the footer action stay white over a shaded photo;
the condition badge uses the matched appearance-aware fill and ink.

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

### Floats discovery controls

The Floats hub leads with Start a Float, or Your Float for an active recording.
Today puts the same Your Float card before other content; Map shows the compact
version above its plan row while recording, so a plan built before the float can
still be reopened or cleared, and the planner stays reachable. Like the plan
button, it hides while a map sheet is open. The shared `YourFloatButton`
also replaces Return to float on saved routes and in the planner, preserving the
planner's sheet-dismissal navigation. It uses the existing canoe artwork and
Trail Green palette, with “Tracking on the
[river name]” only while GPS and the recorder are healthy. Starting, delayed,
weak-GPS and blocked states say so and lose the green treatment. Labels wrap at
large text sizes. New-start feature flags never hide an existing recording.
Plan a float (choose endpoints) and Find a float (suggestions for a time and
location) share a secondary row. Plan a float takes the accent styling when
River Mode is disabled. Both use the same planner and result actions.
Today recommendations and Floats push new planners to `/plan-route` in the
originating tab's stack. This lightweight screen loads the river index and
access points into the shared PlanSheet; it never mounts a Mapbox map, map
layers, or statewide geometry. Cached picker data appears while fresh data
loads, missing data has a retry action, and leaving cancels outstanding loads.
Rivers are ordered by favorites, condition, then name. These planners preserve
the kept-alive Map tab until the user explicitly chooses View on Map. That
action hands the exact river, endpoints and vessel to Map, highlights the
route beneath its POI symbols, and opens a compact interactive plan summary.
Closing cancels any calculation immediately. Native sheet dismissal finishes
before Back returns to the caller, which stays visible behind the sheet, with
no second stack animation. The tab navigator sets the planner's transparent
presentation and hidden header before mounting it; the screen must not change
these options after opening, because native modals remount when header visibility
changes, discarding the plan and restarting its data loads. Starting
replaces the standalone planner with float setup. Planning directly on Map still retains its route when
the sheet closes. Navigation entry actions ignore repeated presses until focus
returns. The native route checks exercise the handoff, endpoint-detail Back,
new-plan isolation, and preserved Map stack.

Find a float is a shared detail in every tab: opening it from a river page
preserves that page and its tab, so Back returns to the same river. Cold finder
links still belong to Floats. Its Where? picker contains Current location,
rivers, access points and towns. With an existing location grant and a recent fix, an untouched
finder defaults to Near you. An intentional river or town selection always wins,
including while GPS is loading. Current location is checked when selected;
there is no redundant location action on the main form. River choices work
without a location permission; only an explicit location tap asks. Selecting a river keeps Current
location (for launch order and drive times) but never a town; selecting a town
clears the river, and an access point selects its river from that launch. Town search
is debounced and cancels stale responses; it keeps Mapbox attribution. A selected location reveals a
native radius menu, measured to the put-in rather than as driving distance.
While searching, the bundled Eddy checking a gauge appears with “Eddy’s reading
the waters.” Progress dots respect Reduce Motion; loading and results share
the same scroll destination. Empty results explain the actual water/access
exclusion and offer an explicit nearby-river or wider-radius search. These
actions keep the time, vessel, and public-only preference. Including other
accesses is a separate action; nearby river searches use catalogue coordinates
and do not ask for GPS.

Results use photos from each float’s put-in or take-out, preferring a photo
not already shown in another result when one is available. Access-point galleries,
reviewed place photos, linked campgrounds, and verified community reports supply
these images, with the already-loaded river photo and then an Eddy illustration
as fallbacks. Duration, river miles, drive time (when
the search has a starting point), condition, access status and up to three
highlights are visible without expanding details. Cautions stay visible;
descriptions, estimate provenance, and endpoint access details use a disclosure.
Results show when they were checked and a native Sort menu; partial-search
status remains visible. The finder adds no inline explainer copy — estimate and
distance notes are behind info buttons. The native finder header is opaque so
content scrolling underneath cannot obscure its title or Back control.

Kayak is the initial vessel, then an explicit choice is remembered. Find a float
and Ready to float share one compact Vessel row with the caption "Helps estimate
your float time". Its native menu uses the shared `FLOAT_BOATS` inventory, checks
the current choice, and applies a selection without a confirmation step. There
are no vessel tiles or pace bars. Large text stacks the label and selected value.
Changing any finder choice cancels an in-flight search and dims the old
results, which stay inert until Search again; dismissing a menu leaves them
intact. Trip length is a native menu (day trip, 2 or 3 days; the slider then
sets hours a day). Public access only is on by default and lives in the Filters
sheet with the other filters: a Settings-style list of switches with Reset and
Done, matching the website's groups.
Estimate info explains published and modeled times without claiming every
estimate comes directly from CFS. A retry retains the finder’s chosen vessel.

The time control remains a half-hour-step system slider using the existing
`@react-native-community/slider` dependency. It previews a touch drag locally
and commits on release; returning to the original value preserves results.
VoiceOver adjustments commit immediately. The footer uses the screen's native
bottom safe area for tab-bar clearance. Location errors stay by the location
action; town-search errors stay in the picker; route-search errors stay on the
main screen. The new navigation and layout introduce no native dependencies.

Saved Floats & History opens one collection with Saved and History segments,
an All Rivers filter, and recent or River A–Z ordering. A labelled Backup control
in the top-right toolbar opens the same settings from either segment. Backup
applies to saved routes and completed trips; sharing trip summaries is a
separate, optional choice. Routine backup status and account controls live on
that settings page; collection errors remain visible inline.
Both segments use the archive's local loading state. A failed load shows an
error and Retry; backup failures keep loaded routes and trips visible and show
that backup needs attention.
The old `/float-history` URL opens the History segment. Featured floats uses the
same photo/fallback card on the carousel and full list, and the full list has
river filtering and featured or alphabetical ordering. Featured order matches
the carousel's stable daily rotation; River A–Z groups that order by river.

Saved cards show a cached endpoint thumbnail, then a river photo from the
existing index cache, then the Eddy canoe. Featured photos come from the guide
section or that route's own put-in/take-out galleries, including reviewed access
photos. The API selects an unused route photo when possible, retaining the other
route photos as load-failure alternatives. Only after those fail do cards use a
cached river photo, then the Eddy fallback. One cache read per screen
avoids per-card API requests; a missing or failed cache leaves the fallback.
New saves retain the photo URL; older saves gain one on their next successful
online open. A refresh without imagery retains the prior photo. Images use
`ScenicImage` at thumbnail size and never block opening a saved route. Removing
a save is in the native options menu with confirmation. Time estimates and
conditions remain absent from saved cards.

Device QA for this layout remains required: light/dark, maximum Dynamic Type,
VoiceOver slider adjustments, keyboard and sheet dismissal, footer clearance
above native tabs, return from the planner with scroll restored, photo failure
offline, rapid repeat route taps, and cancel/confirm removal.
During slider QA, drag away and back without losing results, then change the
time and confirm results clear only on release. Verify VoiceOver changes the
actual search time, including after a touch drag. Recheck the native footer
insets on Expo upgrades: its `react-native-screens/experimental` safe-area
component follows the native-tabs integration documented by Expo.

## Condition colours and labels

Import them from `@eddy/conditions` via `src/theme/conditions.ts`. Never
hardcode condition hex — that file says so explicitly, and an earlier version of
this app ignored it and immediately drifted (`#DC2626` here vs the canonical
`#ef4444`), so the app showed different colours than the website for the same
river.

Badge helpers require `isDark` from `useTheme()`. Light keeps the canonical
tint/ink/border. Dark derives opaque fills over charcoal and lighter ink from
the same canonical hues; all condition labels clear 7:1 on their badge and on
ordinary dark surfaces. Use `conditionOpaqueBg` over photos or maps so the
image cannot alter text contrast. Solids remain unchanged for map markers,
stripes and chart data; do not use a raw solid as small label text.

Two severity orderings exist and **must not be conflated**:

- `CONDITION_SYSTEM[code].severity` — most-alarming-first, for alerts
- `WEEKEND_SEVERITY` — floatable-first, for "where can I go" lists

Search uses the second. Public "floatable now" counts use `FLOATABLE_NOW`
(strictly `flowing`/`good`), which is narrower than `WEEKEND_FLOATABLE`.

## Maps (Mapbox)

`@rnmapbox/maps` is a **native module**, so from here on the Map tab needs a
development build — Expo Go cannot load it. The other tabs still work in
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

### The compass

Two-finger rotation is on, so the Map tab has a compass (`src/map/MapCompass.tsx`):
a north/south needle that appears last in the Locate row only while the map is
turned at least a degree off north (`compassVisible` in `cameraBehavior.ts`),
and turns it back to north-up in place when tapped. The reset is a
`resetHeading` camera command like every other move, carrying heading only, so
centre and zoom survive. The needle turns from a shared value; rotating the map
never renders React. River Mode's map has rotation off and needs none.

Do not pin `RNMapboxMapsVersion` unless you have a reason. `@rnmapbox/maps` 10.3.5
pins Mapbox iOS `~> 11.23.1` in its own `package.json`, and overriding it with a
lower version silently builds against an SDK the library is not tested on.

### Native tabs upgrade checks

The iOS tab shell uses `expo-router/unstable-native-tabs`. On every Expo SDK or
Router upgrade, review the native-tabs API before changing its options. Verify
Today / Map / Alerts / Favorites / Settings labels and symbols, tab reselection,
retained screen state, initial Today launch, and direct-link return paths on a
small phone and a Home Indicator device.

`LazyTabScreen` defers each screen's content until first focus because SDK 57's
native shell mounts every tab eagerly. Keep the wrapper until the installed
Router version provides equivalent lazy mounting; then verify that background
screens do not start requests and visited screens retain their state.

Check automatic scroll insets for every tab, list, and detail screen. Native
tabs supply their bottom inset to the Map screen; do not add a second tab-height
constant. Test Map sheet dragging, search, attribution, locate/plan controls,
and sheets with their own safe-area provider. Recheck iOS 26 scroll-under
materials and the older-iOS translucent fallback in light/dark, Increase
Contrast, Reduce Transparency, and Reduce Motion. Glass remains navigation and
control chrome; list rows and data cards retain ordinary surfaces.

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
newer than some deployed builds of the website this app talks to, so a 404 —
like any other failure — backs the server half off and search continues as
rivers-and-gauges only. `searchEddy()` in `src/api/client.ts` never throws for
this reason: it answers `available: false` with a `reason` — `'offline'` when
no answer arrived (no connection, or the deadline ran out) and `'server'` for
any HTTP status, that 404 included — so the map's empty state can tell someone
to check their connection only when the connection is actually the problem.

Offline, the map's field falls back to what the map draws from disk
(`src/hooks/searchFallback.ts`): rivers from the statewide network while
`/api/rivers` is missing, and put-ins and rated gauges (by site number and
river) while the server half is failing. Only absent sources fall back, so
online rows are never duplicated. Other USGS gauges come from the server only.

A searched place opens the way a tap on its pin does: access points on the
layer their types give them (campground, boat ramp, else access), a service the
map draws as an access point as that access point, and a gauge, dam or hazard
without selecting a river. The camera waits for the sheet a result opens.

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
network, or on **your own position if location was already granted** and that
position is inside the network's bounds (padded by a fifth of their span) —
`useLocation` resolves that through `getForegroundPermissionsAsync`, the getter,
which reports an existing grant and never shows the dialog. The prompt is still
only ever spent on an explicit tap of the locate button.

Two payloads, two jobs, and they are easy to confuse: `/api/rivers/{slug}`
serves the **full-resolution** centreline used to snap a float route and still
loads one river at a time, while `/api/usgs/mo-dataset?slim=1` serves coarse
geometry for every curated river at once (~260 KB, CDN-cached) purely as context. Readings
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

Viewport detail requests stop below zoom 5.5 and are capped at 1,000 stations
below zoom 10.5, then 300. A capped response is reused for the same padded,
quantized request target and budget, including idle echoes of its raw viewport;
it cannot establish completeness for a smaller target. Loading and refresh
failures have separate states, and a failed refresh retains existing pins with
a visible Retry action.

The national station index (`/api/gauges/points`) supplies locations at every
zoom while Other USGS gauges is enabled. Viewport responses enrich stations by
USGS site ID; a capped page never replaces the complete index. Map selection
IDs also use site IDs, so enrichment does not change which marker is selected.
Below zoom 5.5 the map source receives the national index. At closer zooms it
receives only stations within the padded, quantized viewport, without a count
cap. The full index remains in memory; each viewport response updates regional
geometry instead of sending the whole country across the native bridge.
Index-only gauges open the normal detail sheet and hydrate by site ID; synthetic
index IDs are never seeded into the favorite-capable gauge detail screen.

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
people plan a float directly on Map and then dismiss the sheet to look at the
water between the two ends. Floats entry points use a fresh `/plan-route` screen
with the same PlanSheet and planning hook, without mounting a map. Closing
those cancels their calculation and leaves the Map tab unchanged, except for
the explicit View on Map handoff.

Use as put-in on a Map POI opens a compact Plan a float peek with the same
River / Put-in / Take-out controls as the full planner. Selected endpoints keep
their existing place icon with a teal put-in or coral take-out badge and a text
label; no triangle/square covers the artwork. Each endpoint draws once and stays
visible and tappable at overview zoom or with its ordinary layer hidden.
Tapping an eligible
downstream access pin chooses the take-out immediately, including a campground
or boat-ramp mark for that access. Tap either endpoint control to change it on
the map, or List to use the current endpoint picker. Other POIs still open their
details. Selecting a take-out expands the compact summary; View full plan opens
the full planner explicitly. The compact result measures its estimate and View
full plan button as part of the peek, including after calculation completes;
long results and large-text route controls scroll within the sheet.
Closing the compact planner returns directly to the map, retaining the river,
endpoints and calculated route. A put-in chosen without a take-out stays drawn
and can be cleared with the map's × beside the plan button; Use as take-out is
offered only while planning on the map or against a finished plan. Dismissing a POI while planning returns to Your
route; outside planning it returns to the map. Only an access opened from the
river sheet offers Back to that river. A selected river is data context, not
an instruction to reopen its details. Dismissal never reframes the camera.
A new route frames only while that map interaction
is still current; panning, picking another POI or leaving Map cancels a pending
frame. Changing sheet content does not override a detent the user has dragged.

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

**What the answer says** starts with live warnings, then one *Your route* card:
connected put-in/take-out rows, View on Map, distance beside the full float-time
range, the estimate's basis/extra-time note and vessel. Narrow screens and large
text stack the metrics. The finished planner hides its duplicate River / Put-in /
Take-out tiles; the river subtitle and endpoint rows retain the same change
actions, with chevrons. The selection steps and compact map planner still use
their route controls. Saved/shared results use the same summary with read-only
endpoints and keep their existing verification behavior.

The water reading follows with a tap through to USGS, then *Getting there* —
put-in, take-out and the shuttle leg, each handed to
Apple Maps (`src/lib/directions.ts`; Apple rather than Google because it is
guaranteed present and so can never bounce to a web page). Below that: hazards on
the stretch, the access points **between** the two ends — which are bail-outs, and
are listed by miles from the put-in rather than from the headwaters — and
`PlanSupport`: the outfitters and campgrounds associated with each END of the
float, under *Near the put-in* and *Near the take-out*, with the nearest
unassociated shuttles below them. Its rules are pure and tested
(`src/lib/planSupport.ts`); its three parallel requests degrade one lane at a
time (`src/lib/loadPlanSupport.ts`). `PlanAlongRoute` reuses the active planner’s
access list, including its photos,
so it appears without another request after calculation. Shared floats read
cached places while refreshing from the network. `PlanSupport` fetches its own
data on both screens. Put-in and take-out choices use a virtualized list of
landscape photo cards; missing or failed images retain a place-symbol fallback.
In downstream order, a connected timeline shows each river mile and the river
distance from the preceding access. Take-out choices start at the selected
put-in and also show total miles from it. Timeline spacing is not to scale.
Nearest-first ordering hides the connector so proximity cannot imply river order.

The result reuses the map sheet's campsite availability panel below each tracked
endpoint. A tap opens that facility on Camping with the displayed night; older
payloads without a facility ID open the access page. Along-the-way cards open
their existing place pages when a slug is available. The native planner waits
for dismissal before navigating and restores its result and scroll position on
Back; saved floats use their existing stack. Device QA: try each endpoint's
camping panel, multiple along-the-way cards, rapid repeat taps, Back, and changing
the stretch, from both a new plan and a saved float.

**Saved floats** are local (`useSavedFloats`) because the server has no notion of
"mine": `float_plans` is keyed by share code, and most users are anonymous. The collection works locally; signed-in users also back up their private saved
routes through the float archive (see Float history and backup below). Saved trips retain endpoint coordinates, access details, distance,
and dated cautions for offline use. Live conditions and time estimates are not
stored in that record. Opening a trip online recalculates the plan and updates
its saved details; older stubs gain details on their next successful open.
Online opens keep a loading placeholder until the live plan arrives, including
slow requests; elapsed time alone never reveals the saved-details fallback. An offline
connectivity hint exposes saved logistics immediately, but never cancels the live
request or sets an error; network transitions can make that hint inaccurate.
Failed requests expose saved logistics with a retry. Foreground refresh
keeps an open result mounted and its scroll position intact, but hides its previous water verdict, readings
and float-time estimate from sight and VoiceOver until revalidation succeeds.
If refresh fails, logistics and dated cautions remain available with a retry.
Connectivity uses `expo-network`, so adding this dependency requires a new
native build, not only a JavaScript refresh. Its lookup is optional so an older
development client can still open Saved Floats: missing native support uses the
live request's result instead of crashing on import. Rebuild to test the
immediate offline hint; this fallback does not change EAS runtime compatibility.
Account deletion clears both the current and legacy local favorites stores and
the saved-float collection, including queued writes and in-flight sync results.

### Location is never requested on launch

`useLocation` asks for new location permission only after an explicit location
action. Reading an existing grant does not prompt: it can reuse a recent OS fix,
and Find a float can request fresh GPS under that grant. Stored coordinates
from a previous session are marked remembered, never treated as a fresh grant
or a live GPS fix. A newer explicit request supersedes a pending initial read. A denial is not re-prompted; iOS would suppress the dialog anyway, so
the only effect would be a silent retry behind a spinner.

Precise coordinates are used on the device for distance sorting. Today sends
coordinates rounded to 0.05 degrees to Eddy for local weather. Find a float
rounds the `near` coordinates sent to Eddy when Search is tapped to 0.01
degrees (about a kilometre; `approximateLocation` in `shared/float-search.ts`,
which the server applies again), including when the finder automatically
selected Near you under an existing grant. Acquiring a fix and filling Near you alone sends no route
search; selecting a river instead omits `near`. Do not describe location as
never leaving the device.

The native permission text names approximate location sent for weather and
nearby searches. Any `app.json` permission text change requires a new binary,
not an OTA update.

The planner's put-in list gains a **nearest-first** ordering (headwaters-first
stays the default — that is the order a river runs in). Search's distance sort
currently measures to **the river's primary gauge**; Today's recommendations
use access points as described below. Distances are approximate straight-line
miles, never drive times — an Ozark river forty miles off can be ninety minutes
of two-lane.

### Best Near You

Today includes favorite and unfavorited rivers alike, within 100 straight-line
miles of the nearest approved float endpoint. The river still needs a fresh,
usable reading rated Good or Flowing. Condition band ranks before distance;
the existing 10-mile switching margin keeps the lead card stable.

`/api/rivers` supplies `floatAccessCoordinates` from the same paged access-point
query as its counts, using the map's coordinate validation. Non-launch places
are excluded; paid/outfitter endpoints remain eligible just as in the planner.
The card says “to nearest access”; this is not road mileage or a guarantee that
an individual launch is open. Existing agency notices stay on the card.

Deploy the API addition before testing/distributing the updated app. Older
clients ignore the optional field. An older API/cache or failed access query
produces an unavailable/retry message, never a gauge-distance fallback or a
claim that there are no nearby rivers. Pull to refresh after deployment.

Device QA: from St. Louis, check Meramec and Big River when their readings qualify;
star/unstar them and confirm they remain eligible. Check the access distance,
no-location statewide picks, a location outside 100 miles, and an older response
without access coordinates. Recommendations no longer wait on the gauge feed.

### The per-river map download was removed (River Mode trip downloads are separate)

Two different features have downloaded map tiles, and they must not be
confused:

- **The per-river download — removed.** Described below. Its packs are named
  `river:<id>:<n>` and `src/map/packSweep.ts` deletes them.
- **River Mode trip downloads — implemented; device verification and release
  status unconfirmed.** A user-started
  download of a padded corridor along one saved float's route, plus a route
  package so the float can start with no signal. Packs are named
  `float:<trip-key>:<chunk>` and never match the sweep. The decision, and the
  device checks it still needs, are in
  [`docs/decisions/0011-float-mode-offline-maps-use-tile-regions.md`](../docs/decisions/0011-float-mode-offline-maps-use-tile-regions.md);
  the code is `src/lib/tripDownload.ts` and `src/float/`. Release state is
  under [Current state](#current-state).

Eddy used to sell a per-river Mapbox tile download as its Premium feature. It
was removed, and the reasoning is worth keeping because it is the kind of thing
that gets proposed again.

The download saved basemap tiles and **nothing else**. Everything that actually
makes a river readable with no signal — put-ins, hazards, the river line, the
last reading — is seeded free for every curated (active) river on every launch with a
connection (`seedOfflineBundle`, see `src/lib/riverCache.ts`). So the paid
feature sold the least valuable half, and the giveaway test showed it: download
a river, switch on airplane mode, relaunch, and everything still worked. The
button looked like it had done nothing because almost nothing was what it did.

River detail ages readings from their observation timestamp, with each entry's
own receipt time as a fallback. The shared conditions blob's write time cannot
date an individual river. Legacy entries without either trustworthy timestamp
show an unknown-time warning. Visible river details, Today lists, and dam rows
age on one shared minute clock; focus and foreground also update that clock.
Today's gauge cache expires after five minutes, dams use the shared dam store,
and pull-to-refresh bypasses both caches when those datasets are in use.

The stronger version — computing a float time on the phone from the cached river
mile and last reading — is genuinely feasible and was scoped. It was not worth
the maintenance surface for one person, so the feature went instead of growing.

What this leaves, outside River Mode: the basemap is blank with no signal, and
every other part of a river screen still renders. `src/map/packSweep.ts` deletes the tile packs left
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

| Settings | Use |
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

The Floats tab uses the smiling Eddy-in-a-canoe alpha template from
`design/eddy-canoe-tab/`. iOS tints it through the native tab bar; the non-iOS
tab uses the same asset and its supplied tint. The smile is a transparent
cutout, so it remains distinct in dark mode. The compact artwork fits a square
28-point native icon; both navigators preserve its proportions. Regenerate the 1x/2x/3x exports
with `node eddy-ios/scripts/build-tab-icons.cjs` from the root after installing
web dependencies. See the source directory's README for appearance checks.

The Floats hub's `FloatActionIcon` uses the approved Eddy-with-paddle (Start a
Float), Eddy-with-map (Plan a float), and plain magnifying-glass (Find a float)
artwork from `design/float-action-icons/`. These are transparent templates at
40 points with 1x/2x/3x exports, tinted at render time: `onAccent` on filled
buttons and `interactive` on cards, including light, dark, and increased-contrast
themes. Keep facial and map details transparent and preserve the aspect ratio.
Your Float reuses the Start a Float canoe template with the Trail Green tracking treatment. Regenerate with
`node eddy-ios/scripts/build-float-action-icons.cjs` after installing web dependencies.

The active app icon uses the polished Eddy artwork in `assets/icon-polished-light.png`.
The asset script derives its transparent splash and black dark-appearance icon,
and generates the legacy and tinted variants from the Eddy favicon artwork:

```bash
python3 eddy-ios/scripts/build-icons.py    # needs Pillow
```

Light appearance is white. The active dark variant (`icon-polished-dark.png`)
uses the same polished Eddy cutout on solid black, preserving its size and
position. The legacy `icon-dark.png` also uses black. The dark and tinted
variants are wired through `ios.icon`; icon asset changes require a new iOS
binary, not an OTA update.

The rule that bites: **the App Store icon must have no alpha channel.** Apple
rejects it at upload rather than at review, so the light and dark icon assets
are opaque RGB while splash and tinted assets keep their alpha (the OS
composites those itself).

## Home Screen widgets

The River level widget also supports the rectangular Lock Screen family in
native layout version 4. It uses the same selected station, unit, observation,
trend expiration, disk cache and WidgetKit refresh budget as the Home Screen
widget. There is no new polling loop. Its three lines show the station, reading
and eligible trend, then warning/staleness and observation age with “ago”.
VoiceOver reads the full river/station identity and observation timestamp. The setup guide
offers Lock Screen instructions only on a binary with this family.

### App Shortcuts

The host target compiles `EddyAppShortcuts.swift` through `withFloatActivity`:
**Open my river**, **Return to float**, and **Prepare saved route**. Open my river
supports both “Open my river in Eddy” and “Open [river] in Eddy”. It uses the
selected river or the most recently starred river; no river opens Favorites. Prepare saved route accepts a saved route parameter and opens its
existing Ready to float screen only when no float is active. With an active
float, both float shortcuts return to River Mode. Without a route selection
it opens Saved Floats;
older saves without endpoint IDs open their existing plan detail. It never
starts tracking or downloads in the background. Return to float opens the
existing recording presentation, or the Floats home screen when no float is
active. Both actions wait for local recorder restoration; a failed read opens
River Mode’s existing recovery state and never assumes tracking has stopped.

Only current river/route IDs and display names enter the native shortcut
catalog; no GPS positions, contacts, route geometry or logistics are exported.
Requests survive React's cold launch, are consumed once, expire after two
minutes, and resolve against the currently visible collection. An old Siri
selection cannot reopen a removed or other-account saved route. Old binaries
skip the optional bridge. Widget and shortcut changes require a **new native
build**, not an OTA update. They are separate from the JavaScript-only saved
places PR (#1565).

Native compilation, Siri discovery, cold/warm shortcut handoff, Lock Screen
fit and VoiceOver on a device are **unconfirmed**. Before release, check all
three actions from a terminated and running app, with zero/multiple favorites,
deleted routes and account changes; verify both float actions restore an
active float before navigation, Return without a float opens Floats home, and
Prepare without an active float stops before recording. Test the named-river
phrase with two saved rivers.
Check the rectangular widget with long river names, no reading, stale/flagged
readings, a warning, airplane mode and Always-On dimming. Existing widget
verification gates still apply.

Home Screen River level and Your rivers widgets share the Float Activity native
target. Their data contract, offline behavior, configuration and build gates
are documented in [`docs/condition-widgets.md`](../docs/condition-widgets.md).
Native widget changes require a new binary. Device verification and release
status are unconfirmed until the release runbook records them.

## Remote configuration

Production feature flags retain their last successful values across failed refreshes
and offline launches. Only recognized boolean flags are persisted, keyed by API base
URL and environment; notices and version gates are never cached. Cache hydration
is separate from the launch upgrade decision, and a successful server response wins
over a late cache read. A loading timeout only releases the controls; a later disk read still applies
unless a successful server response has already supplied flags.

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
- **`completeLaunch()` finishes the launch**, called by `LaunchSplash` after
  the underlying app has laid out and its overlay icon is loaded. It hides the
  native splash and disarms the backstop before the exit animation starts.
- `LaunchSplash` stays mounted across font readiness. The same polished icon at
  220 points on the same light/dark background scales 100% → 104.5% → 100% while
  the entire overlay fades away over 360 ms. Reduce Motion uses a 180 ms fade.
  The app mounts and loads underneath; no completion callback gates its work.
  Fast font loading no longer unmounts or skips the transition. A 700 ms deadline
  after content layout dismisses even if an image, accessibility query or
  animation callback never settles; image errors dismiss on the next frame.
  Completed launches do not replay on root remount or background/foreground.
  Validate cold launch in a release build, in light/dark and Reduce Motion.
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

## River detail

The river header shows its name, region and length, followed by the gauge
picker and conditions. General `floatTip` prose is omitted from this screen's
header so long tips cannot push readings down the page. Tips remain available
in float plans, and the river's Hazards section keeps its existing details.
“Find a float on this river” sits near the bottom, after the Outfitters section
and before the safety disclaimer.

Gauge detail omits the routine provisional-data footnote. Source-flagged suspect
readings still show their specific qualifier note.

## Favorites

Access points, boat ramps and campgrounds offer **Save/Saved** from the map
sheet and access toolbar. Favorites opens the same access-point detail screen
as the map and river list. Saved facts render immediately while the normal
detail request updates them; offline, the same screen keeps the saved facts.
Service-only campgrounds use the shared map-sheet sections and actions.
Linked campground availability leads the card when Eddy tracks it, including on ordinary access-point saves.
Otherwise rows show a cached gauge and its age, or today's **scheduled**
generation window when available.

Saved-place cards share the river favorites' rounded surface, accent stripe,
and reading pills. Bundled access-point/campground artwork and a category label
identify each place even offline. The name and river lead; restrictions stay
visible above the availability/gauge/schedule panel.
The separate saved star and swipe action both remove only the current account's
save. Stale readings stay neutral, expired values stay hidden, and narrow or
large-text layouts stack the artwork and readings without truncating names.

Starred rivers, gauges and dams live in one local store (`eddy.stars.v3`)
that remembers the last signed-in account it was reconciled with. A guest's
stars are adopted once by the first account to sign in. A *different*
signed-in account replaces the local set with its own server stars rather
than inheriting the previous person's. After a sign-out the stars stay on the
device, as the sign-out alert says, but the guest identity that follows does
not push them to the server, because that guest may be the identity the next
person links their Apple ID to. The rule is `starSyncPolicy` in
`packages/eddy-sync`. A star POST carries the time it was made on the device,
which the server stores as the row's `created_at` (bounded to never be after
the server's own clock; `src/lib/star-time.ts`), so a quick star-then-unstar
on one phone is compared on that phone's clock and is not resurrected. Pushes run one request each: a river the server no
longer knows (a 404) or a rate limit on one entity cannot stall the rest of
the sync, and a star tapped before the store has loaded is folded into the
loaded list rather than replaced by it. Pull-to-refresh on Favorites also
refreshes saved places, past their automatic backoff.

Places are stored in versioned `eddy.savedPlaces.v2:<owner>` collections:
one for each signed-in account and one for guests. Switching accounts hides
the previous collection immediately and restores the selected account's
saves. On guest-to-account sign-in, guest places move into the account once,
merging by place ID and keeping the earliest save date. An existing account
copy keeps its details and dam choice. The guest list clears after the account
write succeeds. An interrupted transfer remains assigned to that account;
retry cannot hand it to another account. Direct A-to-B switches never merge
collections. The unused pre-release v1 migration has been removed. Account
deletion clears that account's collection and any pending incoming transfer.
Late reads, writes and downloads cannot publish into
a different account or restore a deleted place. Places are **never sent to
Eddy's servers**, do not sync across devices, and may be included in normal
device backups.

Snapshots include labeled parking, road, agency, facilities, fees and tips;
private access and required fees appear first. They retain coordinates,
driving location, amenities, contact/booking links and any linked campsite
availability returned by the existing access/service request. Availability uses
the same campsite count and night strip as the map. Any saved place with
linked campsite availability leads with camping, regardless of its tags.
Without camping, cards fall back to the gauge or dam schedule. Cards retain the river name and omit the amenities row. The camping subtitle
uses “X of Y sites available tonight” with the measured night or date window,
plus “FCFS may be available” unless first-come inventory is known to be zero
or the facility is closed/not yet bookable. Its original provider timestamp stays visible; at 72 hours, with an
invalid/future timestamp, or after all relevant nights pass, counts are hidden
and the panel says “Availability out of date”. Old weekend counts cannot resurface after
the weekend starts passing. The gauge remains in the saved details.
Saving retains any inventory already on the pin with its original provider timestamp.
Missing pin inventory stays unchecked until a successful detail lookup.
Saving starts a download. Access details update automatically on opening
and after fifteen minutes when returning to an open screen. Service-only
places update on opening and also support pull-to-refresh. Foregrounding and
reconnecting retry missing/stale downloads while the app is active and connected.
A batch handles at most four places with two workers, with failure backoff from one to thirty minutes. Details and dam
associations are checked daily; downloaded camping/gauge/dam data after fifteen
minutes. Older saves missing the optional camping field get one lookup through
the same bounded foreground refresh. There is no background polling. Bare access
pins retain only known facts until their detail request succeeds; they do not
invent a driving location or river mile. Failed downloads keep the previous data. A new download never changes an observation timestamp or
a schedule day's original retrieval time. The access detail screen keeps the newest
saved observation from the same gauge or campground when a response arrives late.

Gauge freshness uses the existing `readingBand`: stale numbers are muted,
out-of-date numbers are withheld, and only fresh readings show the canonical
river condition. This is a flow condition, not a claim about fishability.
Dam sections appear only for an existing linked snapshot and respect the
saved opt-out. There is no manual dam picker on place details. Only an
unambiguous whole-river association is automatic.
The full dam request supplies schedules; a missing replacement preserves
the same dam's earlier schedule and original dates. Today and Tomorrow lead;
past Central-Time days collapse under **Earlier schedules** and remain
**Historical schedule**. These are downloaded details, not an offline basemap.

This change adds no native code or dependency and is separate from the
widget/Shortcuts build. OTA eligibility still depends on matching the
production runtime. Device verification is **unconfirmed**: save an access
and campground, force-quit, enable airplane mode, and reopen from Favorites.
Check failed first downloads, reconnect retries, large text, VoiceOver,
guest saves → sign-in, account A → guest → B → A, deletion during a
download, expired gauge data,
and historical schedules. Confirm Favorites and map navigation open the same
access detail screen, including the Eddy road, parking and facilities marks.

River cards show a reading pill for every linked gauge, ordered upstream to
downstream using the existing gauge catalog. Each row opens its station when
it has a site ID. Pills prefer CFS and fall back to feet when discharge is
unavailable; if both are missing they say “Reading unavailable”. Each pill uses
that gauge's condition for this river, calculated in its configured rating unit.
Old, suspect, unknown-time and unrated readings use a neutral pill; short age
and qualifier notes remain visible. The river header omits the condition label,
and cards omit Eddy's Read excerpt. Favorites does not fetch Reads. Until the
gauge catalog arrives, cards retain the river headline and scale as a fallback.
Dam favorites with powerhouses follow the Home Screen Dam generation widget:
identity and a separate star above observed turbine flow beside today's hourly
MW schedule.
The chart uses the day's labeled MW peak, Central-time ticks and a current-hour
marker; missing hours are hollow, while zero MW stays a short solid bar.
The card shares the widget packet's validation and observation freshness rules:
older readings are neutral. Today's posted schedule stays visible even when its
retrieval is old or unknown. Only a missing schedule for the current Central-time
day shows the not-posted fallback; earlier and upcoming days never stand in for
today. Lake/state, observation age and “At the dam” remain visible. The card
omits “Subject to change,” including from its VoiceOver description.
Narrow and large-text layouts stack the reading above the schedule. The card
opens dam details, and the separate 44-point star removes the favorite. Search
results retain the compact dam row. This uses existing Favorites data and adds
no request or native dependency; device verification is unconfirmed.

Dams without turbines, including Clearwater and Wappapello, retain the compact
dam row with total release flow, its observation age, and any posted schedule.

Individual gauge Favorites also show the condition scale in the station's rated
unit and a seasonal flow comparison, such as “Lower than usual for mid October”.
The month follows the Ozarks calendar. `/api/gauges` supplies the eligible daily
discharge comparison from a batched snapshot lookup, without per-card requests.
Missing ladders or readings omit the scale; stale/suspect readings mute it and
hide its marker. Seasonal copy is omitted for missing statistics, untrusted
readings or a comparison from another calendar day. Search rows stay compact.

## Dam details

Dam detail readings use Eddy's illustrated metric symbols: Release and Water
temperature share the web masters; lake and tailwater levels reuse the gauge
mark; Inflow and fishery have matching symbols. Generation pattern always
includes the posted upcoming schedule alongside measured history, with no
include/hide control. Measured bars stay solid, scheduled bars outlined, and
missing readings stay gaps. Larger text retains the full spoken row summaries.
The shared schedule-change check line reads “Schedule last checked” with the
check time in Central time (CST/CDT); checks from an earlier day include the date.

## River guides

The bottom of Today features one free **River guide** each local calendar day,
with its photo and excerpt. The card opens that article; **See all** opens
`/river-guides`, a searchable native list of published `River Guides` articles
from `/api/blog`.
The feature cycles through the published catalog in slug order, staying stable
throughout the day while that catalog is unchanged. It advances on the next
visible minute after midnight or when the screen regains focus/foreground, and
pull-to-refresh reloads the catalog.
Each river detail page also shows its matching published guide, if one exists.
The full article opens on `eddy.guide` in the in-app browser, retaining the shared web
layout, live conditions and planner links. This is evergreen content, separate
from Eddy’s Reads. Loading happens when Today, the catalog, or river detail
mounts, without blocking app startup; failures offer retry on Today and in the
catalog, and hide the optional river-detail link. The catalog has no entitlement
requirement; its links use the shared browser behavior below.
Guide photo credits live on `eddy.guide/photo-credits`, reachable from the
account screen; the cards do not repeat them below each image.

Content and import instructions live in the
[river-guide runbook](../missouri-float-planner/docs/river-guide-style.md#repository-authored-guides-and-publishing).
Device verification and release status for this entry are unconfirmed.

## Opening web links

Web pages (guides, booking and outfitter sites, gauge/alert sources, policies
and photo credits) use `src/lib/openExternalLink.ts`. On iOS,
`expo-web-browser` presents a Safari sheet with **Done** and the standard
browser controls, including opening in the full browser. Closing it returns to
the same Eddy screen or sheet. Controls use Eddy's interactive color, resolved
from the system appearance at each opening; Safari owns the toolbar background.
Android uses a browser Custom Tab.

On iOS, HTTPS Recreation.gov campground and campsite links first attempt an
app-only universal-link handoff through the local `eddy-links` module. This
preserves the provider app and its signed-in session when iOS can open that
specific URL there. An absent app, unsupported link, disabled association or
missing module falls back to the in-app browser. `canOpenURL(https:)` cannot
answer that question: the native bridge uses `universalLinksOnly`, which does
not open Safari when the app handoff is unavailable. Other pages and providers
keep the browser behavior. Android does not use this iOS-only handoff.

Web URLs are serialized from the parsed URL before opening either browser.
Service website buttons use `serviceContactActions` to add a missing HTTPS
scheme and hide invalid website values, consistently with the map sheets.

Keep internal destinations on Expo Router. Directions (including HTTPS maps
fallbacks), App Store subscriptions/offer redemption, phone and email actions
keep their system-app handoffs. Mixed contact rows can use the helper: non-web
schemes still go to the system.

One shared guard covers the app handoff and prevents concurrent browser presentations. Browser failures
fall back to the system browser; if both fail, the helper shows a retry alert.
Pass an error callback to retain an existing inline booking error instead.
The native browser module loads only on tap, so a missing module cannot block
app startup. The browser dependency and `eddy-links` require a **new native build**, never an
OTA-only release. Safari-sheet cookies are separate from Safari's, so a
booking site may ask the user to sign in again. Eddy sign-in does not use this
helper. Device verification is tracked in the iOS release runbook.

## Current state

| Tab | Status |
|---|---|
| Map | **live** in a dev build — search, layer filters, the float plan flow |
| Today | **live** — conditions, camping, weather, and Eddy’s Reads; dedicated browse routes for river conditions and reads |
| Alerts | **live** against `/api/alerts` |
| Favorites | **live**, local-first via AsyncStorage, reconciled with the server on sign-in (`useStarredRivers`) |
| Settings | **live** — Sign in with Apple, subscription state, Restore Purchases, account deletion |

This table said "premium-gated offline packs" against the Map row long after the
download feature was removed — see [The per-river map download was removed](#the-per-river-map-download-was-removed-float-mode-trip-downloads-are-separate),
which is the authoritative account. The row is corrected here rather than
annotated because a status table is read as current state, not as history: a
competitive review of this repo took the two passages as a contradiction it had
to adjudicate, which is a fair reading of a table that claims a shipped feature
the code deletes on launch.

**What ships offline today:** river data — put-ins, hazards, the river line, the
last reading — seeded free for every curated river on any launch with a
connection. The basemap does not; with no signal it renders blank while the rest
of the river screen still works. There are no user waypoints and no Apple Watch
app.

**River Mode (#1448) — implemented; device verification and release status
unconfirmed.** Three states, kept apart on purpose because they are easy to
blur:

- *Implemented in code:* on-water progress from GPS (miles left, percentage,
  time left; `src/lib/floatSession.ts`), recorded natively
  (`modules/eddy-float-recorder`, ADR 0014): a Core Location service session
  and background activity session record with the phone locked on When In Use
  permission, append every fix to an on-phone journal, and resume themselves
  when iOS relaunches Eddy; `src/float/recorder.ts` replays the journal into
  the session. Minimum iOS 18. Trip downloads
  for offline maps (ADR 0011), and a Lock Screen / Dynamic Island Live Activity
  (`docs/float-live-activity-plan.md`). The map frames the chosen stretch
  with the access points and known hazards along it; the screen shows the next
  hazard, an arrival time and a sunset warning. Serious hazards, the approaching
  take-out and arrival are notified. The arrival notice uses a 0.1-river-mile
  threshold, which also accepts positions past the take-out. Both ordinary
  and off-map arrival notices ask the paddler to finish once off the water;
  neither confirms a landing. The off-map arrival notice names the chosen
  take-out without claiming proximity or a remaining paddling distance.
  A float left running ends itself an hour
  after arrival or 45 minutes after leaving the river (`src/lib/floatEnding.ts`),
  never for stopping or losing signal, and only on fresh evidence of being
  away. The arrival end waits while confirmed positions keep moving
  downstream past the take-out: a paddler who went on past it is still
  floating, and the recap still counts the float finished at the planned
  take-out once they stop. The arrival prompt carries a Finish action, and
  a finished float's reminders are dismissed from Notification Center.
  End offers Discard while a float is under five minutes old or has measured
  under a tenth of a mile; nothing is filed in history. Resuming after iOS ends Eddy is device-unconfirmed, so the screen
  still asks people to leave Eddy open in the background rather than
  promising it (runbook gate "Closing Eddy mid-float"). A take-out off the mapped
  river is never recorded as reached: reaching the river's closest point is
  kept separate (`riverEndAt`). Progress is along a known route, derived from
  the raw track, which stays on the phone (excluded from backups) and is
  deleted with its recap or the account. Signed-in
  recap summaries are backed up separately (ADR 0012). Hazard reports explicitly
  send the location the user submits.
- *Visible:* always in development and preview builds; in store builds only
  when the server's `floatMode` flag is on (`src/lib/floatModeFeature.ts`).
  Whether that flag is on in production is a live setting — check
  `/api/app-config`, do not infer it from this file.
- *Device-verified and released — unconfirmed:* the "Prove on a device" list
  in ADR 0011 and the River Mode gates in `docs/ios-release-runbook.md` are
  unticked. That proves the evidence is not recorded, not that the checks
  never happened or that nothing shipped. Until someone records them (or
  confirms the store build and flag), describe River Mode as implemented,
  with verification and release status unconfirmed.

**The only entitlement gate is Eddy's written read.** Conditions, gauge
readings, hazards and the float plan are free, online or off — see `PaywallSheet`
for why safety data can never sit behind a wall.

### River Mode tools

Float tools keeps the `/float-options` route so existing notification and Live Activity
links keep working. Branded grouped cards lead with raw location sharing and Report a
hazard, then the take-out with Map/Share actions and its pickup contact. Ahead and
timestamped gauge readings follow. Refresh conditions sits beside the reading age.
Float settings groups Keep screen awake (off unless chosen), reminders, and Show on
Lock Screen. Info tips hold battery, reminder timing and coverage explanations;
accuracy, stale data, report status and actionable errors stay visible. Hazard
instructions are never truncated. Live Activity update errors and the system's
eight-hour expiry (distinct from a swipe-away) remain visible beside its switch;
disabled Live Activities offer Open Settings. Report history only appears when
there are reports for this river. The root remains a ScrollView for native formSheet
measurement. Large text can wrap actions and switches use Eddy's teal accent.
A hazard report can be withdrawn while it waits; a report Eddy gave up sending
(a day of attempts, or a week old) says so with Retry.

The latest valid raw recorder fix is stored separately from the accepted GPS/map
position and the confirmed river position. Coarse fixes may update sharing, never
progress, ETA or arrival. Sharing never falls back to a snapped river coordinate.
Restored fixes are last-known until a newer fix arrives. Old sessions migrate only
their genuine GPS position, with unknown accuracy. Raw fixes stay out of recaps.
Sharing prefers a known precise raw GPS fix (at most 75 m, at most two minutes old)
when the newest fix is over 500 m and at least ten times less precise. That earlier
fix retains its timestamp and is labeled last-known. The newest raw fix is still
stored, and becomes the sharing position when the precise fix ages out.

Coordinates use decimal degrees and selectable text; the native share sheet supplies
Copy. No clipboard or contacts module is added. The pickup contact is stored in a
separate on-device key, never sent to Eddy's servers, and cleared by `discardFloat`
during account deletion. Normal device or iCloud backups can include it.
Calls and messages require a saved number
and an explicit tap. Removing a contact is also available in its editor.

Ahead uses the last confirmed river mile and dates that basis when it is stale.
A known-empty list gets one “No mapped stops or hazards ahead” line; unavailable
hazard data always keeps its visible warning, even when the list is empty.
Mapped accesses are not described as safe exits. Only this phone's reports captured
since the current float started appear in Ahead or the unpositioned list. They are
labeled as reports and keep their submission status. Unpositioned reports are separate;
refused reports stay in report history. Map taps use one 56-point rectangle query
across marker and endpoint dot/label layers, deduplicate features, and put endpoints
first. Only overlapping choices use a modal; single selections stay over the map.
Show on map commands are consumed once. Recenter, Show route, or closing the marker
card clears the temporary highlight. Reopening River Mode does not replay a target.

Float tools reads cached conditions first, then refreshes on open or on request.
`fetchCondition` caches successful readings with their observation timestamp for
the next offline open. Tracking and progress remain independent of the network. Conditions reuse
`ReadingSummaryCard`, including the canonical mascot, ladder, observation age
and stale/expired handling. The toolbar labels are Tools, Report and End float;
ending remains the explicit way to stop a float and choose a different river.
There is no river-switch action that discards an active session.

The report sheet shows a nearby access name only within 250 m of a raw GPS fix
with known accuracy of 250 m or better; otherwise it shows selectable coordinates.
Accuracy and position age remain visible. Calibration can extrapolate negative
river miles upstream of the first anchor: those miles stay unchanged in the stored
report, but are omitted from its display. Choices use two columns, or one with
larger text, and the Save report footer stays above the keyboard and safe area.
The local-first delivery promise is visible; review details live in an info tip.

Saving a hazard report acknowledges local storage immediately, then updates the
visible, dismissible confirmation when the API receives or refuses it. Only a
server acknowledgement says “sent for review”; offline reports stay “saved”.
Failures show their reason and exhausted attempts offer Retry. The existing
2 km corridor validation and admin moderation remain unchanged.

Device verification remains unconfirmed: test wet-case taps, overlapping layers,
VoiceOver, largest text sizes, offline/stale GPS, coarse fresh fixes, restored sessions,
share-sheet Copy, Messages handoff, Android map links and contact deletion. Guided
Access can be tested as an optional touch lock; pause it before calling or Messages
handoffs. No in-app control lock is added.

### Starting a float

An active float remains reachable from Floats, saved routes,
and the planner even when new starts are disabled or route details are unavailable.

Ready to float offers take-out and mapped-hazard reminder choices before starting.
Those choices are saved in the initial session. Notification permission is optional
and requested only after tapping Enable; recording does not require it. The same
OS permission reader is used by readiness, River Mode and local delivery, separately
from remote push availability, sign-in and token registration. Provisional
permission (quiet by iOS) is upgradeable through the same prompt and says so;
alerts or sound turned off in Settings are shown as quiet delivery with a Settings
link. Reminders about the water ahead (take-out, stops, serious hazards) are
delivered time-sensitive, so a Focus mode does not silence a portage warning;
the entitlement is in `app.json`. Permission is rechecked on
foreground; neither permission nor scheduling proves audible delivery.
The iOS location prompt is never fired on arrival at Ready to float: the
Location card explains why tracking needs it and its button asks. Production
cold/offline launch and locked-phone delivery verification remain unconfirmed.

New iOS plans and floats default to **Kayak** when no valid vessel is supplied.
An explicit vessel from a plan, restored setup, or saved preference is preserved;
the picker and newly created recording both resolve missing/blank values to Kayak.
Existing sessions and historical recaps keep their recorded vessel unchanged.

Every entry opens **Ready to float** in its originating tab. A plan fills in
river, named put-in, take-out and boat; the Floats button starts with an empty
river and take-out unless an unfinished downloaded setup is recovered. River,
From and Take-out are editable fields. Pickers are
searchable sheets over the same draft, and cancelling one leaves the draft intact.
Above the map, one route card holds them. With existing location permission
it obtains a preview fix without prompting, and with an empty river it fills
the river only when GPS sits on a mapped river line
(closest line at a confluence; "Found from your location", Change one tap
away), with the put-in as Current location. A nearby river alone is never
selected automatically. Detection retries on fresh GPS and at most every 30 seconds
until its first match, while the fix is usable, serializing requests and ignoring
cancelled answers. The 150 m line limit remains unchanged. Opening and cancelling
a picker only pauses detection; typing in river search or selecting a river or
endpoint stops it for this visit. A matched river and its endpoints stay put as
later GPS fixes arrive. So at the water the usual setup is two
taps: a take-out and Start tracking. With a known start and no take-out, the
next three downstream take-outs are listed inline with distance and moving time,
then a See All row when there are more. Without a known start, Choose a take-out
still opens all eligible endpoints; no downstream distances or “next” choices
are invented. Choosing a named put-in enables downstream suggestions.
The picker leads with Choose your take-out, then a compact river/change row,
search and results. Its task title stays visible while choosing a river.
Without a river, search and nearby/all river choices appear directly in Ready
to float. Choosing a river reveals its route fields and downstream suggestions.
Changing a river in the sheet continues to its take-outs there. Once chosen, Put-in and Take-out read as one connected
stretch with river miles on each stop and the leg's distance and time between
them. Location status is a small badge on the put-in; Start tracking stays fixed
below the scrolling content. River
selection shows search and nearby/all river rows immediately; tapping a row is
the selection, with no separate confirmation card. If Take-out or From still
needs a river, its sheet opens the river list directly and continues to access
points after selection. Changing rivers inside an access sheet is provisional
until the endpoint is chosen; closing discards those edits. Access search keeps
the existing photos and river-distance labels. From
can be **From my location** or a named access in either path. Vessel is one
compact row below the route card, with the selected vessel's shared Eddy glyph
and no explainer caption. Tapping the row opens a native selection menu
with the current choice checked; choosing an item applies it and closes the menu.
The plan wins, otherwise the last Find a float/readiness choice wins, with kayak
as the default. It is never a separate required step. Moving-time and arrival
details share the card once the route is valid, and the field is disabled while
starting. Estimated arrival is the prominent time value, with **Starting now ·
excludes stops** and **Tomorrow** (or a date for longer floats) when needed.
The sun-over-river mark accompanies a short sunset/sunrise line; daylight
advisories use readable coral ink instead of error red. Both the picker and
arrival summary stack at large text sizes. The same compact picker is used by
Find a float.
The bottom-right info button lists each vessel's normal-water moving speed
from the shared vessel API lookup, with a note that river flow adjusts the
estimate and stops are excluded. It remains available before a route is chosen.

Planning and saved-detail buttons say **Float this route**. Only readiness's
**Start tracking** commits a new session. Every entry resumes an existing float
directly, without another confirmation screen. Setup is removed on success.
River Mode, options and the just-finished recap live in one root full-screen
presentation above all tabs. Historical recaps use the same content in a normal
tab detail (`float-history-recap`), with Back restoring the History list.
Constant navigation identities prevent duplicate recording views. Options (also
opened by Live Activity) uses a root ScrollView in its native form sheet;
physical-device verification of the blank-sheet fix remains unconfirmed.
Recenter is hidden while the map follows the paddler and reappears after a pan
or Show route.
River Mode shows the recorder’s usable GPS position, including off-river fixes,
with its accuracy ring and a heading needle when the fix carries a course.
Only confirmed river positions advance progress, distance or ETA. The map
initially keeps the user and take-out in view and re-frames only once the dot
leaves the inner part of that frame, never for GPS wobble; a manual gesture
stops following.
Recenter follows the user; Show route fits the complete stretch and actual
landings even while off-route. A restored or stale fix is visibly dimmed until
fresh GPS arrives. Coarse fixes (worse than the tracker’s 75 m limit) read as
“Weak GPS · ±N m”, not as waiting for GPS. The panel also shows time on the
water (to arrival) and miles from the recorded start. Arrival, a hazard just
ahead, the sunset warning and tracking problems are announced to VoiceOver. The tracking indicator pulses once per actual fix, respects
Reduce Motion, and shows the last update age. The five-second display clock
runs only while River Mode is focused, the app is foregrounded and a float is
active; it refreshes immediately on return. This clock does not request GPS
fixes or control recording. Live Activity status reflects
its real availability rather than promising an active Lock Screen display.
Options expands to full height and scrolls, with hazard reporting before
reminders. Details and limitations use info buttons.

Closing returns to the actual origin and recording continues; a cold recording
link closes to Floats. A screen opened cold from a Live Activity or the
arrival notification waits for the stored float to be read
(`useFloatSessionLoaded`) before concluding there is none; the notification's
Finish action does the same before ending the float.
Standalone planners are removed when handing off, so Back cannot reopen an
empty, dismissed planner. Persisted session `saved`/`quick` kinds remain for
recovery compatibility, not as separate setup experiences.

Readiness checks foreground location without prompting; with permission it
obtains a preview fix automatically. A recent, sufficiently accurate OS-cached
fix can answer immediately; otherwise it requests fresh GPS. While Ready stays
open, expired or failed fixes refresh automatically with a 30-second minimum
retry interval, only in the foreground. Permission checks never prompt, and
initial checking does not flash an Enable location card. Its one permission
card offers the system prompt,
Precise Location, or Settings as appropriate. Browsing never automatically asks.
The GPS line distinguishes permission, finding a fix, GPS ready, and a fix that
isn't on the chosen river. Only fixes under two minutes old, within 100 m
accuracy and within 150 m of the chosen river supply a current starting mile.
For a named put-in it also shows above/below distance and **Start from here**.
**Near** requires a fix accurate to 25 m and within 75 m of the actual access,
independent of river matching. At an off-map launch, readiness explains that
distance tracking waits for the mapped river. The launch radius never grows
with `offLineMeters`, and the snapped river point is not launch evidence.
No preview fix seeds recording or adds travelled miles. The named put-in stays
as the plan; every new recording measures progress from its first confirmed
on-river fix. That origin is persisted once and is used for the map marker and
recap. A precise confirmed river fix at the actual access retains its launch
name. For an off-map launch, three accurate post-Start fixes at the access,
with no gap over 30 seconds, independently confirm the name before the first
river match. This evidence survives relaunch. Waiting at an off-map launch
does not start the away/auto-end timer, and missing off-map distance is never
invented. A different launch reads **Recording started 3.2 mi below Akers**, without
claiming Akers as the actual access. Recaps keep that description in optional
`startNote`; `putInId`/`putInName` identify only a confirmed launch or are null.
The archive API must accept the field before the app ships. A capability check
keeps note-bearing uploads pending against older servers, preserving the whole
summary on-device for retry. Existing completed recaps are unchanged. Recaps
also keep their recap context (`startCondition`, `riverSpan`, `coveredMiles`,
`startWeather`) under its own `recapContext` capability, by the same rule
(ADR 0012); `missouri-float-planner/shared/float-recap.ts` reads it for the
history card and recap.
The recap leads with a compact condition-tinted mood header, then **Your route**:
the full start-to-take-out river stretch, progress, credited distance and total
time. It replaces the recap's whole-river exploration/lifetime panel. Existing
history and share-image measurement rules remain unchanged. New summaries save
`routeSnapshot` (start/take-out miles, start name, calibration, original map-anchor
IDs/miles and optional download key), without coordinates. A confirmed launch
uses its access name; an on-water start uses its position relative to the planned
put-in, such as **On-river start near Akers**, or **Recorded start** without one. A selected put-in may still
frame an entirely untracked planned float, without claiming progress.

The map prefers the original downloaded route package when available. It can
also reconstruct the original mile calibration on cached river geometry using
the saved anchor IDs/miles. Only accepted anchors needed for this stretch are
saved (including neighbors bracketing an on-water start/end, at most 128).
Adding/removing unrelated access points or changing published miles, including
intermediate miles, does not move historical coverage. A missing required anchor
or incompatible geometry leaves the map unavailable with **The river’s map has
been updated since this float.** A missing/offline source uses **Route map
unavailable** instead. Download removal does not remove the recap's saved
calibration. Older snapshots without map anchors still require their original
river-wide hash; a matching original download can supply it. Route names and
stats remain readable in every case. Older summaries without a snapshot show their
route names/stats without inventing a map or percentage. Coverage comes from
credited intervals, including the tracker's existing bounded gap estimates;
other gaps stay dashed. A solid river line is not the paddler's GPS trace.
Only confirmed arrival earns **100% complete**. Limited tracking suppresses an
unconfirmed percentage, but never undoes a confirmed arrival. **Last recorded**
is not necessarily where the float ended. Maps do not request location and do
not capture scroll gestures. Both appearances use the downloaded **STYLE_URL**
(outdoors-v12), with legible light-map overlay ink. Mapbox attribution stays
visible and separately accessible; both renderers have a VoiceOver description
that mentions coverage only when present. A river-only
SVG fallback uses the same geometry when native maps/styles are unavailable.

**Time on the river** appears only with tracked time, and a missing distance or
speed does not hide other available measurements. Credited coverage is **River
distance**, in **river mi**; older tracked-distance fallbacks retain **mi**.
Unavailable GPS, no credited river miles, and unrecorded moving time have
separate display states in `recapMeasurements`. Positive measurements below
0.1 mi stay visible. **Conditions at start** adds
a small row for the saved start-weather observation. The existing two-hour
weather freshness rule is relative to Start, not the date the recap is opened.
New observations retain their weather icon code; older ones show temperature
without inventing sky conditions. Missing weather leaves no placeholder.
Header condition tint and otter mood retain the shared independent rules.

`routeSnapshot` and the optional `startWeather.conditionIcon` require archive
capability **recapRouteWeather**; `mapAnchors` and `downloadKey` additionally
require **recapMapCalibration**. Deploy the archive API update before releasing
this iOS build. Against an older server these complete summaries stay local and
retryable, never stripped and acknowledged as backed up. Deletions and older
summaries can still sync. Native verification is pending: review the recap from
Finish and History in light/dark appearance, largest text, offline maps, long
access names, VoiceOver map/attribution traversal, early finish, confirmed arrival with GPS gaps, no tracking,
weather-only conditions, missing/stale conditions, backup retry and deletion.

Older sessions retain their progress checkpoint; a recorded coordinate is never invented for them. Permission
and Location Services are required; a GPS timeout does not prevent starting.
Locked-phone recording uses the native background activity session with When
In Use permission (ADR 0014); there is no Always/background permission sheet.

Both start choices use `/api/route-estimate` and the selected boat's moving
speed, with **Moving time · stops not included**. A location start sends its
river mile (not GPS coordinates) inside two validated access points; the server
uses that mile for gauge selection and remaining distance, and does not reuse
a published time for the whole stretch. Named starts use the same model as the
planner. Unknown, withheld, stale, offline or failed estimates say **Eddy will
learn your pace** and never block tracking. Estimates are short-lived and
cancelled on edits; results from another draft cannot appear on the current one.
An older server that doesn't acknowledge the partial starting mile is ignored.
The server tolerates up to 0.1 river mile of lower-bound calibration drift,
clamps it to the upstream bound, and echoes the requested mile as acknowledgement.
Past-take-out and reversed partial requests remain invalid. Named reverse
requests retain min/max hazard coverage. Published miles increase downstream;
reversed geometry vertices do not reverse that convention. Boat metadata is
fetched once per session, coalesced across edits and retryable after failure.

The map, distance, estimate and offline section derive from the same draft.
Changing the river clears both ends; moving the start beyond the selected
take-out clears that take-out. Pickers share the planner's photo cards and label
river miles separately from miles from the put-in or current location. The
Offline map section is always present. It shows **Offline map ready** only for
an existing matching download that passes the complete tile and style checks.
Otherwise it says “For an offline map, build a route and download it before you
go,” with **Plan a float** carrying the river, any named endpoints and the boat.
A location start carries its take-out but asks for a named put-in in the planner;
GPS coordinates never travel through navigation. The planner offers saving the
route and then its download card; saved-route details retain the same controls.
Only the original, unchanged stretch reuses its saved plan's download and share
code. An old download cannot be labelled ready for an edited stretch. Existing
unfinished packages from older app versions still recover on a fresh Start a
Float (up to 75 m of GPS drift at the same launch may reuse their padded tiles).
Deleting the package invalidates recovery. A saved location only defines tile
coverage, never GPS readiness or recorded origin. Each recording has a new id
independent of the package, which Storage protects while in use. Starting clears
the legacy pending setup.
Persisting dated estimates with downloads remains a separate change.

`app/(tabs)/(today,map,floats,favorites,alerts)/float-start.tsx` owns the draft;
`src/float/start/` owns river selection, permissions, estimates and committing.
Device verification of presentation, Back/swipe and permission transitions is
unconfirmed. Native QA must include all five tab origins, saved and unsaved
starts, both From choices, edits during an estimate, planner download handoff, offline starts,
large text, GPS timeout, and permission changes in Settings.

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

### Float history and backup

Floats → Saved Floats & History contains saved routes and end-of-float recaps.
Its top-right Backup control opens account backup and optional summary-sharing
settings for both segments. History works on the device as a guest. Apple sign-in backs up
completed summaries and the user's private saved-route collection through
`/api/me/float-archive`; opening a previously shared plan URL remains separate.
Signing out hides that account's local history. Signing into another account
never imports the previous signed-in account's history. Guest history is adopted
once on sign-in, including an upgrade to an existing Apple identity.

The default-off “Help improve float estimates” setting permits internal review
of newly completed floats. Backup works independently. See ADR 0012 for
measurement gaps, immutable completed summaries, deletion markers, revocation
and the end journal. Device and release checks live in the release runbook.

Recaps lead with the route, tracked distance and total time. The branded duration
bar compares Moving and Breaks over the time Eddy tracked, beside moving speed;
it is not a chronological trace. Time Eddy could not place on the river is not
a third category: one line names it only from five minutes up, which is why
Moving and Breaks can fall short of Total time. The info button says what each
figure means. Backup status
comes from the recap row and the account sync state: local, syncing, backed up,
waiting or failed with Retry. A subscription is not required for backup, and
sign-in copy is shown only for guests. Raw display coordinates remain local and
are excluded from recap uploads. Uploads are batched by serialized size as well
as row count; a 413 isolates the oversized row and marks it too large to back
up. The periodic timer and the post-edit debounce upload only; the account's
history is read back on foreground, sign-in and manual sync. A recap filed under
another account (ended as a guest, or under a previous sign-in) says so rather
than "finishing". Account deletion also clears queued hazard reports and trip
route packages with their map packs.

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
Restore Purchases (3.1.1), and in-app account deletion (5.1.1(v)). Restore is
never a dead end for a guest: the same tap signs in with Apple, configures
RevenueCat for that account, then restores. The auto-renew
disclosure sits with the subscription controls rather than behind a link, for the
same reason.

## Push

Remote push and local reminders share OS notification permission interpretation.
The explicit Enable action requests alert and sound permission, not badges (Eddy
does not use notification badges). Provisional permission counts as allowed for
remote delivery, so Profile may show push as on even when delivery is quiet.
Float reminder controls tell provisional (upgradeable through the in-app prompt,
offered as Allow alerts) apart from alerts or sound turned off in Settings
(labelled quiet delivery, with a Settings link).

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
still authenticate. They unregister without opting the device out: the
persisted opt-out belongs to the Notifications switch alone, so the next
account to sign in (or the same one) registers again as usual. An unregister
that cannot be sent (no signal, or a session that could not be refreshed) is
recorded on the device as a release owed (`src/lib/pushLedger.ts`) and sent on
a later launch to `/api/device-tokens/release`, which needs no account: the
push token and the row id the server returned at registration are the proof.
Independently, `/api/me/device-tokens` releases a token from any other
account before registering it: a push token names the phone, and the account
leaving it must not keep being notified on it. The same ledger skips a
registration that would change nothing (same account and token, within a
day), so foregrounding does not spend the route's fail-closed limit. Signing out is
local to the device (`scope: 'local'`); it does not revoke the account's
sessions elsewhere.

Eddy Settings shows a switch only when the app can change notification state.
When iOS has denied permission, the row opens iOS Settings instead; when the
remote push flag is off, the row reports that alerts are unavailable rather
than showing a switch that cannot move. The sentence explaining why alerts will
or will not arrive remains a tested precedence order
(`src/lib/notificationCopy.ts`): several reasons can be true at once, and naming
the wrong one sends someone to fix something that was never the problem.

### Map sheet tab changes and campsite reservations

The access sheet renders its summary and tab bar once, outside the horizontal
page track. Vertical page offsets preserve that shared header's expanded,
partially collapsed or collapsed position when changing tabs. The per-tab body
continues to scroll independently.

Available campsite rows prefer the provider's exact-site URL. When only the
park reservation URL is available, the row says to select the site and date
there; it does not claim that the provider preselects them. Walk-up sites do not
offer an online booking action. Image taps still open the photo gallery.

### First-run onboarding

The welcome uses Eddy's existing wave artwork, a scrollable body, and the current
safety/terms acknowledgment. The safety disclaimer and terms sit in the pinned
footer beside the “Agree & get started” button that acknowledges them, and the
terms sentence names that button exactly. At accessibility text sizes or on a
screen under 700pt tall they move to the end of the scrolling body, directly
above the button, so the footer never outgrows the screen. Feature rows use
Eddy's own marks. First-run motion lives in `OnboardingMotion.tsx`: Eddy bobs
on drifting water, copy and the first six picker cards rise in on a short
stagger (later cards render in place, since they mount mid-scroll), and buttons
and selections give a small spring with selection haptics. The sign-in offer
shows one static example alert. Motion is decoration on
features and controls only, never on a reading, and every piece renders its
resting state under Reduce Motion. The optional next screen searches the entire river
and dam catalog, including lake names. Suggested rivers and three dams start the
list; an explicit Near me tap changes those suggestions without discarding picks.
River photos come from the index. Featured dams have bundled attributed photos;
missing imagery uses Eddy's existing river/dam illustrations. Cards become one
column for larger Dynamic Type and keep conditions, measurements, and reading age
on separate lines. Dam measurements use generation/release semantics, never a
floatability rating. An idle dam card leads with the posted schedule's next move
(`firstRunDamCard`), not the leakage an idle powerhouse reports; a stale schedule
is dropped there, and total release stands in only above the dam's generation
floor, carrying its own timestamp and its daily-mean label when it has one. Cached river verdicts are aged with the same rules as Today.

Both kinds of selection use additive Favorites writes, so a reinstall cannot
unstar synced favorites. Today already reads those favorites for its cards.
On the picker, public river, gauge, featured-float and safety requests warm a
one-use memory handoff, fresh for 30 seconds after completion; dam data and Eddy's Reads warm their existing
shared stores. Picker/Today reuse those reads without blocking completion. Failed
or expired handoffs are discarded, and pull-to-refresh clears the handoff before
fetching. The picker requests location only after an explicit “Find rivers near me” tap;
manual search and Skip remain available. After the picker, new guests receive an
optional native Apple sign-in offer to set alerts and sync Favorites, with an
example alert worded as `buildNotification` words the real push. “Maybe later”
finishes onboarding; canceling Apple's sheet stays on the offer. It does not
create alerts or ask for push permission. Completed existing installs and restored
permanent sessions skip the offer. Interrupted onboarding resumes its pending step.

First-time Apple signup uses native `linkIdentity` to retain the guest's user id.
Enable manual identity linking in Supabase before shipping the client. Only
`identity_already_exists` falls back to signing into the existing Apple account;
configuration/network errors leave the guest intact. Favorites reconcile with
that restored account. Guest/local-only users can remove saved data in Settings;
server deletion must succeed before the app clears a guest's session.

The picker labels list expansion “Show all rivers and dams” and its exit “Skip
for now.” “Review selected (N)” opens a sheet derived from the same live favorites
array as Save. Removal updates the count and card checkmarks immediately, and an
empty selection keeps the sheet open with a Done action. The main list has no
duplicate Selected section and does not reorder cards on selection. Result counts are announced after a pause in typing. The primary
button reads “Add to Today,” with a separate selection count/hint. Dam request
status distinguishes loading, failed requests (with retry), and absent readings.
Known tailwater slugs are preserved when saving dam favorites; offline selections
remain possible. Denied location offers Settings, and returning with permission
granted re-enables Near me without automatically prompting or acquiring GPS.

Preloading is a head start, not a guarantee: spending longer in the picker can
expire the handoff and cause Today to fetch fresh data. Pending requests remain
shared until their API deadline, and Nearby reuses the gauge preload without
consuming Today's copy. Existing launch requests outside onboarding still run
before acknowledgment; this change only defers the onboarding-specific preload.


## Native navigation and control follow-up (October 2026)

### Expanded gauge charts

History range availability uses the selected station's provider immediately,
from the same pure `shared/history-capabilities.ts` declaration used by the
server's provider adapters. Switching between USGS gauges keeps 24h, 7d, 30d,
90d, 1y and Custom dates available while the separate detail request is pending
or fails. An explicit server capability declaration takes precedence. NWS,
USACE and unknown providers retain their supported/conservative limits; do not
reuse the previous station's capabilities or guess a provider from its site id.

River, gauge and map-history charts have an explicit Expand button. The expanded
native full-screen modal supports portrait and both landscape directions, with a
Done action. Rotating an ordinary page does not open it. One controller owns the
range/custom dates, units, comparison layers, selection and history cache for
both presentations, so opening/closing does not fetch again or reset the source
page/map pin. Selection stores the reading's timestamp and observed/forecast
identity; resizing cannot move it to a different reading. In the expanded view,
the readout has reserved space outside the plot and persists after scrubbing.

Pinch zoom changes the time range and retains the full-window value scale by
default. Once zoomed, the expanded chart offers **Fit visible values**: the
vertical axis follows the visible observations, forecast and enabled comparison
layers, with nearby threshold context and the usual minimum span. The fit
includes line intersections at the viewport edges but never treats those as
readings or bridges telemetry gaps. A window without visible data retains the
original scale. **Restore value scale** keeps the time zoom while restoring the
full-window vertical scale; **Reset zoom**, pinching all the way out, or changing
the station, measurement or history range clears the fit. The compact chart
always retains its full-window value scale. Closing and reopening the expanded
chart retains the fitting choice for the same zoomed range. Fitting and the
Compare panel's full threshold scale are mutually exclusive choices.

Expanded USGS charts have a Share action (the system share glyph). It opens a
native action sheet titled with the station and visible dates: Share Link sends
a fixed-date web link through `shareLink()`, like every other screen; Share
Image renders the PNG on the server and hands the system share sheet the file
together with the link text, so Messages sends both. There is no separate
preview screen: the system share sheet previews the attachment. Image
preparation requires internet; a failure to prepare it is reported, a cancel or
failure inside the share sheet is not. Station sharing uses dedicated USGS and USACE share paths; ordinary
gauge and dam website URLs keep their existing behavior. See
[ADR 0015](../docs/decisions/0015-gauge-and-chart-sharing.md) for the versioned
state contract, shared scale/calendar rules and outstanding device gates.
Deploy the additive web routes and timezone fields before distributing the
app build. Charts use station time rather than device time. Missing coordinates
or older web responses without `timeZone` use UTC, with a visible UTC note on
the chart; skipping the deployment order therefore produces UTC labels.
App-opening associations remain off until the ADR's store and
compatibility gates are recorded; shipping the handlers does not enable them.

The app config permits native rotation. The local `eddy-orientation` Expo
module supplies a portrait-only root view controller through a React delegate
handler, before React mounts. This also covers onboarding/legal, the first-run
picker, forced upgrade, launch failure and root error screens, which can render
without a navigation stack. Root, tab and alert stacks retain their portrait
options as secondary guards for their own native presentations; changing a
stack option alone cannot unlock a screen beneath the portrait root.
Full-screen chart presentations supply their own landscape-capable
orientation masks; there is no app-wide runtime lock to race on dismissal.

`GaugeChartSheet` uses full-screen panels when opened from an expanded chart,
with portrait and both landscape directions enabled. Inline chart panels retain
their native page-sheet presentation. iOS ignores `supportedOrientations` for
page sheets, so setting that prop alone would not give expanded panels their
own rotation policy. Each modal has its own safe-area provider.

The expanded readout separates the condition label from the value and unit.
Reserved minimum heights keep ordinary readings steady, while unconstrained
text can wrap and grow at accessibility sizes instead of being clipped.
This changes the native configuration and **requires a new development/TestFlight
binary**. Keep fingerprint runtime versioning; an OTA alone cannot change the
installed binary's supported orientations or add the local root controller.
There is no new third-party dependency. On Expo upgrades, verify the generated
modules provider registers `EddyOrientationReactDelegateHandler` and that the
factory still uses it. The archive check requires the local module's metadata,
podspec and Swift source, while excluding generated native files and secrets.

Before distribution, verify on an iPhone:

- Expand from River, Gauge and a map pin's History tab. Change range, measurement,
  comparison layers and custom dates; close and reopen. Keep the same settings,
  cached line, source scroll position, selected pin and sheet tab/detent.
- Scrub an observed and a forecast reading, lift your finger, and rotate left,
  right and back. Keep the same timestamp, value and source. Try 30d and 1y.
- On a 1y chart with a large peak, pinch into a quiet week, then tap Fit visible
  values. Confirm the vertical range tightens and follows further time zooming
  and panning. Enable Typical range, Historical median and Last year; all visible
  layers must fit. Check negative stage, flat flow and an outage window. Restore
  value scale must keep the selected dates; Reset zoom must restore both axes.
  Check the fit action in both orientations, light/dark and large text. Close and
  reopen: the compact chart keeps its original vertical scale, while the expanded
  view retains fitting. Change measurement/range and confirm the fit is cleared;
  selecting Full Eddy scale/Full stage references must also clear it.
- Close while in landscape, including with VoiceOver escape. The source returns
  to portrait. Rotate on each tab root (Today, Map, Favorites and Settings),
  switch tabs while sideways, and test Map with a sheet open, the planner and
  the alert-creation modal. All remain portrait.
- Cold-launch sideways into legal/onboarding and the first-run picker; also
  exercise forced upgrade, the launch-stalled fallback and root error boundary.
  Each stays portrait before the navigation stack mounts and on retry/reload.
- Separately inspect the **system launch screen before the root controller
  exists**, using a release build launched while sideways (from a landscape app
  or landscape Home Screen where supported). Watch for a sideways splash or
  rotation flash during the handoff to the app. Expo already generates
  `UISupportedInterfaceOrientations` with portrait first; verify that order
  after SDK/config changes. This configuration check does not replace launch QA.
- With Rotation Lock on, expand and explore in portrait. Check background/resume
  and repeated open/close while the phone is held sideways.
- Open Compare, Data & details, CSV sharing and Custom dates from the expanded
  view in both orientations; rotate while each panel is open. Done (including
  VoiceOver escape) returns to the expanded chart with its settings intact.
  Test the keyboard/date picker and the system CSV share sheet in landscape.
- On a Dynamic Island phone, check the chart and panel Done buttons in both
  landscape directions. Neither should overlap the side safe-area inset.
  Expanded panels do not swipe down to dismiss; confirm Done remains reachable
  with the keyboard open and at large text sizes, and test VoiceOver escape.
- Check small phones, the largest Dynamic Type sizes, light/dark and Reduce
  Motion. Confirm the full value and unit (for example, `12,400 cfs`) and
  condition label remain readable, including negative/decimal stage readings.
  Scrub observed and forecast samples with quality flags. Large text can scroll;
  the plot never collapses underneath controls.

### Tab navigation

Each tab now owns its own stack. Shared detail routes use Expo Router group
arrays; public URLs remain unchanged. `npm run typecheck` also validates the
actual Expo route tree and exercises shared path resolution, push/Back actions,
tab-history preservation, notification destinations, and root-modal dismissal.
Cold storage links belong to Settings and saved floats to Favorites; warm detail
links retain their originating tab. Quiet hours and alert editing use root modal
sheets, preserving the tab and detail screen underneath. Cold sheet launches
close to Settings or Alerts when there is no originating screen.

The control update adds `expo-symbols`, `expo-glass-effect`, and the native
community date picker. The existing EddyMapSheet module also observes iOS
Increase Contrast so the UI can resolve accessible string colors for Mapbox
and charts. These changes require **one new development/TestFlight binary**;
a JavaScript reload or OTA alone cannot install them. Keep fingerprint-based
runtime versioning. Older clients without the contrast observer keep the
existing palette; UIKit dynamic colors still adapt where supported.

Reduce Transparency is read and subscribed to once in ThemeProvider, so controls
that remount after a sheet drag reuse the resolved setting. Glass buttons use
native press feedback; opaque fallbacks retain explicit pressed feedback.
Common utility glyphs use the explicitly named ControlIcon wrapper.

Device checks before distribution:
- Open the same river from Today and Favorites; switch tabs and return to each
  tab's own detail/back history. Open an external river/shared-float link cold.
- Search Today, dismiss the keyboard by scrolling, open a result and return;
  preserve the query/results. Check Cancel and VoiceOver escape.
- Choose custom dates around midnight and March/November daylight-saving
  changes. The picker shows local calendar days; the API receives ISO instants.
  End cannot precede Start; moving Start past End moves End to the same day and
  announces it to VoiceOver. Earliest observation dates are not yet in the API.
- Toggle Increase Contrast and Reduce Transparency while the app is open.
  Check text, control boundaries, map controls, and chart labels in both themes.
- Drag the map sheet quickly in both directions while search/layers/locate
  controls appear and disappear. No glass ancestor uses opacity to hide.
- Check large text, VoiceOver information actions, save/favorite haptics, and
  failed saves (no success feedback).

### Directions app chooser

Single-destination Directions actions share `DirectionsMenu`: access details,
river access/campground rows, map pin sheets, planner endpoints and saved/shared
floats (including saved logistics offline). Driving directions lists Apple Maps
and installed Google Maps/Waze; Outdoor maps lists installed onX Offroad/Gaia
GPS. Empty groups are omitted. The chooser uses plain app names and generic
icons. Installation checks run on each Directions tap, so installing another app
does not require restarting Eddy. After all checks finish, Apple Maps opens
directly if it is the only option; otherwise the chooser appears. A failed direct
handoff shows the chooser with an error and a retry option. The separate take-out
→ put-in shuttle action remains an Apple Maps route and uses the same enriched
parking destinations as the endpoint buttons.

Coordinate/link generation lives in `directionsChoices.ts`. Complete curated
parking coordinates take precedence when the destination supplies them. A
partial override never mixes a parking latitude with a waterline longitude.
Outdoor links continue using `@eddy/geo`; this change does not verify their URL
formats against an installed provider app. Failed native opens try the same
provider's web destination; if both fail, the chooser displays an error.

The added `waze` entry in `LSApplicationQueriesSchemes` requires a new native
build for Waze detection. Keep the existing fingerprint runtime policy.

Device QA: check the one-tap Apple Maps handoff with no optional apps, including
a failed open and retry; check the chooser with each optional app installed;
verify the **destination pin**, not just that onX/Gaia launch. Test each float
endpoint and the shuttle direction, a curated parking override, Cancel/backdrop
and VoiceOver escape, double taps, return to the planner, offline saved trips,
large text on a small phone, both appearances, and Reduce Motion.

Shared chart views retain the timezone saved in the link. New links include a river slug alongside its UUID for recovery after a catalog reseed. Image attachments report unavailable context rather than substituting current readings; link sharing stays available during image preparation. See [ADR 0015](../docs/decisions/0015-gauge-and-chart-sharing.md) for compatibility and device-release gates.

### Map interaction contract

A map-level 44-point query resolves POIs across active sources, and the mark
nearest the finger wins. The pin, cluster and river-line queries leave in one
round trip and are read in that priority order, so a tap on empty map (the
gesture that closes a sheet) does not wait on every layer it missed. The map
rotates but never tilts: pitch is off, because the compass resets heading only. Places that overlap become one numbered stack, by the
web planner's rule (`src/map/pinStacks.ts`): marks within 56pt of each other at
the current whole zoom, across every layer drawn as individual marks at that
zoom. Hazards, route endpoints and the selected place never stack. Tapping a
stack below zoom 13 eases in to the zoom where it splits, capped at 15, when
that is more than half a level away; otherwise it opens "N places here" in the
places sheet. Cluster taps ask the owning source for its expansion zoom,
falling back to two more zoom levels if that query fails or returns an invalid
value. There is no tap cycling and no hint banner.

Below `ZOOM.cluster` every Eddy pin layer that is on — places, services, rated
gauges and dams — is counted by ONE statewide index, so a lone dam or gauge is
never a dot beside a count that should hold it; the USGS reference tier keeps
its own parchment counts. Every count breaks into pins at the same zoom
(`ZOOM.cluster`), and with three exceptions every
layer takes the same rungs: a `ZOOM.min` floor, marks at `ZOOM.places`, names
at `ZOOM.names`. Hazards never cluster and resolve at `ZOOM.cluster` (a safety
rule); the selected place is drawn by its own source on top of every place
layer, at a larger scale and named at every zoom, even if its layer is
switched off while its sheet is open. Pin sources are mounted for the life of
the map and empty when their layer is off: a source mounted on a toggle lands
at the top of the native style and paints over hazards. Hazards are the last
pin source, over the route endpoints and the selection. Map marks use the
light palette in both appearances, because the basemap is light in both. A tap
picks the mark nearest the finger, measuring a bottom-anchored pin from its
bulb; overlapping counts resolve the same way. A tap on public land opens a
callout naming the parcel and its access class — ownership, not permission —
and leaves the open sheet alone.

POI selection preserves zoom and moves the camera only if the marker's touch
area would be obscured by the measured sheet/chrome. Every new gesture cancels
stale asynchronous work and updates the remembered camera. A blank-map tap
closes selection details and exits map-plan mode while retaining the selected
river, endpoints and calculated route — except while the compact planner is
choosing a put-in or take-out, when a blank or river-line tap closes only the
open pin. It does not reframe the camera. Tapping the still-selected river
opens its details again. While a put-in or plan exists, tapping or searching an
access point on another river opens it without switching rivers; the river
changes only when the reader acts on it (Use as put-in, or a Float trips row).
When every switched-on layer draws nothing because the camera is below the
ladder's floor (zoom 5.5), a small non-interactive hint says so on the map.
Places in this area is the list button beside Locate, not in the search row,
which keeps its full width. It opens the same branded sheet as a stack: rows
grouped by layer in the Layers sheet's order, each mark in its layer's
outlined well, nearest the middle of the map first, with a filter from seven
places. It is also the VoiceOver route to places on the map.
Gauge refresh failures retain available data and expose a Retry action, and a
pin sheet whose detail request failed offers "Try again" under the line that
says so. Detail answers are remembered for two minutes per place
(`useAccessPointDetail`, `useGaugeDetail`), so the sheet that search unmounts
and remounts paints at once and refreshes behind; a failed refresh keeps the
remembered page.

Map sheets clip at their host, which ends at the tab bar, so a resting sheet
never paints through the floating glass tab bar. "Plan a float" sits in a row
with a definite width; a content-sized row made its 55% cap circular and
truncated the label.

Before release, verify on a physical iPhone: numbered stacks at Alley Spring
(zoom in from 11, choose at 15), nearest-mark taps between close marks, the
places list and its filter with the keyboard up, sheets resting above the tab
bar, an untruncated "Plan a float", cluster expansion and its failure fallback, empty-map dismissal with
an existing route and reopening the still-selected river,
rapid tap/pan while a query is pending, POIs near each sheet edge, remembered
camera after multiple pan/select cycles, gauge continuity across zoom 5.5 and
10.5, pan responsiveness and fast fling with Other USGS gauges on (fling beyond
the padded area and check for briefly empty edges before the camera settles),
failed-first-load/retry, VoiceOver list selection, and largest text sizes.
