// eddy-ios/src/lib/offline-cache.ts
// Key formats and envelope handling for the on-disk river cache. PURE — no
// AsyncStorage, no Expo, nothing that cannot run under the web test runner.
//
// The storage wiring lives in src/lib/riverCache.ts and deliberately holds no
// logic, because this app has no test runner of its own: anything that can be
// decided is decided here, where missouri-float-planner's suite can reach it
// (the same arrangement chunked-store.ts uses).
//
// ── What this is for ────────────────────────────────────────────────────────
//
// The offline download saves Mapbox TILES and nothing else, so with no signal a
// "downloaded" river had no put-ins, no hazards, no conditions and not even its
// own line — /api/rivers/[slug] is a network call like everything else. Worse,
// the river screen awaits the rivers INDEX before any of that, outside the
// Promise.all where each other call has its own catch, so losing signal did not
// degrade the screen; it replaced it with "River not found".
//
// That is why the index is the first thing cached and not the last. Cache every
// per-river payload and the screen still dies before reading any of them.
//
// ── The rule for what may be cached ─────────────────────────────────────────
//
// Cache the SHAPE of the river, never the STATE of the water — except the last
// reading, which is cached only so it can be labelled and aged. A put-in that
// moved last month is still a put-in; a discharge from Tuesday is a lie with a
// timestamp on it. See the module header of riverCache.ts for the full list of
// what is deliberately excluded and why.

/**
 * Payload schema version. Bumping it invalidates every entry.
 *
 * Appears BOTH inside the envelope and in the key. Inside, so a stale payload
 * is caught at read time; in the key, so a bump is self-cleaning — a sweep can
 * find and delete the previous version's entries. Without the key half, a bump
 * strands the old data on disk forever.
 */
export const CACHE_VERSION = 1;

const PREFIX = 'eddy.cache';
const VERSIONED = `${PREFIX}.v${CACHE_VERSION}`;

/** Bundle ETag and when it was last fetched. */
export const META_KEY = `${VERSIONED}.meta`;
/** The /api/rivers list — the first thing every screen needs. */
export const INDEX_KEY = `${VERSIONED}.index`;
/**
 * The statewide network: every river's line and gauge ladder in one value.
 *
 * Its own key rather than a slice of each river's entry, because the Map tab
 * draws all of them at once and would otherwise do 25 reads to paint one
 * screen. It is also the one payload the app already fetched on every Map
 * open, so caching it costs nothing new on the wire.
 */
export const NETWORK_KEY = `${VERSIONED}.network`;

/**
 * Every river's last condition, in ONE value rather than a key per gauge.
 *
 * The iOS AsyncStorage implementation inlines values under 1 KB into
 * manifest.json and rewrites the whole manifest on each such write, so 25
 * sub-kilobyte keys would be 25 full manifest rewrites every refresh cycle.
 * One blob clears the threshold and becomes its own atomically-written file.
 *
 * Separate from the river entries because it moves on a completely different
 * clock: readings change every 15 minutes, the shape of a river changes
 * monthly.
 */
export const CONDITIONS_KEY = `${VERSIONED}.conditions`;
/** Small index for the individually stored national-gauge viewport payloads. */
export const VIEWPORT_GAUGES_INDEX_KEY = `${VERSIONED}.viewport-gauges`;

const RIVER_INFIX = '.river:';
const GAUGE_INFIX = '.gauge:';
const VIEWPORT_GAUGE_INFIX = '.viewport-gauge:';

export function riverKey(slug: string): string {
  return `${VERSIONED}${RIVER_INFIX}${slug}`;
}

export function gaugeKey(siteId: string): string {
  return `${VERSIONED}${GAUGE_INFIX}${encodeURIComponent(siteId)}`;
}

export function viewportGaugeKey(requestKey: string): string {
  return `${VERSIONED}${VIEWPORT_GAUGE_INFIX}${encodeURIComponent(requestKey)}`;
}

export function isRiverKey(key: string): boolean {
  return key.startsWith(`${VERSIONED}${RIVER_INFIX}`);
}

/**
 * The slug a river key names, or null.
 *
 * Deliberately not a split on ':' — every Eddy slug is hyphenated and some
 * carry punctuation, and a naive split is exactly why riverSlugFromRegionId in
 * @eddy/offline had to grow a regex.
 */
export function slugFromRiverKey(key: string): string | null {
  if (!isRiverKey(key)) return null;
  const slug = key.slice(`${VERSIONED}${RIVER_INFIX}`.length);
  return slug.length > 0 ? slug : null;
}

/**
 * Is this one of OUR keys from a version we no longer read?
 *
 * Used by the startup sweep. Matching too broadly would delete the stars and
 * saved floats, which live under `eddy.` too and are not caches — losing them
 * is real data loss, so this is anchored on the cache prefix specifically.
 */
export function isStaleVersionKey(key: string): boolean {
  return key.startsWith(`${PREFIX}.v`) && !key.startsWith(`${VERSIONED}`);
}

export interface CacheEnvelope<T> {
  /** Payload schema version. A mismatch is a MISS, never a partial hit. */
  v: number;
  /** ISO 8601 — when this came off the wire, not when it was written to disk. */
  fetchedAt: string;
  /** The bundle ETag this came from, or null for a write-through. */
  etag: string | null;
  payload: T;
}

export function envelope<T>(payload: T, fetchedAt: string, etag: string | null = null): CacheEnvelope<T> {
  return { v: CACHE_VERSION, fetchedAt, etag, payload };
}

/** ISO 8601, loosely — enough to catch a number or a garbage string. */
function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

