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
  pinned SDK 54.

`npx expo start --ios` needs Xcode plus an installed iOS simulator runtime. If
you see `No iOS devices available`, either the runtime is missing
(`xcodebuild -downloadPlatform iOS`) or Xcode is not the selected developer
directory (`sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`).
Note `Simulator.app` lives *inside* `Xcode.app`, so deleting Xcode removes it.

## Why this is a monorepo without an npm workspace

Vercel builds the web app with **Root Directory = `missouri-float-planner/`**.
Adding a root `package.json` with workspaces changes how installs resolve there
— a real risk to a live deploy, for no benefit to the backend.

So instead of a workspace, `metro.config.js` uses `watchFolders` to reach two
directories outside the app, with matching `tsconfig` path aliases:

| Alias | Points at | Holds |
|---|---|---|
| `@eddy/types` | `../packages/eddy-types` | API contracts shared with the backend |
| `@eddy/geo` | `../packages/eddy-geo` | Web Mercator tile maths for offline packs |
| `@eddy/offline` | `../packages/eddy-offline` | offline download planning and budget policy |
| `@shared/*` | `../missouri-float-planner/shared/*` | the canonical condition system |

`eddy-geo` and `eddy-offline` are shared rather than app-local for a specific
reason: they are pure, they hold the download-size *policy*, and they need tests.
The app has no test runner yet, so the alternative was re-implementing them
inside a web test — the duplicate-then-drift pattern this repo has already been
bitten by. They are covered by `src/lib/geo-tiles.test.ts` and
`src/lib/offline-plan.test.ts` in the web app, which imports them by relative
path. Their own imports are relative for the same reason: both Metro and the
web's plain `tsx` runner have to resolve them.

Metro handles runtime resolution, `tsconfig` handles types, and they are
configured independently — change one, change the other.

**Do not add `nodeModulesPaths` or `disableHierarchicalLookup` to
`metro.config.js`.** Those appear in every workspace-monorepo guide and are
wrong here: this project has a single `node_modules` and npm nests some
transitive dependencies (`expo-asset` under `node_modules/expo/`). Disabling
hierarchical lookup makes Metro refuse to look inside them and the bundle fails
with `Unable to resolve module expo-asset`.

## Condition colours and labels

Import them from `@shared/condition-system` via `src/theme/conditions.ts`. Never
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

`eas.json` defines three profiles. All of them need an Expo account and
`eas init` to write an `extra.eas.projectId` into `app.json`, which has not been
done yet:

```bash
npm install -g eas-cli
eas login
eas init            # writes projectId into app.json
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
- `submit.production.ios.ascAppId` is a placeholder until the App Store Connect
  app record exists.

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
