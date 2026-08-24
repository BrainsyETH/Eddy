// eddy-ios/src/hooks/useRiverServices.ts
// Every service in the state, fetched once when something wants them.
//
// Extracted verbatim from the map screen. Statewide and unscoped: the set is
// fixed, so once it has been asked for there is nothing a change of river
// selection could add — hence a ref rather than a slug guard.
//
// ── A FAILURE IS NOT AN EMPTY DIRECTORY ─────────────────────────────────
// fetchServices answers null on failure, never []; `services` then stays
// null and every count downstream stays undefined, which the layers sheet
// draws as absent rather than as zero. And the ref is RELEASED on failure —
// marking the request as made before it succeeds meant one flaky moment
// disabled three layers for the life of the screen. No timer and no retry
// loop: a map screen quietly re-requesting on a schedule is a bigger
// commitment than this needs, and the next layer toggle tries again.

import { useEffect, useRef, useState } from 'react';
import type { RiverService } from '@eddy/types';
import { fetchServices } from '@/api/client';

export function useRiverServices(wanted: boolean): RiverService[] | null {
  const [services, setServices] = useState<RiverService[] | null>(null);
  const requested = useRef(false);

  useEffect(() => {
    if (!wanted || requested.current) return;
    requested.current = true;
    // The other half of the first-paint cost the dams hook logs.
    const startedAt = Date.now();
    void fetchServices().then((rows) => {
      if (rows === null) {
        requested.current = false;
        return;
      }
      if (__DEV__) {
        console.info('[map] services loaded', {
          durationMs: Date.now() - startedAt,
          returned: rows.length,
        });
      }
      setServices(rows);
    });
  }, [wanted]);

  return services;
}
