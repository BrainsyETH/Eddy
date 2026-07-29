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

const RIVER_INFIX = '.river:';

export function riverKey(slug: string): string {
  return `${VERSIONED}${RIVER_INFIX}${slug}`;
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
