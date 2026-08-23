// eddy-ios/src/hooks/useViewportGauges.ts
// The national gauge layer's data: whatever is in the camera, and nothing else.
//
// This is the app's FIRST viewport-driven fetch. Everything else loads up front
// — the whole curated network, every gauge, a river's access points — because
// those sets are small and bounded. The national tier is ~14,000 gauges and
// cannot work that way, so this hook exists to make panning cheap:
//
//   1. ZOOM FLOOR       — below the statewide overview it asks for nothing.
//   2. FIRST LOAD NOW   — opening-map idle requests immediately; no fake pause.
//   3. DEBOUNCE         — after that, a fling can emit several idle events and
//                         only the last one should cost a request.
//   4. CONTAINMENT      — if the new viewport is inside what we already hold,
//                         there is no request at all. This is what makes small
//                         pans free.
//   5. QUANTIZE + PAD   — snap to a grid so the URL is CDN-cacheable, and ask
//                         for more than the screen so step 4 hits more often.
//   6. MEMORY + DISK LRU — panning back is instant, including after relaunch.
//   7. MERGE, NOT REPLACE — a CAPPED payload is unioned with whatever was
//                         already drawn inside its box (mergeViewportItems in
//                         @eddy/geo, where the web suite can test it), so a
//                         lossy wide answer cannot yank pins that a tighter
//                         box legitimately showed a moment earlier. An
//                         UNCAPPED payload is complete and replaces outright.
//
// Failure keeps the previous payload. Panning into a dead cell must not erase
// the pins you were already looking at, and the curated layer must be untouched
// by any of this.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MapGaugeLite } from '@eddy/types';
import {
  mergeViewportItems,
  padBbox,
  quantizeBbox,
  requestCovers,
  type Bounds,
  type ViewportRequest,
} from '@eddy/geo';
import { fetchMapGauges } from '@/api/client';
import { GAUGE_FETCH_DETAIL_ZOOM, MIN_GAUGE_ZOOM } from '@/map/layers';
import { warn } from '@/lib/monitoring';
import {
  readContainingViewportGauge,
  readViewportGaugeIndex,
  touchViewportGaugeCache,
  VIEWPORT_GAUGE_CACHE_SIZE,
  writeViewportGaugeCache,
} from '@/lib/viewportGaugeCache';
import {
  newestContainingViewportGaugeEntry,
  touchViewportGaugeIndex,
  type ViewportGaugeIndexRecord,
} from '@/lib/offline-cache';

/** Idle already means "motion stopped"; this only collapses a burst of them. */
const DEBOUNCE_MS = 100;

/** Normal close-view payload. */
const DETAIL_LIMIT = 300;

/**
 * The server's existing maximum, used only for the opening overview.
 *
 * A Missouri-sized view often contains more than the normal 300-row budget.
 * Asking for the full supported page keeps "all gauges" honest there; close
 * views retain the smaller response. The server still reports `capped` if a
 * deliberately broader view contains more than this.
 */
const OVERVIEW_LIMIT = 1000;

export interface Viewport {
  bounds: Bounds;
  zoom: number;
}

export interface ViewportGaugesState {
  gauges: MapGaugeLite[];
  /** True when the server dropped lower-discharge gauges to meet the cap. */
  capped: boolean;
  /** How many were in the viewport before the cap — for "300 of 1,240". */
  total: number;
  loading: boolean;
  /** True once we are zoomed out past the point where this layer is useful. */
  belowMinZoom: boolean;
}

const EMPTY: ViewportGaugesState = {
  gauges: [],
  capped: false,
  total: 0,
  loading: false,
  belowMinZoom: false,
};

interface CacheEntry {
  key: string;
  bbox: Bounds;
  limit: number;
  fetchedAt: string;
  payload: Pick<ViewportGaugesState, 'gauges' | 'capped' | 'total'>;
  source: 'disk' | 'network';
}

/**
 * Most-recent containing cell, not merely an exact quantized-key hit.
 *
 * Eligibility is requestCovers — the same rule the last-request shortcut in
 * the effect applies, deliberately shared: an UNCAPPED entry satisfies any
 * limit (the server returned every gauge in its box, so a different cap could
 * not learn more), a capped one only its own. Without the uncapped half the
 * limit flip at GAUGE_FETCH_DETAIL_ZOOM invalidated the whole cache — zooming
 * across that line refetched a viewport whose complete answer was already in
 * hand, and the layer blinked while the identical payload came back.
 */
