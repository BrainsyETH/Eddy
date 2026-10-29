// eddy-ios/src/hooks/useRiverHazards.ts
// The selected river's hazards, LIVE, over the statewide set from disk.
//
// Extracted verbatim from the map screen. The hazard layer no longer depends
// on this — every hazard Eddy has is drawn from the launch bundle — so what
// this adds is freshness for the one river somebody is looking at. Kept
// because it is a safety surface: a hazard added since the last bundle should
// not wait for a relaunch on the river being planned right now.

import { useEffect, useState } from 'react';
import type { Hazard } from '@eddy/types';
import { fetchHazards } from '@/api/client';
import { readRiver } from '@/lib/riverCache';
import { withPlaceRiver, type PlaceRiver } from '@/lib/placeRiver';

/**
 * Tagged with the river it was fetched for, so the layers sheet can never
 * report one river's count against another — see the map screen's RiverScoped
 * note, whose shape this mirrors structurally.
 */
export interface RiverHazards {
  slug: string;
  items: (Hazard & PlaceRiver)[];
}

export function useRiverHazards(wanted: boolean, slug: string | null): RiverHazards | null {
  // Null rather than [] until fetched, so the sheet can tell "this river has
  // none" from "we have not asked yet" — a count must never claim a zero it
  // does not know.
  const [hazards, setHazards] = useState<RiverHazards | null>(null);

  useEffect(() => {
    if (!wanted || !slug) return;
    const forSlug = slug;
    const controller = new AbortController();
    // Tagged with the river they were fetched for, because the map lays these
    // over the bundle's copies by id and an untagged live hazard would drop the
    // river its sheet names. The name comes off disk — the bundle stored it.
    Promise.all([fetchHazards(forSlug, controller.signal), readRiver(forSlug)])
      .then(([items, cached]) =>
        setHazards({ slug: forSlug, items: withPlaceRiver(items, forSlug, cached?.payload?.river?.name) }))
      .catch(() => {
        // Neither a cancelled request NOR a failed one is "this river has no
        // hazards". Leaving the state null is what the layers sheet reads as
        // "not asked". Writing [] here published a count for unfetched
        // hazards — on the safety surface: a river with a low-water dam on it
        // reported "Hazards 0" whenever the endpoint was down.
      });
    return () => controller.abort();
  }, [wanted, slug]);

  return hazards;
}
