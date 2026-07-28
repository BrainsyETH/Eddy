// eddy-ios/src/hooks/useViewportGauges.ts
// The national gauge layer's data: whatever is in the camera, and nothing else.
//
// This is the app's FIRST viewport-driven fetch. Everything else loads up front
// — the whole curated network, every gauge, a river's access points — because
// those sets are small and bounded. The national tier is ~14,000 gauges and
// cannot work that way, so this hook exists to make panning cheap:
//
//   1. ZOOM FLOOR       — below z7 it draws nothing and asks for nothing.
//   2. DEBOUNCE         — a fling emits several idle events; only the last one
//                         should cost a request.
//   3. CONTAINMENT      — if the new viewport is inside what we already hold,
//                         there is no request at all. This is what makes small
//                         pans free.
//   4. QUANTIZE + PAD   — snap to a grid so the URL is CDN-cacheable, and ask
//                         for more than the screen so step 3 hits more often.
//   5. LRU              — panning back is instant.
//
// Failure keeps the previous payload. Panning into a dead cell must not erase
// the pins you were already looking at, and the curated layer must be untouched
// by any of this.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MapGaugeLite } from '@eddy/types';
import { bboxContains, padBbox, quantizeBbox, type Bounds } from '@eddy/geo';
import { fetchMapGauges } from '@/api/client';
import { MIN_ALL_GAUGES_ZOOM } from '@/map/layers';

/** Idle already means "motion stopped"; this only collapses a burst of them. */
const DEBOUNCE_MS = 400;

/** Matches the server default. Kept here so the disclosure below is honest. */
const LIMIT = 300;

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
  const inFlight = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (bbox: Bounds) => {
    const key = bbox.join(',');
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
      const result = await fetchMapGauges(bbox, { limit: LIMIT }, controller.signal);
      if (controller.signal.aborted) return;

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
      setState(EMPTY);
      return;
    }

    if (!viewport) return;

    if (viewport.zoom < MIN_ALL_GAUGES_ZOOM) {
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
    timer.current = setTimeout(() => void load(target), DEBOUNCE_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [enabled, viewport, load]);

  // Abort on unmount so a backgrounded map is not still fetching.
  useEffect(() => () => inFlight.current?.abort(), []);

  return state;
}
