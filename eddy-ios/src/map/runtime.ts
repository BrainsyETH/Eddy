// eddy-ios/src/map/runtime.ts
// The boundary between the app and Mapbox's native module.
//
// WHY THIS FILE EXISTS: @rnmapbox/maps is a native module. It cannot run in Expo
// Go, which is the quickest way to run this app during development. Importing it
// at module scope would crash the whole bundle there — taking River Reports,
// Alerts and Favorites down with it, for a tab the user may not even open.
//
// So the import is deliberately lazy. `require` inside a function body is still
// resolved by Metro at bundle time (the module is in the bundle) but is not
// EXECUTED until called, so Mapbox's native lookups never run under Expo Go.
// Everything that touches Mapbox must go through loadMapbox().

import Constants, { ExecutionEnvironment } from 'expo-constants';

/**
 * The public access token, inlined by Metro at bundle time.
 *
 * EXPO_PUBLIC_ is not a mistake: a Mapbox `pk.` token is public by design and
 * ships inside every app binary regardless. Protect it with URL/scope
 * restrictions in the Mapbox dashboard, not by hiding it. The SECRET `sk.`
 * download token that older guides require is no longer needed — @rnmapbox's
 * own config plugin marks RNMapboxMapsDownloadToken deprecated.
 */
export const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';

/**
 * True when running inside Expo Go, where no native module is available.
 *
 * Checked via executionEnvironment rather than __DEV__: a development *build*
 * is also __DEV__ but does have the native module, and treating it as Expo Go
 * would hide the real map from exactly the build made to test it.
 */
export function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

export type MapUnavailableReason = 'expo-go' | 'missing-token' | 'load-failed';

/** Why the map cannot render, or null when it can. */
export function mapUnavailableReason(): MapUnavailableReason | null {
  if (isExpoGo()) return 'expo-go';
  if (!MAPBOX_TOKEN) return 'missing-token';
  return null;
}

// `any` on purpose. The module is only ever reached through a runtime `require`,
// so importing its types here would defeat the point of the lazy load. The
// typed surface is the components in RiverMap.tsx and the calls in
// useOfflinePacks.ts, which is where a wrong shape would actually show up.
type MapboxModule = any;

let cached: MapboxModule | null = null;
let loadFailed = false;

/**
 * Loads and initialises Mapbox, or returns null if it cannot run here.
 *
 * Never throws. A map that fails to load should degrade to an explanatory
 * screen; it should not take the tab down.
 */
export function loadMapbox(): MapboxModule | null {
  if (cached) return cached;
  if (loadFailed || mapUnavailableReason() !== null) return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Mapbox = require('@rnmapbox/maps').default;
    Mapbox.setAccessToken(MAPBOX_TOKEN);
    // Telemetry is opt-out and defaults on. Turning it off keeps us honest
    // against a privacy policy that says we don't ship location to third
    // parties, and avoids an App Store tracking disclosure we don't need.
    Mapbox.setTelemetryEnabled(false);
    cached = Mapbox;
    return Mapbox;
  } catch (err) {
    console.warn('[map] Mapbox failed to load', err);
    loadFailed = true;
    return null;
  }
}

/** The offline pack manager, or null when Mapbox is unavailable. */
export function getOfflineManager(): MapboxModule | null {
  return loadMapbox()?.offlineManager ?? null;
}
