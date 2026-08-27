// eddy-ios/src/hooks/useNetworkPlaces.ts
// Every put-in and every hazard Eddy knows about, for a map with no river
// selected.
//
// ── Why the map needed this ─────────────────────────────────────────────────
//
// Both were fetched one river at a time, on selection. So the map opened on the
// statewide network — 25 condition-coloured rivers, which is the screen's whole
// argument for existing — with no way to get on any of them and no sign of what
// is dangerous on any of them. That is backwards: the river is what somebody is
// trying to CHOOSE, and access and hazards are a large part of how they choose
// it. Nobody drives to a stretch with no landing on it, and nobody should have
// to commit to one to find out it has a low-water dam in the middle.
//
// ── Where they come from ────────────────────────────────────────────────────
//
// Disk. The launch bundle already seeds every river's put-ins and hazards
// (api/client's seedOfflineBundle), so this is a read, not a request — see
// readAllPlaces for why that beats the un-slimmed statewide dataset.
//
// The one case a read cannot cover is the FIRST launch, where the map paints
// while the bundle is still in flight. onOfflineBundleSeeded closes it: the
// payload arrives here directly and the pins appear without a second read.
//
// ── The per-river fetches are still the source of truth ────────────────────
//
// The Map screen merges the selected river's live responses OVER this, because
// those are current and this is a monthly-ish snapshot. This layer's job is the
// other twenty-four rivers.

import { useEffect, useState } from 'react';
import { onOfflineBundleSeeded } from '@/api/client';
import { readAllPlaces, type CachedPlaces } from '@/lib/riverCache';

const EMPTY: CachedPlaces = { accessPoints: [], hazards: [] };

export function useNetworkPlaces(): CachedPlaces {
  const [places, setPlaces] = useState<CachedPlaces>(EMPTY);

  useEffect(() => {
    let live = true;
    // Once a seed payload has been applied, the disk read is history: on a
    // first launch the read can catch the cache MID-seed — some rivers
    // written, most not, so non-empty — and resolving after the seed event it
    // would replace 25 rivers' pins with 3. The empty-read guard below never
    // caught that case; only an emptiness check did, and a partial write is
    // not empty.
    let seeded = false;
    void readAllPlaces().then((stored) => {
      // Never replace a set with an empty one: on a first launch the bundle
      // listener below may well win the race, and a late empty read landing
      // afterwards would blank the layers it just filled.
      if (live && !seeded && stored.accessPoints.length > 0) setPlaces(stored);
    });

    // Subscribing REPLAYS a seed that already fired (see onOfflineBundleSeeded),
    // synchronously — so a map tab first mounted after the seed still hears it,
    // and `seeded` is set before the disk read above can resolve.
    const unsubscribe = onOfflineBundleSeeded((payload) => {
      if (!live) return;
      const accessPoints = payload.flatMap((entry) =>
        entry.accessPoints.map((point) => ({ point, riverSlug: entry.riverSlug })),
      );
      const hazards = payload.flatMap((entry) => entry.hazards);
      if (accessPoints.length > 0 || hazards.length > 0) {
        seeded = true;
        setPlaces({ accessPoints, hazards });
      }
    });

    return () => {
      live = false;
      unsubscribe();
    };
  }, []);

  return places;
}
