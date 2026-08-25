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
  /**
   * WHICH station and window the held series is actually for.
   *
   * Not the same question as the arguments this hook was called with, and that
   * gap is the whole reason these exist. `history` is deliberately kept across a
   * range change so the line does not flash empty, and kept across a failure so
   * a reader is not shown an error in place of a chart they were reading — so
   * there are real, resting states where the series on screen belongs to a
   * different window, or a different station, than the one being asked for.
   *
   * Drawing it anyway is fine: a line is honest about itself. DESCRIBING it from
   * the request is not — that is how the chart came to print "last 24 hours"
   * over a month of data, and how a six-hour trend came to be computed from a
   * month's worth of extrema-sampled points. Anything that makes a CLAIM about
   * the series must read it from here, or check `matchesRequest`.
   *
   * Both null exactly when `history` is null.
   */
  historySiteId: string | null;
  historyDays: number | null;
}

interface GaugeHistory extends GaugeHistoryState {
  /**
   * The held series is the one that was asked for.
   *
   * Derived once here rather than by each consumer, because four of them in
   * GaugeChart alone need it and three had already got it wrong. `loading` is
   * NOT a substitute: it is false during the one-render lag after a cache hit,
   * false after a failure that kept a foreign window, and false once a
   * superseded response has landed.
   */
  matchesRequest: boolean;
  /** Re-request the current window. Failures are uncached, so this really refetches. */
  retry: () => void;
}

const EMPTY: GaugeHistoryState = {
  history: null,
  loading: false,
  unavailable: false,
  failed: false,
  historySiteId: null,
  historyDays: null,
};

export function useGaugeHistory(siteId: string | null, days: number): GaugeHistory {
  const [state, setState] = useState<GaugeHistoryState>(EMPTY);

  const cache = useRef(new Map<string, GaugeHistoryResponse | null>());
  const inFlight = useRef<AbortController | null>(null);
  /** The pairing currently being asked for, so a late response can tell it is stale. */
  const currentKey = useRef<string | null>(null);

  const load = useCallback(async (key: string, site: string, window: number) => {
    // ── ABORT FIRST, BEFORE ANY RETURN ────────────────────────────────────
    // This used to sit below the cache-hit branch, so the hit RETURNED while an
    // older request was still live. Ask for 30d (a miss, so it goes out), then
    // tap 7d while it is loading and 7d is already cached: the hit painted the
    // 7-day series and left the 30-day request running, and when it landed it
    // overwrote state. The resting result was `days === 7` holding a month of
    // data, with loading false and failed false — nothing to signal it and
    // nothing to correct it until the next toggle. The cross-station form is
    // the same bug: station B's chart ends up drawing station A's series.
    //
    // Whatever this call is about to do, no earlier request may outlive it.
    inFlight.current?.abort();
    inFlight.current = null;
    currentKey.current = key;

    // Map preserves insertion order, so `has` is the cheap hit test and the
    // first key is the oldest. A cached NULL is a real answer — "we asked, this
    // station has nothing" — and must not be re-requested on every toggle.
    if (cache.current.has(key)) {
      const hit = cache.current.get(key) ?? null;
      setState({
        history: hit,
        loading: false,
        unavailable: hit === null,
        failed: false,
        historySiteId: hit ? site : null,
        historyDays: hit ? window : null,
      });
      return;
    }

    const controller = new AbortController();
    inFlight.current = controller;

    setState((prev) => ({ ...prev, loading: true, failed: false }));

    const result = await fetchGaugeHistory(site, window, controller.signal);
    // Aborted covers the ordinary supersede; the key check makes it true by
    // CONSTRUCTION rather than by the abort above happening to have fired.
    // Dropped rather than cached: the cache is written below from one place,
    // under one rule about what counts as a usable answer, and a second writer
    // up here would be a second rule to keep in step for no gain.
    if (controller.signal.aborted || currentKey.current !== key) return;

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

    setState({
      history: usable,
      loading: false,
      unavailable: usable === null,
      failed: false,
      historySiteId: usable ? site : null,
      historyDays: usable ? window : null,
    });
    if (inFlight.current === controller) inFlight.current = null;
  }, []);

  useEffect(() => {
    if (!siteId) {
      inFlight.current?.abort();
      inFlight.current = null;
      currentKey.current = null;
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

  const matchesRequest =
    state.history !== null &&
    state.historySiteId === siteId &&
    state.historyDays === days;

  return { ...state, matchesRequest, retry };
}