/**
 * Read an envelope back, or null.
 *
 * NEVER THROWS, and never returns a partial hit. Every rejection path here is a
 * cache miss, which the caller already handles — the data is one request away,
 * so repair is cheaper than migration and far cheaper than a screen that
 * crashes on a truncated file.
 *
 * `expect` guards the container shape: a payload that arrives as null where an
 * array belongs would otherwise reach a .map() on a river screen.
 */
export function parseEnvelope<T>(
  raw: string | null | undefined,
  expect: 'array' | 'object',
): CacheEnvelope<T> | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const candidate = parsed as Partial<CacheEnvelope<T>>;

  if (candidate.v !== CACHE_VERSION) return null;
  if (!isIsoDate(candidate.fetchedAt)) return null;

  const payload = candidate.payload;
  if (expect === 'array' && !Array.isArray(payload)) return null;
  if (expect === 'object' && (typeof payload !== 'object' || payload === null || Array.isArray(payload))) {
    return null;
  }

  return {
    v: candidate.v,
    fetchedAt: candidate.fetchedAt,
    etag: typeof candidate.etag === 'string' ? candidate.etag : null,
    payload: payload as T,
  };
}

/**
 * Merge one part into a river's stored entry, preserving the rest.
 *
 * A river's entry holds five independently-fetched parts — detail, access
 * points, hazards, reaches, services — and each arrives from its own request
 * at its own time. THE NAIVE WRITE IS THE ONE PLACE IN THIS DESIGN THAT LOSES
 * DATA: `setItem(riverKey(slug), envelope({ hazards }))` when the hazards
 * request lands would blank that river's put-ins and its line on disk, and the
 * damage only shows up later, offline, on the screen that needed them.
 *
 * `fetchedAt` moves to the newest write. It describes the entry as a whole,
 * and every consumer of it — the staleness bands especially — wants to know
 * how old the freshest thing here is, not the oldest.
 *
 * Generic rather than typed to the river shape so this module stays free of
 * app types: it is compiled by the web test suite, which has no path to
 * @eddy/types.
 */
export function mergeParts<T extends object>(
  existing: CacheEnvelope<T> | null,
  patch: Partial<T>,
  fetchedAt: string,
  etag: string | null = null,
): CacheEnvelope<T> {
  return {
    v: CACHE_VERSION,
    fetchedAt,
    etag,
    payload: { ...(existing?.payload ?? {}), ...patch } as T,
  };
}

// ── Ageing a stored reading ─────────────────────────────────────────────────

/**
 * The threshold `accuracyNote` already owns (readingCopy.ts).
 *
 * Deliberately the same number. The caveat sentence and the greyed-out chip
 * must not land on opposite sides of one line — a reading captioned "this gauge
 * has not reported recently" while still wearing a confident green is the
 * screen arguing with itself.
 */
export const STALE_READING_HOURS = 6;

/** Past this, the number itself is withheld rather than shown with a hedge. */
export const UNUSABLE_READING_HOURS = 48;

export type ReadingBand = 'fresh' | 'stale' | 'expired';

/**
 * How old a stored reading ACTUALLY is, as opposed to how old it says it is.
 *
 * ── The bug this exists to prevent ────────────────────────────────────────
 *
 * `RiverConditionDetail.readingAgeHours` is a scalar the SERVER computed at the
 * moment of the request. Replay it off the disk three days later and it still
 * says "1", so the screen prints "Updated an hour ago" — a cached reading
 * claiming to be an hour old, forever, with the claim getting more wrong the
 * longer it sits there.
 *
 * The fix is to add the time elapsed since the CACHE ENTRY was written, which
 * is why `fetchedAt` and not the reading's own timestamp is the second
 * argument. Those two differ, and using the reading's own would under-report
 * staleness by exactly the amount that matters.
 *
 * Returns null for "we cannot say", which the bands treat as the oldest case
 * rather than the newest — an unknown age is not evidence of freshness.
 */
export function effectiveReadingAgeHours(
  storedAgeHours: number | null | undefined,
  fetchedAt: string | null | undefined,
  now: number,
): number | null {
  if (typeof storedAgeHours !== 'number' || !Number.isFinite(storedAgeHours)) return null;
  if (!isIsoDate(fetchedAt)) return null;

  const elapsedMs = now - Date.parse(fetchedAt);
  // A negative elapsed time means the device clock moved backwards between the
  // write and the read. Trusting it would make a reading get YOUNGER on disk,
  // so the stored age is the floor.
  const elapsedHours = elapsedMs > 0 ? elapsedMs / 3_600_000 : 0;
  return storedAgeHours + elapsedHours;
}

/**
 * Which of the three presentations a reading has earned.
 *
 *   fresh    the ordinary condition colour, plus an offline glyph
 *   stale    grey, and the label becomes "Last known: Good" — the SHORT label,
 *            because the long one is an instruction and a two-day-old reading
 *            has no business instructing anyone
 *   expired  grey, and the number is not shown at all
 */
export function readingBand(effectiveAgeHours: number | null): ReadingBand {
  if (effectiveAgeHours === null) return 'expired';
  if (effectiveAgeHours < STALE_READING_HOURS) return 'fresh';
  if (effectiveAgeHours < UNUSABLE_READING_HOURS) return 'stale';
  return 'expired';
}

/** A cached gauge may keep its number, but not an old interpretation of it. */
export function mayPaintCachedCondition(
  storedAgeHours: number | null | undefined,
  fetchedAt: string | null | undefined,
  now: number,
): boolean {
  const age = effectiveReadingAgeHours(storedAgeHours, fetchedAt, now);
  return age !== null && age < STALE_READING_HOURS;
}
