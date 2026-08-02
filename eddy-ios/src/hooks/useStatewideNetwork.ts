// eddy-ios/src/hooks/useStatewideNetwork.ts
// The statewide condition network, fetched once and graded on the phone.
//
// Two requests, deliberately separate, because they age at different rates:
// geometry and thresholds barely change (the website caches them for 10
// minutes), while readings move on a 15-minute cadence. Splitting them is also
// what lets the map draw the network the moment the geometry lands and colour
// it a beat later, rather than showing nothing until both have arrived.
//
// No query library in this app — plain useEffect + AbortController, matching
// every other fetch on the Map screen.
//
// ── Both requests retry when the tab comes forward ──────────────────────────
//
// They used to fire once, on mount, and that was the whole story. Open the app
// with no signal and the readings request fails; get signal back and nothing
// ever asked again, so "Live conditions unavailable" stayed up and every river
// stayed grey for the rest of the session — on a screen whose entire job is to
// colour rivers by their live condition. The river-list request on the Map tab
// already retried on focus for exactly this reason (see loadRivers there); this
// is the same rule applied to the two requests that actually paint the map.
//
// Gated on having FAILED, not on being empty: the first focus happens inside
// the window where the mount fetch is still in flight, and an unguarded retry
// would double every cold start.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ApiError, fetchStatewideNetwork, fetchStatewideReadings } from '@/api/client';
import { readNetwork } from '@/lib/riverCache';
import {
  buildNetwork,
  networkBounds,
  type NetworkCollection,
  type StatewideReading,
  type StatewideRiver,
} from '@/lib/statewideNetwork';

export interface StatewideNetwork {
  collection: NetworkCollection;
  /** [w, s, e, n] over every drawn river, for the opening camera. */
  bounds: [number, number, number, number] | null;
  /**
   * The RAW rivers, by slug — geometry as it came down, unsplit.
   *
   * The Map tab reads a selected river's line and extent out of here instead of
   * fetching /api/rivers/{slug} for them. `collection` cannot serve that: it
   * splits a multi-gauge river into one feature per reach so each can be
   * painted by the gauge that watches it, and the offline planner needs the
   * whole line in order.
   */
  bySlug: ReadonlyMap<string, StatewideRiver>;
  loading: boolean;
  /**
   * True when the geometry arrived but the readings did not, so every line is
   * drawn in the `unknown` grey for a reason the map can name.
   *
   * This exists because the silent version of this state shipped: a null site
   * id from a dam station 400'd the whole USGS batch, /api/usgs/mo-statewide
   * 500'd, and the app presented twenty-four grey rivers as though grey were
   * the verdict. Grey means "we could not ask", and a map that cannot say so is
   * lying quietly.
   */
  readingsFailed: boolean;
}

export function useStatewideNetwork(): StatewideNetwork {
  const [rivers, setRivers] = useState<StatewideRiver[] | null>(null);
  const [readings, setReadings] = useState<StatewideReading[] | null>(null);
  const [readingsFailed, setReadingsFailed] = useState(false);
  /**
   * Whether the GEOMETRY request came back badly, as distinct from not yet.
   *
   * `rivers === null` cannot answer that, because it is also what a phone with
   * a disk copy and a dead connection looks like a moment before the read
   * lands — and a river drawn from disk is still a river the retry should top
   * up when signal returns. Only a rejection sets this.
   */
  const [geometryFailed, setGeometryFailed] = useState(false);

  // The GEOMETRY failing is still silent, and still on purpose: the map draws
  // the selected river, its access points and its gauges without it, and an
  // error banner over a working map would be noise. It is only tracked so the
  // focus retry knows there is something to ask for again.
  const loadGeometry = useCallback(
    (signal: AbortSignal) =>
      fetchStatewideNetwork(signal)
        .then((next) => {
          setRivers(next);
          setGeometryFailed(false);
        })
        .catch((err: unknown) => {
          if (err instanceof ApiError && err.message === 'Request cancelled') return;
          setGeometryFailed(true);
        }),
    [],
  );

  // The READINGS failing is NOT silent. The rule that has not changed is that a
  // coloured line must never be drawn from stale or partial data — no readings
  // still means no colours. What the map says is which of the two greys it is
  // showing: a river nobody can grade, or a request that did not come back.
  const loadReadings = useCallback(
    (signal: AbortSignal) =>
      fetchStatewideReadings(signal)
        .then(({ readings: next, available }) => {
          setReadings(next);
          // An empty list from a server that says it could not ask is a failure;
          // an empty list from one that could is a genuinely unread network.
          setReadingsFailed(!available);
        })
        .catch((err: unknown) => {
          if (err instanceof ApiError && err.message === 'Request cancelled') return;
          setReadingsFailed(true);
        }),
    [],
  );

  useEffect(() => {
    const controller = new AbortController();

    // ── Disk first, network over the top ──────────────────────────────────
    //
    // The geometry is written through to disk on every successful fetch and,
    // until now, was never read back — so an app opened with no signal drew no
    // rivers at all, having a perfectly good copy of all 25 on the phone. That
    // mattered more once the Map tab started taking the selected river's line
    // and extent from here rather than from its own endpoint: this is the only
    // source of a river's shape now, and it has to survive a dead connection.
    //
    // Never overwrites a live response — `current ?? stored` — because the read
    // can land after the fetch on a fast connection.
    void readNetwork().then((stored) => {
      if (controller.signal.aborted || !stored?.payload?.length) return;
      setRivers((current) => current ?? stored.payload);
    });

    void loadGeometry(controller.signal);
    void loadReadings(controller.signal);
    return () => controller.abort();
  }, [loadGeometry, loadReadings]);

  /**
   * Ask again for whichever of the two did not come back, when the tab is
   * looked at.
   *
   * This is the moment somebody is staring at a grey map wondering why the
   * message is still there, and — for the reported case — the moment they have
   * just walked back into signal.
   *
   * TWO EFFECTS, NOT ONE, and the split is load-bearing. Sharing an effect
   * means sharing an AbortController and a dependency list, so whichever
   * request came back FIRST would tear the other one down mid-flight on its way
   * to clearing its own flag — and the surviving flag would then sit there
   * until the next focus, having just had its retry cancelled by a success.
   * Separate effects make each retry answerable only to its own failure.
   */
  useFocusEffect(
    useCallback(() => {
      if (!geometryFailed) return;
      const controller = new AbortController();
      void loadGeometry(controller.signal);
      return () => controller.abort();
    }, [geometryFailed, loadGeometry]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!readingsFailed) return;
      const controller = new AbortController();
      void loadReadings(controller.signal);
      return () => controller.abort();
    }, [readingsFailed, loadReadings]),
  );

  const collection = useMemo(
    () => buildNetwork(rivers ?? [], readings ?? []),
    [rivers, readings],
  );

  // Bounds come off geometry alone, so the camera can settle before the
  // readings land rather than jumping once they do.
  const bounds = useMemo(() => networkBounds(collection), [collection]);

  const bySlug = useMemo(
    () => new Map((rivers ?? []).map((river) => [river.slug, river])),
    [rivers],
  );

  return { collection, bounds, bySlug, loading: rivers === null, readingsFailed };
}
