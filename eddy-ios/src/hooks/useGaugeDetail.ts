// eddy-ios/src/hooks/useGaugeDetail.ts
// The full record for a tapped gauge, fetched after the sheet is already up.
//
// Same contract as useAccessPointDetail, for the same three reasons: late and
// never blocking, aborted on every change of pin, and the answer held together
// with the question so a slow response cannot surface under the wrong station.
//
// ── What the map already has, and what it does not ────────────────────────
// A curated pin arrives with its reading and its ladder; a national one with a
// reading and a percentile. Neither carries flood stages, the station note, or
// the list of rivers a gauge grades — those live only behind
// GET /api/gauges/[siteId], which is why the Levels and About tabs wait on
// this and the Now tab does not.

import { useEffect, useState } from 'react';
import type { GaugeDetail } from '@eddy/types';
import { fetchGaugeDetail } from '@/api/client';
import { warn } from '@/lib/monitoring';

export function useGaugeDetail(siteId: string | null | undefined): GaugeDetail | null {
  const [held, setHeld] = useState<{ siteId: string; detail: GaugeDetail | null } | null>(null);
  const detail = held && held.siteId === siteId ? held.detail : null;

  useEffect(() => {
    if (!siteId) return;
    const controller = new AbortController();
    void fetchGaugeDetail(siteId, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setHeld({ siteId, detail: response ?? null });
      })
      .catch((err) => {
        // Non-fatal: the Now tab is already showing the reading.
        if (!controller.signal.aborted) warn('map', 'gauge detail failed', err);
      });
    return () => controller.abort();
  }, [siteId]);

  return detail;
}
