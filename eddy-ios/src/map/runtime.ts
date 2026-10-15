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
import { warn } from '@/lib/monitoring';

/**
 * The public access token, inlined by Metro at bundle time.
 *
 * EXPO_PUBLIC_ is not a mistake: a Mapbox `pk.` token is public by design and
 * ships inside every app binary regardless. Protect it with SCOPES, not URL
 * restrictions and not by hiding it: Mapbox's native SDKs send no referrer, so
 * a URL-restricted token is rejected by them outright. Use a separate public
 * token for this app, with only the public scopes the map and offline packs
 * need, and keep the website's URL-restricted token separate so either can be
 * rotated alone. The SECRET `sk.` download token that older guides require is
 * no longer needed — @rnmapbox's own config plugin marks
 * RNMapboxMapsDownloadToken deprecated.
 */
export const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';

/**
 * Mapbox's outdoors style: contours and trails, which is what a river needs.
 *
 * Lives here rather than beside the map component because this file is the
 * Mapbox boundary, and because its previous home was the offline-pack hook —
 * so the one constant the live map cannot render without was owned by a feature
 * that could be switched off.
 */
export const STYLE_URL = 'mapbox://styles/mapbox/outdoors-v12';

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

// `any` for now. A type-only import (`typeof import('@rnmapbox/maps').default`)
// would not defeat the lazy load — types are erased — but switching to it
// surfaces ~30 mismatches in RiverMap, FloatMap and the offline-pack calls,
// which deserve their own change. The typed surface meanwhile is the
// components in RiverMap.tsx and the calls in packSweep.ts.
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
    warn('map', 'Mapbox failed to load', err);
    loadFailed = true;
    return null;
  }
}

/** The offline pack manager, or null when Mapbox is unavailable. */
export function getOfflineManager(): MapboxModule | null {
  return loadMapbox()?.offlineManager ?? null;
}
