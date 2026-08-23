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
//   7. MERGE, NOT REPLACE — a landing payload is unioned with whatever was
//                         already drawn inside its box (mergeViewportPayload),
//                         so a capped wide answer cannot yank pins that a
//                         tighter box legitimately showed a moment earlier.
//
// Failure keeps the previous payload. Panning into a dead cell must not erase
// the pins you were already looking at, and the curated layer must be untouched
// by any of this.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MapGaugeLite } from '@eddy/types';
import { bboxContains, padBbox, quantizeBbox, type Bounds } from '@eddy/geo';
import { fetchMapGauges } from '@/api/client';
import { GAUGE_DETAIL_ZOOM, MIN_GAUGE_ZOOM } from '@/map/layers';
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
 * An UNCAPPED entry satisfies any limit, not only its own: `capped: false`
 * means the server returned every gauge in that box, so a request for the same
 * ground under a different cap could not learn anything more. Without this the
 * limit flip at GAUGE_DETAIL_ZOOM invalidated the whole cache — zooming across
 * that line refetched a viewport whose complete answer was already in hand,
 * and the layer blinked while the identical payload came back.
 */
function containingEntry(
  entries: Map<string, CacheEntry>,
  bounds: Bounds,
  limit: number,
): CacheEntry | null {
  const newestFirst = [...entries.values()].reverse();
  return (
    newestFirst.find(
      (entry) =>
        (entry.limit === limit || !entry.payload.capped) && bboxContains(entry.bbox, bounds),
    ) ?? null
  );
}

/**
 * Ceiling on the DRAWN set after merging — see mergeViewportPayload.
 *
 * Above the per-request caps on purpose: the merge exists to let a zoom-out
 * keep what was on screen while the wider answer arrives, and a ceiling equal
 * to the request cap would forbid exactly that. Bounded all the same, because
 * every feature here crosses the native bridge on each update.
 */
const MERGED_MAX = 1500;

/**
 * The landing payload, plus whatever was already drawn that still lies inside
 * the fetched box.
 *
 * REPLACING the drawn set was the flicker. Zooming out fetches a wider box
 * whose answer is capped by discharge, so the smaller creeks the reader was
 * just looking at — fetched moments ago under a tighter box — vanished the
 * instant the wide payload landed, then reappeared on the next zoom in. The
 * union keeps them: a gauge that was legitimately on screen stays on screen,
 * and the cap only ever decides what is ADDED, never what is taken away.
 *
 * Filtered to the fetched box, so this never re-litigates the rule that a
 * viewport shows its own gauges — panning far away still drops the last
 * valley. When the union would exceed MERGED_MAX, the carried-over gauges are
 * dropped smallest-discharge first, mirroring the server's own cap.
 */
function mergeViewportPayload(
  drawn: MapGaugeLite[],
  next: Pick<ViewportGaugesState, 'gauges' | 'capped' | 'total'>,
  bbox: Bounds,
): Pick<ViewportGaugesState, 'gauges' | 'capped' | 'total'> {
  if (!drawn.length) return next;
  const have = new Set(next.gauges.map((g) => g.id));
  const kept = drawn.filter(
    (g) =>
      !have.has(g.id) &&
      g.coordinates.lng >= bbox[0] &&
      g.coordinates.lng <= bbox[2] &&
      g.coordinates.lat >= bbox[1] &&
      g.coordinates.lat <= bbox[3],
  );
  if (!kept.length) return next;
  const room = MERGED_MAX - next.gauges.length;
  if (room <= 0) return next;
  const extras =
    kept.length > room
      ? [...kept]
          .sort((a, b) => (b.dischargeCfs ?? 0) - (a.dischargeCfs ?? 0))
          .slice(0, room)
      : kept;
  return { ...next, gauges: [...next.gauges, ...extras] };
}

export function useViewportGauges(enabled: boolean, viewport: Viewport | null) {
  const [state, setState] = useState<ViewportGaugesState>(EMPTY);
  const [diskReady, setDiskReady] = useState(false);

  const cache = useRef(new Map<string, CacheEntry>());
  const diskIndex = useRef<ViewportGaugeIndexRecord[]>([]);
  const drawnKey = useRef<string | null>(null);
  const lastRequested = useRef<Bounds | null>(null);
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
      lastRequested.current = bbox;
      drawnKey.current = key;
      setState((prev) => ({
        ...mergeViewportPayload(prev.gauges, hit.payload, hit.bbox),
        loading: false,
        belowMinZoom: false,
      }));
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
      if (__DEV__) {
        console.info('[map] viewport gauges loaded', {
          durationMs,
          returned: result.gauges.length,
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

      lastRequested.current = bbox;
      drawnKey.current = key;
      // The union of what landed and what was already on screen inside this
      // box — see mergeViewportPayload. A capped wide answer must not yank the
      // gauges the reader was just looking at.
      setState((prev) => ({
        ...mergeViewportPayload(prev.gauges, result, bbox),
        loading: false,
        belowMinZoom: false,
      }));
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
      setState({ ...EMPTY, belowMinZoom: true });
      return;
    }

    const limit = viewport.zoom < GAUGE_DETAIL_ZOOM ? OVERVIEW_LIMIT : DETAIL_LIMIT;
    const covering = containingEntry(cache.current, viewport.bounds, limit);
    if (covering) {
      cache.current.delete(covering.key);
      cache.current.set(covering.key, covering);
      const touched = touchViewportGaugeIndex(diskIndex.current, covering.key);
      if (touched !== diskIndex.current) {
        diskIndex.current = touched;
        touchViewportGaugeCache(covering.key);
      }
      lastRequested.current = covering.bbox;
      if (drawnKey.current !== covering.key) {
        drawnKey.current = covering.key;
        setState((prev) => ({
          ...mergeViewportPayload(prev.gauges, covering.payload, covering.bbox),
          loading: false,
          belowMinZoom: false,
        }));
      }
      if (covering.source === 'network') {
        inFlight.current?.abort();
        inFlight.current = null;
        inFlightKey.current = null;
        return;
      }
      // Disk is stale-first, never cache-only. It earns an immediate frame but
      // the live request below still replaces it.
    } else if (lastRequested.current && bboxContains(lastRequested.current, viewport.bounds)) {
      return;
    }

    const target = quantizeBbox(padBbox(viewport.bounds, 0.2), viewport.zoom);
    // Already asking for exactly this box? Let the answer land. Mapbox can
    // emit several idle events for one settled camera, and aborting the
    // request each time meant a burst of idles kept the layer perpetually
    // "loading" — the request restarted from zero on every echo.
    if (inFlight.current && inFlightKey.current === `${limit}:${target.join(',')}`) {
      return;
    }
    inFlight.current?.abort();
    inFlight.current = null;
    inFlightKey.current = null;
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
            lastRequested.current = stored.bbox;
            drawnKey.current = stored.key;
            setState((prev) => ({
              ...mergeViewportPayload(prev.gauges, stored.payload, stored.bbox),
              loading: false,
              belowMinZoom: false,
            }));

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
