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
//
// ── AND IT REMEMBERS, for the same reason that hook does ──────────────────
// The sheet is unmounted whenever search takes focus and remounted when it
// lets go, and a gauge opened from a river sheet and then reopened is a
// second mount too. Each one asked the server again for a record it had held
// seconds earlier and drew "Loading levels…" over a tab it had just finished.
// A short session cache answers the remount on its first frame; the request
// still goes out behind it and replaces what it finds. See the access hook's
// header for the trade and the bound.

import { useEffect, useState } from 'react';
import type { GaugeDetail } from '@eddy/types';
import { fetchGaugeDetail } from '@/api/client';
import { rememberAnswer, recallAnswer, type DetailStatus } from '@/hooks/useAccessPointDetail';
import { warn } from '@/lib/monitoring';

const GAUGE_CACHE = new Map<string, { answer: GaugeDetail; at: number }>();

export function useGaugeDetail(
  siteId: string | null | undefined,
  /** Bumped by the sheet's Try again; the request runs once more for the same station. */
  revision = 0,
): {
  detail: GaugeDetail | null;
  status: DetailStatus;
} {
  const [held, setHeld] = useState<{
    siteId: string;
    detail: GaugeDetail | null;
    failed: boolean;
  } | null>(null);

  // The live answer first, then the remembered one. A failed refresh over a
  // remembered record keeps the record — see the catch below — so this only
  // falls through to the cache while a request for this station is in flight.
  const remembered = siteId ? recallAnswer(GAUGE_CACHE, siteId) : null;
  const current = held && held.siteId === siteId
    ? held
    : siteId && remembered ? { siteId, detail: remembered, failed: false } : null;
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
          if (response) rememberAnswer(GAUGE_CACHE, siteId, response);
          setHeld({ siteId, detail: response ?? null, failed: false });
        }
      })
      .catch((err) => {
        // Non-fatal: the glance is already showing the reading. Recorded as a
        // settled failure rather than dropped, or the tabs wait for ever — but
        // a failed REFRESH keeps the record the sheet is already drawing, from
        // this mount or a remembered one. A page that was on screen a moment
        // ago is a better answer than "unavailable".
        if (!controller.signal.aborted) {
          warn('map', 'gauge detail failed', err);
          const kept = recallAnswer(GAUGE_CACHE, siteId);
          setHeld((prev) => (prev?.siteId === siteId && prev.detail
            ? prev
            : kept ? { siteId, detail: kept, failed: false } : { siteId, detail: null, failed: true }));
        }
      });
    return () => controller.abort();
  }, [siteId, revision]);

  return { detail, status };
}
