// Core sheet facts load first; nearby float estimates enrich them afterward.
// Both requests are aborted together when the selected pin changes.
//
// The three properties the older hook established are kept verbatim, because
// each of them is load-bearing:
//
//   LATE, NEVER BLOCKING. The sheet renders immediately from what the map
//   already holds in memory; this lands underneath a moment later. Nothing
//   above it waits, because the request can be slow or fail and neither
//   Directions nor "Use as put-in" depends on it.
//
//   ABORTED ON EVERY CHANGE OF PIN. Without it a slow response for the put-in
//   somebody just dismissed lands under the one they tapped next.
//
//   THE ANSWER IS HELD WITH THE QUESTION. Route and payload are stored in one
//   piece of state so a stale response can never surface under the current pin,
//   including in the frame between the tap and the request settling. Clearing
//   to null at the top of the effect would do the same job by cascading a
//   render, which is the pattern the lint rule is about.
//
// ── AND A FOURTH: IT REMEMBERS WHAT IT WAS JUST TOLD ──────────────────────
//
// The sheet that owns this hook is UNMOUNTED whenever the search field takes
// focus (the results list needs the room) and mounted again when search lets
// go; pin → river → the same pin is a remount too. Each remount started this
// hook from nothing: the slot went back to "Checking water…", the Overview
// tab back to "Loading…", and the server was asked for a page it had served
// seconds earlier — the reader watching their own sheet reload for having
// glanced at the search box.
//
// So answers are kept for a short while, by route, at module scope. A remount
// paints the remembered page on its first frame; the request still goes out
// behind it and replaces what it finds, so nothing here is ever older than
// one round trip plus the window below. The window is short because a water
// reading is in this payload and a reading is a now-fact; the bound keeps a
// long session of tapping from holding every put-in in the state. Only
// successes are remembered — a failure is not an answer worth repeating.

import { useEffect, useState } from 'react';
import type { AccessPointDetailResponse } from '@eddy/types';
import { ApiError, fetchAccessPointDetail, fetchAccessPointEstimates } from '@/api/client';
import { loadAccessDetail, type EstimateStatus } from '@/lib/loadAccessDetail';
import { warn } from '@/lib/monitoring';

/**
 * Pull the two slugs back out of the route the map built.
 *
 * Mirrors the one place that constructs it — `/river/{riverSlug}/access/
 * {accessSlug}` in src/map/RiverMap.tsx. Returns null on anything else, so if
 * that shape ever changes this degrades to "no detail" rather than issuing a
 * request against slugs it guessed.
 */
function slugsFromRoute(route: string | null | undefined): { river: string; access: string } | null {
  if (!route) return null;
  const parts = route.split('/').filter(Boolean);
  if (parts.length !== 4 || parts[0] !== 'river' || parts[2] !== 'access') return null;
  return { river: parts[1], access: parts[3] };
}

/**
 * The payload, and WHICH KIND OF NOTHING it is when there is none.
 *
 * The hook this replaced folded "not an access point", "loading" and "failed"
 * into one null, on the grounds that the caller did the same thing in all
 * three. That was true of a callout showing a reading or not. It is not true of
 * a tab: waiting and having failed look identical if both render blank, and the
 * reader has no way to tell whether to wait or to stop waiting.
 */
export type DetailStatus = 'idle' | 'loading' | 'ready' | 'failed';

/** How long a remembered answer may stand in for a fresh one. See the header. */
export const ANSWER_CACHE_MS = 2 * 60_000;
/** How many answers one cache holds; the oldest leaves first. */
export const ANSWER_CACHE_SIZE = 12;

/**
 * A remembered answer for `key`, or null when there is none or it has aged
 * out. Shared with useGaugeDetail, which keeps its own map by site id.
 */
export function recallAnswer<T>(
  cache: Map<string, { answer: T; at: number }>,
  key: string,
  now: number = Date.now(),
): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (now - entry.at > ANSWER_CACHE_MS) {
    cache.delete(key);
    return null;
  }
  return entry.answer;
}

/** Remember an answer, dropping the oldest once the cache is full. */
export function rememberAnswer<T>(
  cache: Map<string, { answer: T; at: number }>,
  key: string,
  answer: T,
  now: number = Date.now(),
): void {
  // Delete first so a refreshed key moves to the newest end of insertion order.
  cache.delete(key);
  cache.set(key, { answer, at: now });
  while (cache.size > ANSWER_CACHE_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

const DETAIL_CACHE = new Map<string, { answer: AccessPointDetailResponse; at: number }>();

export function useAccessPointDetail(detailRoute: string | null | undefined, revision = 0): {
  detail: AccessPointDetailResponse | null;
  /**
   * Told apart deliberately. A tab that is waiting and a tab that asked and
   * failed look identical if both just show nothing, and the reader cannot
   * know whether to wait or to give up.
   */
  status: DetailStatus;
  estimatesStatus: EstimateStatus;
  error: string | null;
} {
  const [held, setHeld] = useState<{
    route: string;
    detail: AccessPointDetailResponse | null;
    failed: boolean;
    error?: string;
  } | null>(null);

  const [estimates, setEstimates] = useState<{ route: string; status: EstimateStatus } | null>(null);

  // The live answer first, then the remembered one. A failed refresh over a
  // remembered page keeps the page — see `failed` below — so this only falls
  // through to the cache while this mount's own request is still out.
  const remembered = detailRoute ? recallAnswer(DETAIL_CACHE, detailRoute) : null;
  const current = held && held.route === detailRoute
    ? held
    : detailRoute && remembered ? { route: detailRoute, detail: remembered, failed: false } : null;
  const detail = current?.detail ?? null;
  const status: DetailStatus = !detailRoute
    ? 'idle'
    : current
      ? current.failed
        ? 'failed'
        : 'ready'
      : 'loading';

  useEffect(() => {
    const slugs = slugsFromRoute(detailRoute);
    if (!slugs) return;

    const controller = new AbortController();
    const route = detailRoute as string;
    void loadAccessDetail({
      signal: controller.signal,
      fetchCore: () => fetchAccessPointDetail(
        slugs.river, slugs.access, controller.signal, false,
      ),
      fetchEstimates: () => fetchAccessPointEstimates(slugs.river, slugs.access, controller.signal),
      estimateStatus: (status) => setEstimates({ route, status }),
      publish: (response) => {
        rememberAnswer(DETAIL_CACHE, route, response);
        setHeld({ route, detail: response, failed: false });
      },
      failed: (err) => {
        warn('map', 'access point detail failed', err);
        const gone = err instanceof ApiError && err.status === 404;
        // A failed refresh (no signal at the put-in) keeps the page it already
        // showed — from this mount, or remembered from an earlier one; only a
        // first load, or an unpublished place, becomes an error. An unpublished
        // place is forgotten too, so no later mount can paint it.
        if (gone) DETAIL_CACHE.delete(route);
        const kept = gone ? null : recallAnswer(DETAIL_CACHE, route);
        setHeld((prev) => (!gone && prev?.route === route && prev.detail
          ? prev
          : kept
            ? { route, detail: kept, failed: false }
            : { route, detail: null, failed: true, error: gone ? 'This access point is no longer published.' : 'Could not load this access point.' }));
      },
      estimatesFailed: (err) => warn('map', 'nearby float estimates failed', err),
    });
    return () => controller.abort();
  }, [detailRoute, revision]);

  return { detail, status, error: current?.error ?? null, estimatesStatus: estimates && estimates.route === detailRoute ? estimates.status : 'idle' };
}
