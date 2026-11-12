// src/lib/social/cover-signature.ts
// Who is allowed to tell /api/og/social what a river is doing.
//
// A cover URL can PIN what it draws: a condition, a gauge height, a weather
// chip, a line of text. Pins exist so a post's cover stays the report that was
// published instead of drifting to a later one (the route's header says why).
// They are also query parameters on a public route, so until this file anyone
// could write a URL that rendered "Current River — dangerous, 18 ft" in Eddy's
// own artwork, on eddy.guide, and pass it around as Eddy's report.
//
// The rule now: pins are honoured only when Eddy wrote the URL.
//
//   signed     the URL carries `sig`, an HMAC over every other parameter.
//              Every builder in src/lib/social signs what it builds.
//   unpinned   nothing in the URL states a fact — only which stored or live
//              thing to draw (UNSIGNED_PARAMS). Needs no signature.
//   unsigned   it pins something and is not (validly) signed. The route then
//              honours it only if it is, byte for byte, the image_url of a
//              post already in social_posts: covers published before signing
//              existed, and any signed with a since-rotated secret. Those keep
//              rendering what they always rendered.
//
// ── The secret ──────────────────────────────────────────────────────────────
// SOCIAL_COVER_SIGNING_SECRET if set, otherwise CRON_SECRET — already a core
// variable in every deployed environment, which is what lets signing start on
// deploy with no new configuration. The key is derived from it, never used raw.
// Rotating the secret invalidates old signatures; the stored-post fallback
// above is what keeps those covers working, so rotation needs no migration.
// `v1.` leaves room to change the scheme without guessing at old URLs.

import { createHmac, timingSafeEqual } from 'node:crypto';

type Environment = Record<string, string | undefined>;

/** Parameters that choose WHAT to draw from stored or live data, never what it says. */
export const UNSIGNED_PARAMS: ReadonlySet<string> = new Set([
  'type',
  'platform',
  'river', // a slug to look up
  'id', // a stored row: an eddy_update, a content snippet, a clip
  'art', // artwork choice, validated against the catalogue by parseArtParam
  'fromSlug', // access points of a published guide section
  'toSlug',
  'asOf', // the instant a trend is computed from recorded history
]);

const VERSION = 'v1';
const SIGNATURE_PARAM = 'sig';

function signingKey(env: Environment): Buffer | null {
  const secret = env.SOCIAL_COVER_SIGNING_SECRET || env.CRON_SECRET;
  if (!secret) return null;
  return createHmac('sha256', secret).update('eddy-social-cover-key').digest();
}

/** Order-independent, so a client that reorders the query cannot break a cover. */
function canonical(params: URLSearchParams): string {
  const pairs = [...params.entries()]
    .filter(([name]) => name !== SIGNATURE_PARAM)
    .sort(([an, av], [bn, bv]) => (an === bn ? (av < bv ? -1 : av > bv ? 1 : 0) : an < bn ? -1 : 1));
  return JSON.stringify(pairs);
}

function mac(key: Buffer, params: URLSearchParams): string {
  return createHmac('sha256', key).update(`${VERSION}\n${canonical(params)}`).digest('base64url');
}

/**
 * Sign a cover URL. Returns it unchanged when no secret is configured (local
 * development and tests), which the route treats as "cannot verify" rather
 * than as a valid signature.
 */
export function signCoverUrl(url: string, env: Environment = process.env): string {
  const key = signingKey(env);
  if (!key) return url;
  const parsed = new URL(url);
  parsed.searchParams.delete(SIGNATURE_PARAM);
  const signature = `${VERSION}.${mac(key, parsed.searchParams)}`;
  // Appended to the original string, not re-serialised: the stored image_url
  // keeps the exact encoding its builder chose.
  const base = url.replace(/([?&])sig=[^&]*&?/g, '$1').replace(/[?&]$/, '');
  return `${base}${base.includes('?') ? '&' : '?'}${SIGNATURE_PARAM}=${signature}`;
}

export type CoverTrust =
  /** Signed by Eddy: honour every pin. */
  | 'signed'
  /** States no facts: nothing to forge. */
  | 'unpinned'
  /** Pins something without a valid signature: only a stored post may vouch for it. */
  | 'unsigned';

export function coverTrust(params: URLSearchParams, env: Environment = process.env): CoverTrust {
  const pinned = [...params.keys()].some((name) => name !== SIGNATURE_PARAM && !UNSIGNED_PARAMS.has(name));
  if (!pinned) return 'unpinned';
  const key = signingKey(env);
  // No secret outside production means a developer's machine: nothing there
  // can be signed, so nothing is refused. In production a missing secret
  // fails closed — pins are then honoured for stored posts only.
  if (!key) return env.NODE_ENV === 'production' ? 'unsigned' : 'signed';
  const presented = params.get(SIGNATURE_PARAM) ?? '';
  const [version, value] = presented.split('.');
  if (version !== VERSION || !value) return 'unsigned';
  const expected = Buffer.from(mac(key, params));
  const given = Buffer.from(value);
  return expected.length === given.length && timingSafeEqual(expected, given) ? 'signed' : 'unsigned';
}

/** Hosts a published cover URL was ever stored under. */
const STORED_ORIGINS = ['https://eddy.guide', 'https://www.eddy.guide'];
/** Longer than any cover URL a builder produces; bounds the lookup. */
const MAX_STORED_SEARCH = 2000;

/**
 * Every way the request's URL could have been written into
 * social_posts.image_url. `search` is the raw query string as received
 * (including the leading "?"), because the match is exact.
 */
export function storedCoverCandidates(pathname: string, search: string, requestOrigin?: string): string[] {
  if (!search || search.length > MAX_STORED_SEARCH) return [];
  const origins = new Set(STORED_ORIGINS);
  if (requestOrigin) origins.add(requestOrigin);
  return [...origins].map((origin) => `${origin}${pathname}${search}`);
}
