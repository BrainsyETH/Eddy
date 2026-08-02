// eddy-ios/src/hooks/useNetworkAccessPoints.ts
// Every put-in Eddy knows about, for a map with no river selected.
//
// ── Why the map needed this ─────────────────────────────────────────────────
//
// Access points were fetched one river at a time, on selection. So the map
// opened on the statewide network — 25 condition-coloured rivers, which is the
// screen's whole argument for existing — with no way to get on any of them, and
// the only route to a put-in was to pick a river first. That is backwards: the
// river is what somebody is trying to CHOOSE, and access is a large part of how
// they choose it. Nobody drives to a stretch with no landing on it.
//
// ── Where they come from ────────────────────────────────────────────────────
//
// Disk. The launch bundle already seeds every river's put-ins (api/client's
// seedOfflineBundle), so this is a read, not a request — see readAllAccessPoints
// for why that beats the un-slimmed statewide dataset.
//
// The one case a read cannot cover is the FIRST launch, where the map paints
// while the bundle is still in flight. onOfflineBundleSeeded closes it: the
// payload arrives here directly and the pins appear without a second read.
//
// ── The per-river fetch is still the source of truth ───────────────────────
//
// The Map screen merges the selected river's live response OVER this, because
// that response is current and this is a monthly-ish snapshot. This layer's job
// is the other twenty-four rivers.

import { useEffect, useState } from 'react';
import { onOfflineBundleSeeded } from '@/api/client';
import { readAllAccessPoints, type CachedAccessPoint } from '@/lib/riverCache';

export function useNetworkAccessPoints(): CachedAccessPoint[] {
  const [points, setPoints] = useState<CachedAccessPoint[]>([]);

  useEffect(() => {
    let live = true;
    void readAllAccessPoints().then((stored) => {
      // Never replace a set with an empty one: on a first launch the bundle
      // listener below may well win the race, and a late empty read landing
      // afterwards would blank the layer it just filled.
      if (live && stored.length > 0) setPoints(stored);
    });

    const unsubscribe = onOfflineBundleSeeded((payload) => {
      if (!live) return;
      const seeded = payload.flatMap((entry) =>
        entry.accessPoints.map((point) => ({ point, riverSlug: entry.riverSlug })),
      );
      if (seeded.length > 0) setPoints(seeded);
    });

    return () => {
      live = false;
      unsubscribe();
    };
  }, []);

  return points;
}