function containingEntry(
  entries: Map<string, CacheEntry>,
  bounds: Bounds,
  limit: number,
): CacheEntry | null {
  const newestFirst = [...entries.values()].reverse();
  return (
    newestFirst.find((entry) =>
      requestCovers(
        { bbox: entry.bbox, limit: entry.limit, capped: entry.payload.capped },
        bounds,
        limit,
      ),
    ) ?? null
  );
}

/**
 * A landing payload, re-shaped around the merged pin set.
 *
 * The LOGIC — capped payloads union with what was drawn inside their box,
 * uncapped payloads replace outright, overflow drops smallest-discharge first
 * — is mergeViewportItems in @eddy/geo, where the web suite can execute it;
 * eddy-ios has no runner, and pure logic that only lives here cannot be
 * covered. This wrapper only threads the hook's payload shape through it.
 */
function mergeViewportPayload(
  drawn: MapGaugeLite[],
  next: Pick<ViewportGaugesState, 'gauges' | 'capped' | 'total'>,
  bbox: Bounds,
): Pick<ViewportGaugesState, 'gauges' | 'capped' | 'total'> {
  const gauges = mergeViewportItems(drawn, next.gauges, next.capped, bbox);
  return gauges === next.gauges ? next : { ...next, gauges };
}

/**
 * One structured line per settled camera, dev builds only.
 *
 * Every failure mode this hook has is invisible in the UI — a skipped fetch, a
 * deduped idle echo, a cache tier answering instead of the network — so
 * diagnosing "why did the pins just change" needs the DECISION each camera
 * settled into, not only the load that sometimes follows it. The load
 * completion line below is the other half.
 */
function logViewportDecision(decision: string, detail: Record<string, unknown>) {
  if (__DEV__) console.info('[map] viewport gauges', { decision, ...detail });
}

