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
import { onForeground } from '@/lib/foreground';
import { warn } from '@/lib/monitoring';

/** /api/gauges' own s-maxage — the app must not hold readings longer. */
const GAUGES_TTL_MS = 300_000;

export function useCuratedGauges(wanted: boolean): {
  /** Null until a request SUCCEEDS; a failure leaves it null, never []. */
  gauges: MapGauge[] | null;
  /** Ask now, idempotently. Stable, so it can sit on an onFocus prop. */
  ensureGauges: () => void;
} {
  const [gauges, setGauges] = useState<MapGauge[] | null>(null);
  const requested = useRef(false);
  const fetchedAt = useRef<number | null>(null);
  // True only while a request is on the wire. `requested` cannot carry this:
  // it stays true forever after a success, so the foreground check below
  // needs its own answer to "is one already running" before it releases the
  // latch — releasing mid-flight started a second fetch, and the older
  // response finishing last would overwrite the newer.
  const inFlight = useRef(false);

  const ensureGauges = useCallback(() => {
    if (requested.current) return;
    requested.current = true;
    // Deliberately un-aborted and un-erroring: this is a background enrichment
    // for search and a map layer, and a failure means "not answered yet", not
    // a message.
    //
    // ── A FAILURE IS NOT AN EMPTY LIST, AND THE REF RELEASES ────────────────
    // This latched the ref before the fetch and never let go, while the catch
    // set []. One dead-spot launch and the session was decided: the default-on
    // rated layer drew nothing, the layers sheet printed an honest-looking
    // "0" — a claim about the data, where the truth was "could not ask" — and
    // gauge search flew the camera to an unmarked spot because the callout is
    // built from this list. Same rule as useRiverServices: null until success,
    // release on failure, and the next ensureGauges call genuinely retries.
    const startedAt = Date.now();
    inFlight.current = true;
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
        fetchedAt.current = Date.now();
        setGauges(loaded);
      })
      .catch(() => {
        requested.current = false;
      })
      .finally(() => {
        inFlight.current = false;
      });
  }, []);

  useEffect(() => {
    if (wanted) ensureGauges();
  }, [wanted, ensureGauges]);

  // A resumed phone re-asks once the readings have outlived the route's own
  // freshness. Stale-while-revalidate: the old list stays drawn until the new
  // one lands, so foregrounding never blanks a layer — it just stops last
  // night's condition colours presenting as this morning's.
  useEffect(() => {
    if (!wanted) return;
    return onForeground(() => {
      if (inFlight.current) return;
      if (fetchedAt.current === null) return;
      if (Date.now() - fetchedAt.current < GAUGES_TTL_MS) return;
      requested.current = false;
      ensureGauges();
    });
  }, [wanted, ensureGauges]);

  return { gauges, ensureGauges };
}
