// eddy-ios/src/hooks/useCuratedGauges.ts
// The curated gauge list: one statewide request, fired on demand and reused.
//
// Extracted verbatim from the map screen, which had grown four independent
// fetch effects among its selection and camera policy. The behaviour is the
// screen's own, moved: nothing is requested until the layer wants it or a
// caller asks (search does, on field focus, so the list exists before the
// first gauge query rather than after it).

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MapGauge } from '@eddy/types';
import { fetchGauges } from '@/api/client';
import { warn } from '@/lib/monitoring';

export function useCuratedGauges(wanted: boolean): {
  /** Null until the request answers; [] is a real (failed or empty) answer. */
  gauges: MapGauge[] | null;
  /** Ask now, idempotently. Stable, so it can sit on an onFocus prop. */
  ensureGauges: () => void;
} {
  const [gauges, setGauges] = useState<MapGauge[] | null>(null);
  const requested = useRef(false);

  const ensureGauges = useCallback(() => {
    if (requested.current) return;
    requested.current = true;
    // Deliberately un-aborted and un-erroring: this is a background enrichment
    // for search and a map layer, and a failure means "no gauges", not a
    // message. Retrying is one more tap in the layers sheet.
    const startedAt = Date.now();
    fetchGauges()
      .then((loaded) => {
        const durationMs = Date.now() - startedAt;
        if (__DEV__) {
          console.info('[map] curated gauges loaded', {
            durationMs,
            returned: loaded.length,
          });
        }
        if (durationMs >= 2000) {
          warn('map', 'curated gauge load was slow', {
            durationMs,
            returned: loaded.length,
          });
        }
        setGauges(loaded);
      })
      .catch(() => setGauges([]));
  }, []);

  useEffect(() => {
    if (wanted) ensureGauges();
  }, [wanted, ensureGauges]);

  return { gauges, ensureGauges };
}
