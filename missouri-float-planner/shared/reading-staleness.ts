// shared/reading-staleness.ts
// The point at which a gauge reading stops being worth quoting as "now".
//
// ── Why this is in shared/ and the other staleness limits are not ────────
//
// Eddy has several staleness numbers and most of them are genuinely different
// questions, correctly answered differently:
//
//   2h   map-marker freshness (MOMap.tsx) and the live-refetch trigger in
//        get-gauge-conditions.ts — "should I go and fetch again"
//   3/4/6h  per-provider alert gating (src/lib/alerts/gate.ts, MAX_AGE_MS) —
//        "is this reading solid enough to fire a push about", and USGS, NWS and
//        USACE publish on genuinely different rhythms
//   24h  prose staleness (gauge-update-policy.ts, live-conditions.ts's
//        WEBSITE_PROSE_STALE_HOURS, global-prose-gate.ts) and
//        validate_river_data()'s stale_gauge — "is the sentence Eddy wrote
//        still describing this river"
//
// Collapsing those into one number would be worse, not better. This file is for
// the one that was genuinely duplicated: the six-hour line at which a reading
// stops being presentable as current, which had three independent definitions —
// src/app/api/plan/route.ts, src/lib/social/live-conditions.ts and
// eddy-ios/src/lib/offline-cache.ts.
//
// Three copies of one number is not three decisions; it is one decision that
// nobody can change. Moving it here means the website, the social pipeline and
// the phone cross that line together — and the reason that matters is recorded
// in offline-cache.ts: a reading captioned "this gauge has not reported
// recently" while still wearing a confident green chip is the screen arguing
// with itself.
//
// shared/ is @eddy/conditions, which eddy-ios consumes as a file: dependency,
// so this is reachable from both apps.

/**
 * Hours after which a reading is no longer presented as current.
 *
 * Six rather than two because a two-hour line cried wolf: NWIS distribution lags
 * normally, and a healthy gauge would spend part of most days marked stale.
 */
export const STALE_READING_HOURS = 6;

export const STALE_READING_MS = STALE_READING_HOURS * 60 * 60 * 1000;

/** Null age (never reported) counts as stale — absence is not freshness. */
export function isReadingStale(ageHours: number | null | undefined): boolean {
  if (ageHours == null) return true;
  return ageHours > STALE_READING_HOURS;
}
