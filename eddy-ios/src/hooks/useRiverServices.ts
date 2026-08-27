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
// commitment than this needs.
//
// ── WHY ensureServices EXISTS ───────────────────────────────────────────
// The released ref promised "the next layer toggle tries again" — a retry
// nobody could reach. The service layers are on by DEFAULT, so `wanted` is
// true from mount and never changes; the only path to a re-run of the
// effect was switching all three service layers off with no river selected,
// then back on. One flaky launch and the campground, rental and lodging
// pins were gone for the session, with no message. So the ask is also a
// callback, mirroring useCuratedGauges: the map screen fires it on tab
// focus (the recovery moment loadRivers already uses) and on search-field
// focus — where the placeholder promises outfitters, the list has to exist
// before the first keystroke.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RiverService } from '@eddy/types';
import { fetchServices } from '@/api/client';

export function useRiverServices(wanted: boolean): {
  /** Null until a request succeeds; a failure leaves it null, never []. */
  services: RiverService[] | null;
  /** Ask now, idempotently. Stable, so it can sit on an onFocus prop. */
  ensureServices: () => void;
} {
  const [services, setServices] = useState<RiverService[] | null>(null);
  const requested = useRef(false);

  const ensureServices = useCallback(() => {
    if (requested.current) return;
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
  }, []);

  useEffect(() => {
    if (wanted) ensureServices();
  }, [wanted, ensureServices]);

  return { services, ensureServices };
}
