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
// values beat many small ones here, which is why every river's condition is
// ONE blob rather than a key per gauge.
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
import type {
  Hazard,
  RiverConditionDetail,
  MapAccessPoint,
  RiverDetail,
  RiverListItem,
  RiverReach,
  RiverService,
} from '@eddy/types';
import type { StatewideRiver } from '@/lib/statewideNetwork';
import { warn } from '@/lib/monitoring';
import {
  INDEX_KEY,
  CONDITIONS_KEY,
  META_KEY,
  NETWORK_KEY,
  envelope,
  isStaleVersionKey,
  mergeParts,
  parseEnvelope,
  riverKey,
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

// ── One river's stored entry ────────────────────────────────────────────────

/**
 * The five independently-fetched parts of a river.
 *
 * Every field optional, and that is the type doing real work: a river seeded by
 * the bundle has four of them, a river whose services request happened to land
 * has five, and a river nobody has opened on a build older than the bundle has
 * one. Consumers must read this as "what we happen to have", never as a record
 * that is either present or absent.
 */
export interface CachedRiver {
  river?: RiverDetail;
  accessPoints?: MapAccessPoint[];
  hazards?: Hazard[];
  reaches?: RiverReach[];
  services?: RiverService[];
}

export async function readRiver(slug: string): Promise<CacheEnvelope<CachedRiver> | null> {
  try {
    return parseEnvelope<CachedRiver>(await AsyncStorage.getItem(riverKey(slug)), 'object');
  } catch {
    return null;
  }
}

/**
 * Serialises writes per river slug.
 *
 * writePart is read-modify-write, so two parts of the same river landing at
 * once is a LOST UPDATE: both read the entry without the other's field, both
 * write, and the second erases the first. This is not a rare interleaving —
 * the river screen fires its access-point and hazard requests together and
 * they routinely resolve within a frame of each other, so the naive version
 * would drop one of them most times a river is opened.
 *
 * A per-slug promise chain is enough because AsyncStorage is the only writer
 * and this module is the only path to it. Cross-process locking is not a
 * concern; there is one JS context.
 */
const writeChains = new Map<string, Promise<unknown>>();

function enqueueWrite(slug: string, work: () => Promise<void>): void {
  const previous = writeChains.get(slug) ?? Promise.resolve();
  // Chained off settle, not off success: one failed write must not stall every
  // later write for that river.
  const next = previous.then(work, work).catch(() => {});
  writeChains.set(slug, next);
  void next.then(() => {
    if (writeChains.get(slug) === next) writeChains.delete(slug);
  });
}

/**
 * Store one part of a river, preserving the other four. Fire-and-forget.
 *
 * Called from the client's fetchers on every success, so the cache tracks
 * whatever the app last saw without a separate sync pass.
 */
export function writePart<K extends keyof CachedRiver>(
  slug: string,
  part: K,
  value: CachedRiver[K],
): void {
  if (value === undefined) return;
  enqueueWrite(slug, async () => {
    const existing = await readRiver(slug);
    const merged = mergeParts<CachedRiver>(
      existing,
      { [part]: value } as Partial<CachedRiver>,
      new Date().toISOString(),
      existing?.etag ?? null,
    );
    await AsyncStorage.setItem(riverKey(slug), JSON.stringify(merged));
  });
}

/** Replace a river's entry wholesale. Used only by the bundle seed. */
export function writeRiver(slug: string, parts: CachedRiver, fetchedAt: string, etag: string | null): void {
  enqueueWrite(slug, async () => {
    // Still a merge, not a replace: the bundle carries four parts and a river
    // the user has opened may also have services on disk. Seeding must not
    // take those away.
    const existing = await readRiver(slug);
    const merged = mergeParts<CachedRiver>(existing, parts, fetchedAt, etag);
    await AsyncStorage.setItem(riverKey(slug), JSON.stringify(merged));
  });
}

// ── The statewide network ───────────────────────────────────────────────────

export async function readNetwork(): Promise<CacheEnvelope<StatewideRiver[]> | null> {
  try {
    return parseEnvelope<StatewideRiver[]>(await AsyncStorage.getItem(NETWORK_KEY), 'array');
  } catch {
    return null;
  }
}

export function writeNetwork(rivers: StatewideRiver[]): void {
  if (rivers.length === 0) return;
  void AsyncStorage.setItem(
    NETWORK_KEY,
    JSON.stringify(envelope(rivers, new Date().toISOString())),
  ).catch(() => {});
}

// ── The last reading for each river ─────────────────────────────────────────

/**
 * The one exception to "never cache the state of the water".
 *
 * Kept ONLY so it can be labelled and aged — see effectiveReadingAgeHours and
 * readingBand. A reading is never re-shown as current: past six hours it goes
 * grey and past forty-eight the number is withheld entirely. The value of
 * keeping it is that "the Current was 1.4 ft when you had signal this morning"
 * is genuinely useful at a put-in, and infinitely better than a blank card.
 *
 * Keyed by river id, matching what fetchCondition is called with.
 */
export async function readConditions(): Promise<CacheEnvelope<
  Record<string, RiverConditionDetail>
> | null> {
  try {
    return parseEnvelope<Record<string, RiverConditionDetail>>(
      await AsyncStorage.getItem(CONDITIONS_KEY),
      'object',
    );
  } catch {
    return null;
  }
}

/**
 * Store one river's condition, preserving the other twenty-four.
 *
 * Serialised on the same chain machinery as the river entries and for the same
 * reason: this is read-modify-write over a shared blob, and the Map tab can
 * have several conditions land at once.
 */
export function writeCondition(riverId: string, condition: RiverConditionDetail): void {
  enqueueWrite(CONDITIONS_KEY, async () => {
    const existing = await readConditions();
    await AsyncStorage.setItem(
      CONDITIONS_KEY,
      JSON.stringify(
        envelope({ ...(existing?.payload ?? {}), [riverId]: condition }, new Date().toISOString()),
      ),
    );
  });
}

// ── Bundle metadata ─────────────────────────────────────────────────────────

export interface CacheMeta {
  /** The ETag of the bundle currently on disk, replayed as If-None-Match. */
  bundleEtag: string | null;
  bundleFetchedAt: string | null;
}

export async function readMeta(): Promise<CacheMeta> {
  try {
    const stored = parseEnvelope<CacheMeta>(await AsyncStorage.getItem(META_KEY), 'object');
    return {
      bundleEtag: stored?.payload?.bundleEtag ?? null,
      bundleFetchedAt: stored?.payload?.bundleFetchedAt ?? null,
    };
  } catch {
    return { bundleEtag: null, bundleFetchedAt: null };
  }
}

export function writeMeta(meta: CacheMeta): void {
  void AsyncStorage.setItem(
    META_KEY,
    JSON.stringify(envelope(meta, new Date().toISOString())),
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
