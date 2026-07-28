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

import { useEffect, useMemo, useState } from 'react';
import { ApiError, fetchStatewideNetwork, fetchStatewideReadings } from '@/api/client';
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

  useEffect(() => {
    const controller = new AbortController();
    // The GEOMETRY failing is still silent, and still on purpose: the map draws
    // the selected river, its access points and its gauges without it, and an
    // error banner over a working map would be noise.
    //
    // The READINGS failing is not, and used to be. The rule that has not
    // changed is that a coloured line must never be drawn from stale or partial
    // data — no readings still means no colours. What changed is that the map
    // now says which of the two greys it is showing: a river nobody can grade,
    // or a request that did not come back.
    fetchStatewideNetwork(controller.signal)
      .then(setRivers)
      .catch((err) => {
        if (err instanceof ApiError && err.message === 'Request cancelled') return;
      });
    fetchStatewideReadings(controller.signal)
      .then(({ readings: next, available }) => {
        setReadings(next);
        // An empty list from a server that says it could not ask is a failure;
        // an empty list from one that could is a genuinely unread network.
        setReadingsFailed(!available);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.message === 'Request cancelled') return;
        setReadingsFailed(true);
      });
    return () => controller.abort();
  }, []);

  const collection = useMemo(
    () => buildNetwork(rivers ?? [], readings ?? []),
    [rivers, readings],
  );

  // Bounds come off geometry alone, so the camera can settle before the
  // readings land rather than jumping once they do.
  const bounds = useMemo(() => networkBounds(collection), [collection]);

  return { collection, bounds, loading: rivers === null, readingsFailed };
}
