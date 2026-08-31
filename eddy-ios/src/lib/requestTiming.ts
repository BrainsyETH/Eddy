// eddy-ios/src/lib/requestTiming.ts
// How long a request took, and what to call it.
//
// ── Why this exists ────────────────────────────────────────────────────────
//
// The app had deadlines and no timings. A 15-second ceiling stops a spinner
// hanging for a minute, and it says nothing about which routes routinely take
// twelve seconds and which take two hundred milliseconds — so every question
// about latency had to be answered with a stopwatch and a physical device, once,
// against whatever the CDN happened to be holding that minute. The slow paths
// this app has actually shipped (a dam route measured between five and fifty
// seconds cold; a rivers list assembling a condition per river) were all found
// that way, one at a time, after somebody noticed.
//
// This is the other half of the deadline: the deadline bounds the wait, and
// this records it.
//
// ── Pure on purpose ────────────────────────────────────────────────────────
//
// No fetch, no Sentry, no clock of its own — the caller passes the duration.
// Everything here is a decision (what to call this path, is this worth
// reporting) rather than an effect, which is what lets the web suite hold the
// rules. src/api/client.ts owns the measuring; src/lib/monitoring.ts owns the
// reporting.

/** How a request ended, from the client's point of view. */
export type RequestOutcome =
  /** 2xx, body parsed. */
  | 'ok'
  /** A response arrived and it was not ok — carries the status. */
  | 'failed'
  /** Our own deadline fired. The user saw a spinner for the whole timeout. */
  | 'timeout'
  /** The screen went away. Not a failure, and never reported as one. */
  | 'cancelled'
  /** The request never got a response and it was not our deadline. */
  | 'offline';

/**
 * The point at which a request stops being a wait and becomes a problem.
 *
 * Not derived from REQUEST_TIMEOUT_MS. That is the point at which the app gives
 * up; this is the point at which somebody holding a phone has decided the tap
 * did not work. Five seconds is generous for a CDN-cached JSON route and short
 * enough that the routes with real assembly behind them stand out.
 */
export const SLOW_REQUEST_MS = 5_000;

/**
 * The ROUTE a path belongs to, with the identifiers taken out.
 *
 * ── Why not the path ───────────────────────────────────────────────────────
 *
 * Two reasons, and the second is the important one.
 *
 *   CARDINALITY. `/api/gauges/07068000/history?days=30` is one of fourteen
 *   thousand strings; `/api/gauges/:siteId/history` is one route. A telemetry
 *   backend given the first cannot tell you that gauge history is slow — it can
 *   only tell you that one particular gauge was, once.
 *
 *   WHAT IT SAYS ABOUT THE READER. A slug, a site id and a plan short code are
 *   things a person looked at. Sending "this device asked about
 *   /api/rivers/eleven-point at 6am" to an error tracker is not a measurement,
 *   it is a location record, and this app's redact.ts exists because that line
 *   has been crossed by accident before. Stripping identifiers here means the
 *   reporting path cannot leak one even if a call site forgets.
 *
 * ── Why an explicit table ──────────────────────────────────────────────────
 *
 * Rather than a heuristic ("a segment that looks like an id"). A heuristic has
 * to decide whether `starred-rivers` is a collection or a slug, and every
 * wrong answer is either a leaked identifier or a route that vanishes from the
 * data. The table is twenty lines, it is exhaustive over what client.ts
 * actually asks for, and an unmatched path falls back to its first two
 * segments — which is coarse, never wrong, and never revealing.
 */
