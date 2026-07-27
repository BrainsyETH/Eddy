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
import { summarizeConditionCounts, type ConditionCounts } from '@eddy/conditions';

export interface StatewideNetwork {
  collection: NetworkCollection;
  /** Per-code tallies plus the floatable/running-low/running-high buckets. */
  counts: ConditionCounts;
  /** [w, s, e, n] over every drawn river, for the opening camera. */
  bounds: [number, number, number, number] | null;
  loading: boolean;
}

export function useStatewideNetwork(): StatewideNetwork {
  const [rivers, setRivers] = useState<StatewideRiver[] | null>(null);
  const [readings, setReadings] = useState<StatewideReading[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    // Failure here is silent ON PURPOSE. The network is context: if it does not
    // arrive, the map still draws the selected river, its access points and its
    // gauges, and an error banner over a working map would be noise. The one
    // thing that must never happen is a coloured line drawn from stale or
    // partial data, and that cannot happen — no readings means no collection.
    fetchStatewideNetwork(controller.signal)
      .then(setRivers)
      .catch((err) => {
        if (err instanceof ApiError && err.message === 'Request cancelled') return;
      });
    fetchStatewideReadings(controller.signal)
      .then(setReadings)
      .catch((err) => {
        if (err instanceof ApiError && err.message === 'Request cancelled') return;
      });
    return () => controller.abort();
  }, []);

  const collection = useMemo(
    () => buildNetwork(rivers ?? [], readings ?? []),
    [rivers, readings],
  );

  const counts = useMemo(
    () => summarizeConditionCounts(collection.features.map((f) => f.properties.code)),
    [collection],
  );

  // Bounds come off geometry alone, so the camera can settle before the
  // readings land rather than jumping once they do.
  const bounds = useMemo(() => networkBounds(collection), [collection]);

  return { collection, counts, bounds, loading: rivers === null };
}
