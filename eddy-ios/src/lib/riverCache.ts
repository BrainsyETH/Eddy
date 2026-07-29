// eddy-ios/src/lib/riverCache.ts
// The on-disk river cache. AsyncStorage wiring only — every decision lives in
// src/lib/offline-cache.ts, which is pure and tested from the web suite.
//
// ── Why AsyncStorage and not SQLite or the file system ──────────────────────
//
// Both alternatives are native modules, and ios.runtimeVersion is
// fingerprint-policy, so adding one forces a new binary through review — for
// well under a megabyte of JSON with no queries, no partial reads and no joins.
// The 6 MB ceiling everyone quotes is Android's SQLite default; the iOS
// implementation stores values over 1 KB as individual atomically-written files
// and has no ceiling at all.
//
// That same detail decides the key layout, and it inverts the usual advice:
// a value UNDER 1 KB is inlined in manifest.json and rewrites the whole
// manifest on every write, while a larger one is its own file. So few large
// values beat many small ones here, which is why conditions will be one blob
// rather than a key per gauge.
//
// ── What is NOT cached, and why ─────────────────────────────────────────────
//
// The rule is in offline-cache.ts: the shape of the river, never the state of
// the water. Concretely excluded, each for its own reason:
//
//   float plan results  /api/plan/[shortCode] RECALCULATES against today's
//                       gauge — a float saved in April and opened in July is
//                       the same stretch and completely different water. The
//                       saved-float stub is already the right amount to keep.
//   Eddy's take         a 72-hour forecast read four days later describes
//                       weather that already happened, and it is the paid
//                       artefact besides.
//   high water, alerts  a snapshot of what is high RIGHT NOW. Stale high-water
//                       is the most dangerous thing this app could show, which
//                       is why fetchHighWater throws rather than returning [].
//   gauge history       a chart is a time series; a cached one plots a window
//                       ending days ago under the heading "Recent history".
//   /api/me/*           privateNoStore on the wire. A cached entitlement is a
//                       cracked paywall.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RiverListItem } from '@eddy/types';
import { warn } from '@/lib/monitoring';
import {
  INDEX_KEY,
  envelope,
  isStaleVersionKey,
  parseEnvelope,
  type CacheEnvelope,
} from '@/lib/offline-cache';

/**
 * Everything here fails soft.
 *
 * A cache is an optimisation on the good path and a courtesy on the bad one; it
 * must never be the reason a screen does not render. Reads resolve to null,
 * writes are fire-and-forget, and both swallow — same posture as chunked-store
 * and the star store, and for the same reason.
 */

/** The rivers index, or null when nothing usable is stored. */
export async function readIndex(): Promise<CacheEnvelope<RiverListItem[]> | null> {
  try {
    return parseEnvelope<RiverListItem[]>(await AsyncStorage.getItem(INDEX_KEY), 'array');
  } catch {
    return null;
  }
}

/**
 * Persist the rivers index. Never awaited on a render path.
 *
 * Called from the client's fetchRivers on every success, so the cache tracks
 * whatever the app last saw without a separate sync.
 */
export function writeIndex(rivers: RiverListItem[]): void {
  if (rivers.length === 0) return; // An empty list is not worth replacing a good one with.
  void AsyncStorage.setItem(
    INDEX_KEY,
    JSON.stringify(envelope(rivers, new Date().toISOString())),
  ).catch(() => {});
}

/**
 * Drop entries written by a previous CACHE_VERSION.
 *
 * Runs once at startup. Without it a version bump strands its predecessor's
 * data on disk forever — the reason the version is in the key and not only in
 * the envelope.
 */
export async function sweepStaleVersions(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const stale = keys.filter(isStaleVersionKey);
    if (stale.length > 0) await AsyncStorage.multiRemove(stale);
  } catch (err) {
    // Not worth surfacing: the only cost of a failed sweep is disk.
    warn('cache', 'could not sweep stale cache versions', err);
  }
}
