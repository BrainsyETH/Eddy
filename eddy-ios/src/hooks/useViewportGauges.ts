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
//   6. LRU              — panning back is instant.
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

/** Idle already means "motion stopped"; this only collapses a burst of them. */
const DEBOUNCE_MS = 300;

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

/** Panning back through a few screens should never re-fetch. */
const CACHE_SIZE = 12;

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

export function useViewportGauges(enabled: boolean, viewport: Viewport | null) {
  const [state, setState] = useState<ViewportGaugesState>(EMPTY);

  const cache = useRef(new Map<string, { gauges: MapGaugeLite[]; capped: boolean; total: number }>());
  const lastRequested = useRef<Bounds | null>(null);
  const hasRequested = useRef(false);
  const inFlight = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (bbox: Bounds, limit: number) => {
    const key = `${limit}:${bbox.join(',')}`;
    const hit = cache.current.get(key);
    if (hit) {
      lastRequested.current = bbox;
      setState({ ...hit, loading: false, belowMinZoom: false });
      return;
    }

    // One request at a time. Every caller in src/api/client.ts checks for this
    // exact message, so a cancelled request is never painted as an error.
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

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

      cache.current.set(key, result);
      // Map preserves insertion order, so the first key is the oldest.
      if (cache.current.size > CACHE_SIZE) {
        const oldest = cache.current.keys().next().value;
        if (oldest !== undefined) cache.current.delete(oldest);
      }

      lastRequested.current = bbox;
      setState({ ...result, loading: false, belowMinZoom: false });
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof Error && err.message === 'Request cancelled') return;

      // Keep whatever is drawn. This layer is additive context; losing it
      // silently is far better than blanking it and announcing a failure for
      // something nobody asked for.
      setState((prev) => ({ ...prev, loading: false }));
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
    }
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);

    if (!enabled) {
      inFlight.current?.abort();
      inFlight.current = null;
      lastRequested.current = null;
      hasRequested.current = false;
      setState(EMPTY);
      return;
    }

    if (!viewport) return;

    if (viewport.zoom < MIN_GAUGE_ZOOM) {
      inFlight.current?.abort();
      inFlight.current = null;
      // Drop the pins as well as the request: a continental view scattered with
      // whatever happened to be in the last valley is worse than an empty one.
      lastRequested.current = null;
      setState({ ...EMPTY, belowMinZoom: true });
      return;
    }

    // Already covered by what we hold — no request, no state change, no flicker.
    if (lastRequested.current && bboxContains(lastRequested.current, viewport.bounds)) {
      return;
    }

    const target = quantizeBbox(padBbox(viewport.bounds, 0.2), viewport.zoom);
    const limit = viewport.zoom < GAUGE_DETAIL_ZOOM ? OVERVIEW_LIMIT : DETAIL_LIMIT;

    // onMapIdle already means the opening camera has stopped. Delaying its first
    // request made an intentionally enabled default layer feel lazy. Later idle
    // bursts are still collapsed while panning.
    if (!hasRequested.current) {
      hasRequested.current = true;
      void load(target, limit);
    } else {
      timer.current = setTimeout(() => void load(target, limit), DEBOUNCE_MS);
    }

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [enabled, viewport, load]);

  // Abort on unmount so a backgrounded map is not still fetching.
  useEffect(() => () => inFlight.current?.abort(), []);

  return state;
}
