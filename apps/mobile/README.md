# @eddy/mobile

Expo + React Native client for Eddy (iOS first, Android later).

## Stack

- Expo SDK 56, React Native 0.85, React 19, TypeScript
- expo-router (file-based routing in `src/app/`)
- `@eddy/shared` for API client, types, and condition/float-time logic
- Supabase auth (LargeSecureStore: AES + iOS Keychain)
- **MapLibre RN** for native maps (native module, requires a custom dev build)

## Running

From the repo root (installs are managed by npm workspaces):

```bash
npm install
cd apps/mobile
```

Then **either**:

### 1. Custom dev build (required to use the map)

MapLibre RN ships native code, so the Expo Go app can't load it. Generate the
native projects and build a development client:

```bash
# One-time: generate ios/ and android/ from app.json + plugins
npx expo prebuild

# Build and run on a connected iOS simulator/device
npx expo run:ios
# or Android
npx expo run:android
```

### 2. Quick UI iteration without the map

`npx expo start --web` keeps working — the map component has a `.web.tsx`
fallback that renders a placeholder.

The app talks to the production API at `https://eddy.guide` by default
(`app.json` → `expo.extra.apiBaseUrl`). To point at a local web app:

```bash
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000 npx expo start
```

## Notes

- React versions differ between workspaces (web is on React 18, mobile on 19).
  npm nests mobile's copy under `apps/mobile/node_modules`; Metro resolves it
  correctly. Don't hoist `react` to the repo root.
- Type-check with `npx tsc --noEmit`; verify bundling with
  `npx expo export --platform web`.
- Map tiles currently point at `https://demotiles.maplibre.org/style.json` —
  swap to your own PMTiles host (see `src/components/river-map.tsx`) before
  shipping.
