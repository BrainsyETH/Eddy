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
| `@shared/*` | `../missouri-float-planner/shared/*` | the canonical condition system |

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

- The `development` profile requires `expo-dev-client`, which is **deliberately
  not installed yet**. It is a native module, so adding it means Expo Go can no
  longer run this app. Install it at the point you genuinely need a dev build —
  which is when MapLibre lands, since that is also a native module.
- `submit.production.ios.ascAppId` is a placeholder until the App Store Connect
  app record exists.

## Current state

| Tab | Status |
|---|---|
| Map | placeholder — awaiting native MapLibre + the offline-pack spike |
| River Reports | **live** against `/api/rivers` |
| Alerts | placeholder — awaiting a public `river_condition_events` feed |
| Favorites | **live**, local-first via AsyncStorage; server sync pending |
| Profile | placeholder — awaiting Sign in with Apple + RevenueCat |

Remote config and the forced-upgrade gate are wired (`/api/app-config`), and both
fail open: an unreachable config means no upgrade requirement and all features
enabled.