export function useViewportGauges(enabled: boolean, viewport: Viewport | null) {
  const [state, setState] = useState<ViewportGaugesState>(EMPTY);
  const [diskReady, setDiskReady] = useState(false);

  const cache = useRef(new Map<string, CacheEntry>());
  const diskIndex = useRef<ViewportGaugeIndexRecord[]>([]);
  /**
   * Mirror of state.gauges, so the merge can read what is on screen without a
   * functional setState — an updater that logs is an updater with a side
   * effect, and the diagnostic lines here want the merged counts.
   */
  const drawnGauges = useRef<MapGaugeLite[]>([]);
  const drawnKey = useRef<string | null>(null);
  /**
   * The whole request, not only its bounds. The shortcut below asks
   * requestCovers whether this still answers the camera, and bounds alone
   * cannot say: a capped detail answer contains the ground of a slightly
   * wider overview camera without containing its gauges.
   */
  const lastRequested = useRef<ViewportRequest | null>(null);
  const hasRequested = useRef(false);
  const inFlight = useRef<AbortController | null>(null);
  /** Which quantized box the in-flight request is FOR — see the effect below. */
  const inFlightKey = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (bbox: Bounds, limit: number, revalidate = false) => {
    const key = `${limit}:${bbox.join(',')}`;
    const hit = cache.current.get(key);
    if (hit && (!revalidate || hit.source === 'network')) {
      // Touch on read: this is a real LRU rather than insertion-order FIFO.
      cache.current.delete(key);
      cache.current.set(key, hit);
      lastRequested.current = { bbox: hit.bbox, limit: hit.limit, capped: hit.payload.capped };
      drawnKey.current = key;
      const payload = mergeViewportPayload(drawnGauges.current, hit.payload, hit.bbox);
      drawnGauges.current = payload.gauges;
      setState({ ...payload, loading: false, belowMinZoom: false });
      return;
    }

    // One request at a time. Every caller in src/api/client.ts checks for this
    // exact message, so a cancelled request is never painted as an error.
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    inFlightKey.current = key;

    setState((prev) => ({ ...prev, loading: true, belowMinZoom: false }));

    try {
      const startedAt = Date.now();
      const result = await fetchMapGauges(bbox, { limit }, controller.signal);
      if (controller.signal.aborted) return;

      const durationMs = Date.now() - startedAt;
      // The merge is computed before the completion log so the one line
      // carries both halves: what the server returned and what will draw.
      const payload = mergeViewportPayload(drawnGauges.current, result, bbox);
      if (__DEV__) {
        console.info('[map] viewport gauges loaded', {
          durationMs,
          key,
          returned: result.gauges.length,
          drawn: payload.gauges.length,
          carriedOver: payload.gauges.length - result.gauges.length,
          total: result.total,
          capped: result.capped,
          limit,
        });
      }
      if (durationMs >= 2000) {
        warn('map', 'viewport gauge load was slow', {
          durationMs,
          returned: result.gauges.length,
          total: result.total,
          capped: result.capped,
          limit,
        });
      }

      const entry: CacheEntry = {
        key,
        bbox,
        limit,
        fetchedAt: new Date().toISOString(),
        payload: result,
        source: 'network',
      };
      cache.current.delete(key);
      cache.current.set(key, entry);
      // Map preserves insertion order, so the first key is the oldest.
      if (cache.current.size > VIEWPORT_GAUGE_CACHE_SIZE) {
        const oldest = cache.current.keys().next().value;
        if (oldest !== undefined) cache.current.delete(oldest);
      }
      diskIndex.current = [
        ...diskIndex.current.filter((item) => item.key !== key),
        { key, bbox, limit, fetchedAt: entry.fetchedAt },
      ].slice(-VIEWPORT_GAUGE_CACHE_SIZE);
      writeViewportGaugeCache(entry);

      lastRequested.current = { bbox, limit, capped: result.capped };
      drawnKey.current = key;
      // The union of what landed and what was already on screen inside this
      // box — see mergeViewportItems. A capped wide answer must not yank the
      // gauges the reader was just looking at; an uncapped one replaces.
      drawnGauges.current = payload.gauges;
      setState({ ...payload, loading: false, belowMinZoom: false });
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof Error && err.message === 'Request cancelled') return;

      // Keep whatever is drawn. This layer is additive context; losing it
      // silently is far better than blanking it and announcing a failure for
      // something nobody asked for.
      setState((prev) => ({ ...prev, loading: false }));
    } finally {
      if (inFlight.current === controller) {
        inFlight.current = null;
        inFlightKey.current = null;
      }
    }
  }, []);

  // Only the small metadata index loads up front. Reading all twelve payloads
  // here would parse megabytes before the first camera request could begin.
  useEffect(() => {
    let live = true;
    void readViewportGaugeIndex().then((entries) => {
      if (!live) return;
      diskIndex.current = entries;
      setDiskReady(true);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);

    if (!enabled) {
      inFlight.current?.abort();
      inFlight.current = null;
      inFlightKey.current = null;
      lastRequested.current = null;
      hasRequested.current = false;
      drawnKey.current = null;
      drawnGauges.current = [];
      setState(EMPTY);
      return;
    }

    if (!viewport || !diskReady) return;

    if (viewport.zoom < MIN_GAUGE_ZOOM) {
      inFlight.current?.abort();
      inFlight.current = null;
      inFlightKey.current = null;
      // Drop the pins as well as the request: a continental view scattered with
      // whatever happened to be in the last valley is worse than an empty one.
      lastRequested.current = null;
      drawnKey.current = null;
      drawnGauges.current = [];
      setState({ ...EMPTY, belowMinZoom: true });
      logViewportDecision('below-min-zoom', { zoom: viewport.zoom });
      return;
    }

    const limit = viewport.zoom < GAUGE_FETCH_DETAIL_ZOOM ? OVERVIEW_LIMIT : DETAIL_LIMIT;
    const covering = containingEntry(cache.current, viewport.bounds, limit);
    if (covering) {
      cache.current.delete(covering.key);
      cache.current.set(covering.key, covering);
      const touched = touchViewportGaugeIndex(diskIndex.current, covering.key);
      if (touched !== diskIndex.current) {
        diskIndex.current = touched;
        touchViewportGaugeCache(covering.key);
      }
      lastRequested.current = {
        bbox: covering.bbox,
        limit: covering.limit,
        capped: covering.payload.capped,
      };
      if (drawnKey.current !== covering.key) {
        drawnKey.current = covering.key;
        const payload = mergeViewportPayload(drawnGauges.current, covering.payload, covering.bbox);
        drawnGauges.current = payload.gauges;
        setState({ ...payload, loading: false, belowMinZoom: false });
      }
      logViewportDecision('cache-contains', {
        zoom: viewport.zoom,
        limit,
        source: covering.source,
        key: covering.key,
        drawn: drawnGauges.current.length,
      });
      if (covering.source === 'network') {
        inFlight.current?.abort();
        inFlight.current = null;
        inFlightKey.current = null;
        return;
      }
      // Disk is stale-first, never cache-only. It earns an immediate frame but
      // the live request below still replaces it.
    } else if (requestCovers(lastRequested.current, viewport.bounds, limit)) {
      // Same eligibility rule as containingEntry, and it must be: a
      // bounds-only check here let a capped detail answer keep answering an
      // overview camera that had eased back across the fetch threshold —
      // 300 gauges standing in for the 1000-row page until the viewport
      // crossed the padding, where the missing hundreds arrived as a cliff.
      logViewportDecision('within-last-request', {
        zoom: viewport.zoom,
        limit,
        drawn: drawnGauges.current.length,
      });
      return;
    }

    const target = quantizeBbox(padBbox(viewport.bounds, 0.2), viewport.zoom);
    const targetKey = `${limit}:${target.join(',')}`;
    // Already asking for exactly this box? Let the answer land. Mapbox can
    // emit several idle events for one settled camera, and aborting the
    // request each time meant a burst of idles kept the layer perpetually
    // "loading" — the request restarted from zero on every echo.
    if (inFlight.current && inFlightKey.current === targetKey) {
      logViewportDecision('inflight-dedup', { zoom: viewport.zoom, key: targetKey });
      return;
    }
    inFlight.current?.abort();
    inFlight.current = null;
    inFlightKey.current = null;
    logViewportDecision(covering ? 'fetch-revalidate' : 'fetch', {
      zoom: viewport.zoom,
      limit,
      key: targetKey,
      bounds: viewport.bounds,
      drawn: drawnGauges.current.length,
    });
    let live = true;

    // onMapIdle already means the opening camera has stopped. Delaying its first
    // request made an intentionally enabled default layer feel lazy. Later idle
    // bursts are still collapsed while panning.
    const startLoad = (revalidate: boolean) => {
      if (!live) return;
      if (!hasRequested.current) {
        hasRequested.current = true;
        void load(target, limit, revalidate);
      } else {
        timer.current = setTimeout(() => void load(target, limit, revalidate), DEBOUNCE_MS);
      }
    };

    if (covering?.source === 'disk') {
      startLoad(true);
    } else {
      const candidate = newestContainingViewportGaugeEntry(
        diskIndex.current,
        viewport.bounds,
        limit,
      );
      if (!candidate) {
        startLoad(false);
      } else {
        // One disk payload, only after the camera says which one it needs.
        void readContainingViewportGauge(diskIndex.current, viewport.bounds, limit).then(
          (stored) => {
            if (!live) return;
            if (!stored) {
              diskIndex.current = diskIndex.current.filter((item) => item.key !== candidate.key);
              startLoad(false);
              return;
            }

            const diskEntry: CacheEntry = { ...stored, source: 'disk' };
            cache.current.delete(stored.key);
            cache.current.set(stored.key, diskEntry);
            if (cache.current.size > VIEWPORT_GAUGE_CACHE_SIZE) {
              const oldest = cache.current.keys().next().value;
              if (oldest !== undefined) cache.current.delete(oldest);
            }
            lastRequested.current = {
              bbox: stored.bbox,
              limit: stored.limit,
              capped: stored.payload.capped,
            };
            drawnKey.current = stored.key;
            const payload = mergeViewportPayload(drawnGauges.current, stored.payload, stored.bbox);
            drawnGauges.current = payload.gauges;
            setState({ ...payload, loading: false, belowMinZoom: false });

            const touched = touchViewportGaugeIndex(diskIndex.current, stored.key);
            if (touched !== diskIndex.current) {
              diskIndex.current = touched;
              touchViewportGaugeCache(stored.key);
            }
            startLoad(true);
          },
        );
      }
    }

    return () => {
      live = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [enabled, viewport, diskReady, load]);

  // Abort on unmount so a backgrounded map is not still fetching.
  useEffect(() => () => inFlight.current?.abort(), []);

  return state;
}
