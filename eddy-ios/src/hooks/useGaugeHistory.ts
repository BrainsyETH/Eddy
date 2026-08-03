// eddy-ios/src/hooks/useGaugeHistory.ts
// The hydrograph behind the chart: one station, one window, cached per pairing.
//
// ── Why a hook and not a fetch in the component ─────────────────────────────
// The range toggle is the whole point of the chart — 24h answers "is it coming
// up right now", 30d answers "has this been a dry month" — and a person moves
// between them repeatedly. Re-fetching 7d because they looked at 30d and came
// back is a spinner over a line they were just reading, on a connection that at
// a put-in is one bar of LTE.
//
// So every (siteId, days) pairing is held. Switching back is instant and free,
// which is what lets the toggle feel like a toggle rather than a page load.
//
// ── Failure keeps the previous series ───────────────────────────────────────
// Same posture as useViewportGauges. A chart that empties on a dropped request
// reads as "this gauge has no history", which is a claim about the river rather
// than about the network. The old line stays, `loading` goes false, and the
// screen above it still shows a reading it can stand behind.
//
// The one state that IS empty is a station with genuinely no history — new
// sites and seasonal ones both exist — and that is `unavailable`, which the
// chart renders as a short honest note instead of a blank frame.
//
// ── Which needed the client to stop conflating them ─────────────────────────
// That split only works if a failure is distinguishable from an empty station,
// and it was not: fetchGaugeHistory returned null for both. On the FIRST window
// requested for a station there is no older series to fall back on, so a single
// timeout was cached as "this station has nothing" and, being a cache hit, was
// never re-requested for the life of the screen. One bar of LTE printed a
// verdict about the river.
//
// The client is now three-valued (response / null=404 / undefined=failed) and
// only genuine answers are cached. A failure with nothing held reports `failed`
// and offers `retry`, which is a sentence about the network and recoverable.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GaugeHistoryResponse } from '@eddy/types';
import { fetchGaugeHistory } from '@/api/client';

/** A handful of windows per station is all a session ever visits. */
const CACHE_SIZE = 8;

export interface GaugeHistoryState {
  history: GaugeHistoryResponse | null;
  loading: boolean;
  /**
   * The station answered, and it has nothing to draw.
   *
   * DISTINCT from `history === null` while loading, and distinct from a failed
   * request that left an older series in place. Only this one may be phrased to
   * the user as a fact about the gauge.
   */
  unavailable: boolean;
  /**
   * The request failed and there is no older series for this station to fall
   * back on.
   *
   * The counterpart to `unavailable`, and the reason it can be trusted: this is
   * a fact about the NETWORK, phrased as one, with a retry beside it. Never
   * cached — a failure is not an answer about the river.
   */
  failed: boolean;
}

interface GaugeHistory extends GaugeHistoryState {
  /** Re-request the current window. Failures are uncached, so this really refetches. */
  retry: () => void;
}

const EMPTY: GaugeHistoryState = {
  history: null,
  loading: false,
  unavailable: false,
  failed: false,
};

export function useGaugeHistory(siteId: string | null, days: number): GaugeHistory {
  const [state, setState] = useState<GaugeHistoryState>(EMPTY);

  const cache = useRef(new Map<string, GaugeHistoryResponse | null>());
  const inFlight = useRef<AbortController | null>(null);

  const load = useCallback(async (key: string, site: string, window: number) => {
    // Map preserves insertion order, so `has` is the cheap hit test and the
    // first key is the oldest. A cached NULL is a real answer — "we asked, this
    // station has nothing" — and must not be re-requested on every toggle.
    if (cache.current.has(key)) {
      const hit = cache.current.get(key) ?? null;
      setState({ history: hit, loading: false, unavailable: hit === null, failed: false });
      return;
    }

    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    setState((prev) => ({ ...prev, loading: true, failed: false }));

    const result = await fetchGaugeHistory(site, window, controller.signal);
    if (controller.signal.aborted) return;

    // `undefined` is a FAILED request; `null` is the endpoint's 404; a response
    // with no readings is a station that answered and has nothing. The client
    // draws that line — see fetchGaugeHistory — because only it holds the
    // status code. Nothing below may cache a failure.
    if (result === undefined) {
      // What we already hold is still the better answer where we have one: if
      // another window for this station came back with readings, the station
      // demonstrably has history, so keep the line and say nothing rather than
      // replacing a chart someone is reading with an error.
      const heldForSite = [...cache.current.entries()].some(
        ([k, v]) => k.startsWith(`${site}:`) && v !== null,
      );

      setState((prev) => ({
        ...prev,
        loading: false,
        unavailable: false,
        failed: !heldForSite,
      }));
      if (inFlight.current === controller) inFlight.current = null;
      return;
    }

    const usable = result && result.readings.length > 0 ? result : null;

    cache.current.set(key, usable);
    if (cache.current.size > CACHE_SIZE) {
      const oldest = cache.current.keys().next().value;
      if (oldest !== undefined) cache.current.delete(oldest);
    }

    setState({ history: usable, loading: false, unavailable: usable === null, failed: false });
    if (inFlight.current === controller) inFlight.current = null;
  }, []);

  useEffect(() => {
    if (!siteId) {
      inFlight.current?.abort();
      inFlight.current = null;
      setState(EMPTY);
      return;
    }
    void load(`${siteId}:${days}`, siteId, days);
  }, [siteId, days, load]);

  // Abort on unmount so a screen the user has left is not still fetching.
  useEffect(() => () => inFlight.current?.abort(), []);

  // Nothing to clear first: a failure is never written to the cache, so this
  // misses and refetches. A window that genuinely holds nothing is a cache hit
  // and re-sets the same honest answer, which is the right no-op.
  const retry = useCallback(() => {
    if (!siteId) return;
    void load(`${siteId}:${days}`, siteId, days);
  }, [siteId, days, load]);

  return { ...state, retry };
}
