# @eddy/mobile

Expo + React Native client for Eddy (iOS first, Android later).

## Stack

- Expo SDK 56, React Native 0.85, React 19, TypeScript
- expo-router (file-based routing in `src/app/`)
- `@eddy/shared` for API client, types, and condition/float-time logic

## Running

From the repo root (installs are managed by npm workspaces):

```bash
npm install
cd apps/mobile
npx expo start        # then press i for iOS simulator (macOS only)
```

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