const ROUTES: { pattern: RegExp; route: string }[] = [
  { pattern: /^\/api\/rivers\/[^/]+\/access\/[^/]+$/, route: '/api/rivers/:slug/access/:accessSlug' },
  { pattern: /^\/api\/rivers\/[^/]+\/([a-z-]+)$/, route: '/api/rivers/:slug/$1' },
  { pattern: /^\/api\/rivers\/[^/]+$/, route: '/api/rivers/:slug' },
  { pattern: /^\/api\/gauges\/[^/]+\/history$/, route: '/api/gauges/:siteId/history' },
  { pattern: /^\/api\/gauges\/(count|map)$/, route: '/api/gauges/$1' },
  { pattern: /^\/api\/gauges\/[^/]+$/, route: '/api/gauges/:siteId' },
  { pattern: /^\/api\/dams\/[^/]+$/, route: '/api/dams/:damId' },
  { pattern: /^\/api\/conditions\/[^/]+$/, route: '/api/conditions/:riverId' },
  { pattern: /^\/api\/plan\/save$/, route: '/api/plan/save' },
  { pattern: /^\/api\/plan\/[^/]+$/, route: '/api/plan/:shortCode' },
  { pattern: /^\/api\/me\/gauge-alerts\/[^/]+$/, route: '/api/me/gauge-alerts/:id' },
  { pattern: /^\/api\/me\/entitlement\/refresh$/, route: '/api/me/entitlement/refresh' },
  // Everything under /api/me/ is a fixed collection name — starred-rivers,
  // device-tokens, notification-preferences — and none of them is an
  // identifier, so they are kept whole.
  { pattern: /^\/api\/me\/[a-z-]+$/, route: '$&' },
  { pattern: /^\/api\/usgs\/[a-z-]+$/, route: '$&' },
  { pattern: /^\/api\/offline\/bundle$/, route: '/api/offline/bundle' },
];

export function routeOf(path: string): string {
  // The query string is dropped before anything else. It is where the site
  // ids, the slugs, the viewport coordinates and the search terms are.
  //
  // An ABSOLUTE url is accepted and reduced to its path, because several call
  // sites in client.ts build one from BASE_URL rather than passing a path —
  // and a function that answered '/api' for those would quietly lose exactly
  // the write routes (plan save, feedback, uploads) that have the most work
  // behind them. Parsed by hand rather than with URL: Hermes has one, but the
  // input here is always a string this app built, and a regex cannot throw on
  // a shape it did not expect.
  const withoutOrigin = path.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '');
  const bare = withoutOrigin.split('?')[0].split('#')[0];

  for (const { pattern, route } of ROUTES) {
    const match = bare.match(pattern);
    if (match) return bare.replace(pattern, route);
  }

  // The fallback: /api/<name>, and nothing deeper. A route this table does not
  // know is recorded coarsely rather than recorded with an id in it.
  const parts = bare.split('/').filter(Boolean);
  if (parts[0] !== 'api' || parts.length < 2) return '/api';
  return `/api/${parts[1]}`;
}

/**
 * Is this measurement worth sending anywhere?
 *
 * ── Only the bad news ──────────────────────────────────────────────────────
 *
 * A report per request would be tens of thousands of events a day to say that
 * a CDN-cached list took 90ms, and warn() is throttled per fingerprint anyway,
 * so the successful ones would push the interesting ones out of the budget.
 * What is reported is what a person would have felt:
 *
 *   a timeout   — fifteen seconds of spinner and then an error
 *   a slow OK   — it worked, and the reader had time to wonder whether it had
 *
 * A CANCELLATION is never reported, at any duration. It means the screen went
 * away, which is the app working, and a fast scroll through rivers would
 * otherwise look like a wall of failures.
 *
 * A FAILED response is not reported here either. A non-2xx already has a call
 * site that decides what it means — several treat a 404 or a 401 as an ordinary
 * answer — and duplicating that judgement in the timing layer would report an
 * expected 401 as a network problem.
 */
export function worthReporting(outcome: RequestOutcome, durationMs: number): boolean {
  if (outcome === 'cancelled') return false;
  if (outcome === 'timeout') return true;
  return outcome === 'ok' && durationMs >= SLOW_REQUEST_MS;
}

/**
 * Durations, rounded to something a fingerprint can be built from.
 *
 * warn() throttles by a hash of tag and message, so a message carrying an exact
 * millisecond count is a NEW fingerprint every time and is never throttled at
 * all — which is how a budget meant to protect the quota comes to spend it. The
 * bucket is the message; the exact duration rides in the detail bag, which is
 * not part of the fingerprint.
 */
export function durationBucket(durationMs: number): string {
  if (durationMs < 1_000) return '<1s';
  if (durationMs < 2_000) return '1-2s';
  if (durationMs < 5_000) return '2-5s';
  if (durationMs < 10_000) return '5-10s';
  if (durationMs < 20_000) return '10-20s';
  return '20s+';
}
