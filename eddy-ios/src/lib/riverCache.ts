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
  SEED_INDEX_KEY,
  CONDITIONS_KEY,
  META_KEY,
  NETWORK_KEY,
  effectiveReadingAgeHours,
  envelope,
  isCacheKey,
  isRiverKey,
  isStaleVersionKey,
  mayPaintCachedCondition,
  mergeParts,
  parseEnvelope,
  riverKey,
  slugFromRiverKey,
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
 * The rivers index as the launch bundle seeded it: identity, no conditions.
 *
 * ── What this is for ──────────────────────────────────────────────────────
 *
 * A fresh install had every river's put-ins and hazards on disk within a
 * second of first launch, and could not open one of them without a network
 * round trip — because the river screen needs an id before it can ask for a
 * condition, and the only place carrying id, slug and name together was
 * /api/rivers. So the screen that works in a canyon held a full-screen spinner
 * on the endpoint with the most work to do.
 *
 * ── Read it AFTER readIndex, never instead ────────────────────────────────
 *
 * This is strictly poorer: same rivers, no verdicts. It is the answer to
 * "which rivers exist", not to "what is the water doing", and a caller that
 * wants the second must ask readIndex first and take silence for an answer.
 *
 * See SEED_INDEX_KEY for why the two are not one key.
 */
export async function readSeedIndex(): Promise<CacheEnvelope<RiverListItem[]> | null> {
  try {
    return parseEnvelope<RiverListItem[]>(await AsyncStorage.getItem(SEED_INDEX_KEY), 'array');
  } catch {
    return null;
  }
}

/**
 * The index a caller can have RIGHT NOW, richest first.
 *
 * Both surfaces that open on a river list want the same thing in the same
 * order — the real list if one is stored, the seed if not — and expressing
 * that as two awaits at each call site is how one of them ends up with only
 * half of it. `seeded` is carried out because the two are not interchangeable
 * to a caller that renders conditions: a seeded row has none, and saying so is
 * different from saying the water is unknown.
 */
export async function readBestIndex(): Promise<
  (CacheEnvelope<RiverListItem[]> & { seeded: boolean }) | null
> {
  const live = await readIndex();
  if (live && live.payload.length > 0) return { ...live, seeded: false };
  const seed = await readSeedIndex();
  if (seed && seed.payload.length > 0) return { ...seed, seeded: true };
  return null;
}

/**
 * The stored index, honestly aged for a list surface.
 *
 * The write-through above meant every river's name and last condition sat on
 * disk while an offline cold start showed a spinner and then an error over an
 * empty list — the cache's whole reason to exist, unread on the two tabs that
 * need it most. This is the read for that path, holding the river screen's own
 * rules for cached readings:
 *
 *   - ages are recomputed on the reader's clock (a stored "2h ago" from last
 *     night is not 2h ago), with the stored age as the floor so a clock that
 *     moved backwards cannot make a reading younger;
 *   - past the trusted window the VERDICT is withheld — code goes to
 *     `unknown`, the label says "Last known: …", and the trend is dropped —
 *     because a paddler must never drive to yesterday's green.
 *
 * Pure over its inputs, so the web test suite can hold the rules.
 */
