# Eddy for iOS

Expo app consuming the Next.js backend in `../missouri-float-planner` as a
headless API.

## Running it

```bash
cd eddy-ios
npm install --legacy-peer-deps
npx expo start
```

Then scan the QR code with the Camera app and open in **Expo Go**.

Two things that are not optional:

- **`--legacy-peer-deps` is required.** `@expo/metro-runtime` is a mandatory
  `expo-router` peer whose own `react-dom` peer conflicts with the pinned React.
  The conflict is web-only and does not affect the iOS bundle, but a plain
  `npm install` fails outright.
- **Run commands from inside `eddy-ios/`.** There is deliberately no
  `package.json` at the repo root (see below), so `npx expo` run from the root
  will fetch the latest Expo from the registry instead of using this project's
  pinned SDK 57.

`npx expo start --ios` needs Xcode plus an installed iOS simulator runtime. If
you see `No iOS devices available`, either the runtime is missing
(`xcodebuild -downloadPlatform iOS`) or Xcode is not the selected developer
directory (`sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`).
Note `Simulator.app` lives *inside* `Xcode.app`, so deleting Xcode removes it.

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
| `@eddy/geo` | `../packages/eddy-geo` | Web Mercator tile maths for offline packs |
| `@eddy/offline` | `../packages/eddy-offline` | offline download planning and budget policy |
| `@eddy/sync` | `../packages/eddy-sync` | favourites reconciliation |
| `@eddy/hazards` | `../packages/eddy-hazards` | hazard classification |
| `@eddy/conditions` | `../missouri-float-planner/shared` | the canonical condition system |

`@eddy/conditions` is the odd one: it lives inside the **web app** rather than
`packages/`, because 38 files there import it through that app's own `@shared/*`
alias. Adding a `package.json` beside it lets this app consume the same file
without moving it or touching those imports.

`eddy-geo` and `eddy-offline` are shared rather than app-local for a specific
reason: they are pure, they hold the download-size *policy*, and they need tests.
The app has no test runner yet, so the alternative was re-implementing them
inside a web test — the duplicate-then-drift pattern this repo has already been
bitten by. They are covered by `src/lib/geo-tiles.test.ts` and
`src/lib/offline-plan.test.ts` in the web app, which imports them by relative
path. Their own imports are relative for the same reason: both Metro and the
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

River Reports uses the second. Public "floatable now" counts use `FLOATABLE_NOW`
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

Do not pin `RNMapboxMapsVersion` unless you have a reason. `@rnmapbox/maps` 10.3.5
pins Mapbox iOS `~> 11.23.1` in its own `package.json`, and overriding it with a
lower version silently builds against an SDK the library is not tested on.

### Why downloads follow the river instead of its bounding box

A river's bounding box is a rectangle; a river is a line. Measured against the
real Current River geometry (632 points):

| Zoom | Plain bounding box | Corridor (10 boxes) |
|---|---|---|
| z8–12 | 286 tiles (~10 MB) | 187 (~6 MB) |
| z8–14 | 3,919 (~134 MB) | 1,237 (~42 MB) |
| z8–15 | 15,511 (~530 MB) | 4,079 (~139 MB) |

So the shipped setting is **z8–14 along the corridor, ~42 MB per river**.

Two hard limits shape that. Mapbox's default ceiling is **6,000 offline tiles per
device**, and `setTileCountLimit`'s own documentation says the Mapbox Terms of
Service prohibit raising it without permission. At z14 that is roughly four
rivers stored at once, which the UI has to handle by asking someone to remove a
river. At z15 a *single* river would consume two thirds of the entire device
allowance — which is the second, decisive reason `MAX_ZOOM` is 14.

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
- `submit.production` is empty and `ios.bundleIdentifier` is unregistered until
  the App Store Connect app record exists.

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

## Current state

| Tab | Status |
|---|---|
| Map | **live** in a dev build — Mapbox, condition-coloured river, offline packs |
| River Reports | **live** against `/api/rivers` |
| Alerts | **live** against `/api/alerts` |
| Favorites | **live**, local-first via AsyncStorage; server sync pending |
| Profile | placeholder — awaiting Sign in with Apple + RevenueCat |

Remote config and the forced-upgrade gate are wired (`/api/app-config`), and both
fail open: an unreachable config means no upgrade requirement and all features
enabled.
