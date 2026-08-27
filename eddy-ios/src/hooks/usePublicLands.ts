// eddy-ios/src/hooks/usePublicLands.ts
// The public-land layer's data: whatever boundaries are in the camera.
//
// The app's SECOND viewport-driven fetch, and deliberately the same shape as the
// first (useViewportGauges) rather than a new one — zoom floor, debounce,
// containment, quantize + pad, LRU, and a failure that keeps what is drawn.
// Two hooks with the same discipline are easier to reason about than one
// generic one that has to be told which of five behaviours it is doing.
//
// It differs from useViewportGauges in exactly one way that matters: the
// GEOMETRY is what costs, not the row count. The server clips each parcel to the
// requested box and simplifies it for the requested zoom, so the zoom is part of
// the cache key here where it is not there — the same bbox at two zooms is two
// genuinely different payloads.
//
// OWNERSHIP, NOT PERMISSION. Nothing this hook returns says anyone may camp,
// land or portage anywhere; see PUBLIC_LAND_OWNERSHIP_NOTE for the sentence the
// UI is required to show.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublicLandFeature } from '@eddy/types';
import { bboxContains, padBbox, quantizeBbox, type Bounds } from '@eddy/geo';
import { fetchPublicLands } from '@/api/client';
import { MIN_PUBLIC_LAND_ZOOM } from '@/map/layers';

/** Idle already means "motion stopped"; this only collapses a burst of them. */
const DEBOUNCE_MS = 400;

/**
 * Smaller than useViewportGauges' 12.
 *
 * A cached gauge viewport is a few hundred small objects; a cached land viewport
 * is up to 400 clipped polygons, which is the one thing on this map that can be
 * measured in hundreds of kilobytes. Boundaries also do not go stale, so the
 * CDN is doing most of this work anyway — the local cache only has to make a
 * pan-and-come-back feel instant.
 */
const CACHE_SIZE = 6;

export interface Viewport {
  bounds: Bounds;
  zoom: number;
}

export interface PublicLandsState {
  features: PublicLandFeature[];
  /** True when the server dropped the smallest parcels to meet the cap. */
  capped: boolean;
  /** How many were in the viewport before the cap. */
  total: number;
  loading: boolean;
  /** True once we are zoomed out past the point where this layer is useful. */
  belowMinZoom: boolean;
}

const EMPTY: PublicLandsState = {
  features: [],
  capped: false,
  total: 0,
  loading: false,
  belowMinZoom: false,
};

export function usePublicLands(enabled: boolean, viewport: Viewport | null): PublicLandsState {
  const [state, setState] = useState<PublicLandsState>(EMPTY);

  const cache = useRef(
    new Map<string, { features: PublicLandFeature[]; capped: boolean; total: number }>(),
  );
  const lastRequested = useRef<{ bbox: Bounds; zoom: number } | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (bbox: Bounds, zoom: number) => {
    // Zoom is IN the key: the same box simplified for z9 and for z14 are two
    // different answers, and serving one for the other is either a boundary that
    // visibly cuts corners or a payload nobody needed.
    const key = `${bbox.join(',')}@${zoom}`;
    const hit = cache.current.get(key);
    if (hit) {
      // ABORT FIRST, BEFORE ANY RETURN — useGaugeHistory's rule, and the
      // A/B race is the same one: pan to A (slow fetch goes out), pan back to
      // a cached B, and without this abort A's answer lands later, passes its
      // own signal check, and paints A's parcels under B's camera — with
      // lastRequested then claiming A, so containment holds the lie until the
      // camera leaves A's padded box.
      inFlight.current?.abort();
      inFlight.current = null;
      lastRequested.current = { bbox, zoom };
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
      const result = await fetchPublicLands(bbox, zoom, controller.signal);
      if (controller.signal.aborted) return;

      const next = { features: result.features, capped: result.capped, total: result.total };
      cache.current.set(key, next);
      // Map preserves insertion order, so the first key is the oldest.
      if (cache.current.size > CACHE_SIZE) {
        const oldest = cache.current.keys().next().value;
        if (oldest !== undefined) cache.current.delete(oldest);
      }

      lastRequested.current = { bbox, zoom };
      setState({ ...next, loading: false, belowMinZoom: false });
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof Error && err.message === 'Request cancelled') return;

      // Keep whatever is drawn. This layer is context; losing it silently is far
      // better than blanking it and announcing a failure for something nobody
      // asked to happen.
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

    if (viewport.zoom < MIN_PUBLIC_LAND_ZOOM) {
      inFlight.current?.abort();
      inFlight.current = null;
      // Drop the polygons as well as the request: a four-state view washed with
      // whatever was in the last valley is worse than an empty one.
      lastRequested.current = null;
      setState({ ...EMPTY, belowMinZoom: true });
      return;
    }

    const zoom = Math.round(viewport.zoom);
    // Covered by what we hold, AT THE SAME SIMPLIFICATION. Zooming in inside the
    // same box still has to refetch — the held geometry was simplified for a
    // wider view and would visibly cut corners at the closer one.
    if (
      lastRequested.current &&
      lastRequested.current.zoom === zoom &&
      bboxContains(lastRequested.current.bbox, viewport.bounds)
    ) {
      // Same abort as the cache hit in load(), same race: what is on screen is
      // already right for this camera, so a request still on the wire can only
      // repaint it with somewhere else.
      inFlight.current?.abort();
      inFlight.current = null;
      return;
    }

    const target = quantizeBbox(padBbox(viewport.bounds, 0.2), viewport.zoom);
    timer.current = setTimeout(() => void load(target, zoom), DEBOUNCE_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [enabled, viewport, load]);

  // Abort on unmount so a backgrounded map is not still fetching.
  useEffect(() => () => inFlight.current?.abort(), []);

  return state;
}