export function agedIndex(
  stored: CacheEnvelope<RiverListItem[]>,
  now: number,
): RiverListItem[] {
  return stored.payload.map((river) => {
    const condition = river.currentCondition;
    if (!condition) return river;

    const age = effectiveReadingAgeHours(condition.readingAgeHours, stored.fetchedAt, now);
    if (mayPaintCachedCondition(condition.readingAgeHours, stored.fetchedAt, now)) {
      return { ...river, currentCondition: { ...condition, readingAgeHours: age } };
    }
    return {
      ...river,
      currentCondition: {
        ...condition,
        readingAgeHours: age,
        code: 'unknown',
        label: `Last known: ${condition.label}`,
        trend: null,
      },
    };
  });
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
 * Persist the bundle's condition-less index. Called only from
 * seedOfflineBundle, and only on a 200 — a 304 means the copy on disk is
 * already this exact payload.
 *
 * Rewritten wholesale rather than merged, because it is a projection of one
 * response: a river dropped from the bundle has been deactivated upstream and
 * must not survive on the phone as a row that opens onto nothing.
 */
export function writeSeedIndex(rivers: RiverListItem[]): void {
  if (rivers.length === 0) return;
  void AsyncStorage.setItem(
    SEED_INDEX_KEY,
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

/** An access point and the river it belongs to, which its own type never says. */
export interface CachedAccessPoint {
  point: MapAccessPoint;
  riverSlug: string;
}

/** What the map draws before any river is selected. */
export interface CachedPlaces {
  accessPoints: CachedAccessPoint[];
  /**
   * Untagged, unlike the access points above: a hazard pin carries no river
   * link and opens no river-scoped route, so there is nothing for a slug to do
   * on one.
   */
  hazards: Hazard[];
}

/**
 * Every put-in and every hazard on disk, from every river, in one read.
 *
 * ── Why the Map tab wants this ─────────────────────────────────────────────
 *
 * Both used to be fetched per river, on selection, which meant the map opened
 * with neither — the answers to "where can I get on the water" and "what will
 * kill me on it" were both behind picking a river first, and picking a river is
 * the thing people open the map to decide. Hazards are the starker case: 19 of
 * them exist statewide, on 11 of 25 rivers, and a low-water dam is a reason to
 * choose a different river rather than a detail you read after choosing.
 *
 * Every one of these is already on the phone. The launch bundle seeds all 25
 * rivers with their put-ins AND their hazards (see seedOfflineBundle, and the
 * bundle's own header on why hazards are in it and services are not), so this
 * is one AsyncStorage batch over what it already wrote.
 *
 * NO NETWORK, deliberately. The alternative was the full /api/usgs/mo-dataset,
 * which carries access points, POIs and campgrounds for every river — the app
 * asks that endpoint for `?slim=1` precisely to avoid paying for them, and
 * paying for them once per map open to draw what is already stored would be a
 * strange way to spend a put-in's worth of signal.
 *
 * Keys come from getAllKeys rather than from the rivers index, so a river the
 * bundle seeded is included whether or not /api/rivers has landed this session.
 */
export async function readAllPlaces(): Promise<CachedPlaces> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter(isRiverKey);
    if (keys.length === 0) return { accessPoints: [], hazards: [] };

    const entries = await AsyncStorage.multiGet(keys);
    const accessPoints: CachedAccessPoint[] = [];
    const hazards: Hazard[] = [];
    for (const [key, raw] of entries) {
      const riverSlug = slugFromRiverKey(key);
      if (!riverSlug) continue;
      const stored = parseEnvelope<CachedRiver>(raw, 'object');
      for (const point of stored?.payload?.accessPoints ?? []) {
        accessPoints.push({ point, riverSlug });
      }
      hazards.push(...(stored?.payload?.hazards ?? []));
    }
    return { accessPoints, hazards };
  } catch {
    // Empty map layers, never a failed screen. Same posture as every other
    // read in this file.
    return { accessPoints: [], hazards: [] };
  }
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

// ── Telling a user what is on their phone ───────────────────────────────────

export interface CacheFootprint {
  /** Cache entries stored, across every version. */
  entries: number;
  /**
   * Bytes of JSON, measured by reading it.
   *
   * UTF-16 code units, not bytes on disk: `String.length` is what JavaScript can
   * see, AsyncStorage adds its own per-file overhead, and the values here are
   * overwhelmingly ASCII so the two land within a rounding error of each other
   * at the precision this is ever displayed at. Precision beyond "about 2 MB"
   * would be false anyway.
   */
  bytes: number;
}

/**
 * How much room the river cache is taking.
 *
 * Reads every value, which is the only way to know — AsyncStorage has no size
 * API. That is a few hundred kilobytes of JSON off disk, so it belongs on a
 * screen somebody opened deliberately and nowhere near a render path.
 */
export async function cacheFootprint(): Promise<CacheFootprint> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter(isCacheKey);
    if (keys.length === 0) return { entries: 0, bytes: 0 };
    const entries = await AsyncStorage.multiGet(keys);
    let bytes = 0;
    for (const [key, value] of entries) bytes += key.length + (value?.length ?? 0);
    return { entries: keys.length, bytes };
  } catch (err) {
    warn('cache', 'could not measure the cache', err);
    return { entries: 0, bytes: 0 };
  }
}

/**
 * Delete every cached river payload. Favourites, saved floats and settings stay.
 *
 * Safe by construction rather than by care: `isCacheKey` is anchored on the
 * cache's own prefix, so the blast radius is a set of things the server can send
 * again — see its note for the five neighbouring namespaces this must not touch.
 *
 * The cost of pressing this is real and worth being honest about in the copy:
 * until the next online launch re-seeds the bundle, no river has its put-ins or
 * hazards on the phone.
 */
export async function clearCache(): Promise<void> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter(isCacheKey);
    if (keys.length > 0) await AsyncStorage.multiRemove(keys);
  } catch (err) {
    warn('cache', 'could not clear the cache', err);
  }
}
