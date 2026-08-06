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
// GET /api/gauges/[siteId], which is why the Levels and About tabs wait on this
// and the glance does not.
//
// ── IT RETURNS A STATUS NOW, and the reason is a tab that lies ────────────
// It used to return `GaugeDetail | null` alone, which folded three states into
// one null: not asked, asking, and asked-and-got-nothing. The Levels tab reads
// `detail.thresholds` and said "Eddy has not rated this station against a river
// yet" for all three — so every curated gauge asserted it was unrated for as
// long as its own request was in flight.
//
// Same telling-apart, and the same words, as useAccessPointDetail. A tab that is
// waiting and a tab that asked and failed look identical if both render blank,
// and the reader has no way to know whether to wait.

import { useEffect, useState } from 'react';
import type { GaugeDetail } from '@eddy/types';
import { fetchGaugeDetail } from '@/api/client';
import type { DetailStatus } from '@/hooks/useAccessPointDetail';
import { warn } from '@/lib/monitoring';

export function useGaugeDetail(siteId: string | null | undefined): {
  detail: GaugeDetail | null;
  status: DetailStatus;
} {
  const [held, setHeld] = useState<{
    siteId: string;
    detail: GaugeDetail | null;
    failed: boolean;
  } | null>(null);

  const current = held && held.siteId === siteId ? held : null;
  const detail = current?.detail ?? null;
  const status: DetailStatus = !siteId
    ? 'idle'
    : current
      ? current.failed
        ? 'failed'
        : 'ready'
      : 'loading';

  useEffect(() => {
    if (!siteId) return;
    const controller = new AbortController();
    void fetchGaugeDetail(siteId, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) {
          setHeld({ siteId, detail: response ?? null, failed: false });
        }
      })
      .catch((err) => {
        // Non-fatal: the glance is already showing the reading. Recorded as a
        // settled failure rather than dropped, or the tabs wait for ever.
        if (!controller.signal.aborted) {
          warn('map', 'gauge detail failed', err);
          setHeld({ siteId, detail: null, failed: true });
        }
      });
    return () => controller.abort();
  }, [siteId]);

  return { detail, status };
}
