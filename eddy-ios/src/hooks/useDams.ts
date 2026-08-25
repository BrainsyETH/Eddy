// eddy-ios/src/hooks/useDams.ts
// The Corps' live dam state: fetched once on first enable, kept, retried once.
//
// Extracted verbatim from the map screen. The pins themselves come from
// DAM_CATALOG in the binary and are NOT this hook's business — this is the
// enrichment (whether the units are turning, what is coming out, when it was
// measured), and its failure costs exactly those three things, never the
// layer. See the catalog's header for the whole argument.

import { useEffect, useRef, useState } from 'react';
import type { DamSnapshot } from '@eddy/types';
import { ApiError, fetchDams } from '@/api/client';
import { warn } from '@/lib/monitoring';

/**
 * How long to wait before asking the Corps' dams once more.
 *
 * Long enough that a cold /api/dams read-through has finished filling the CDN
 * entry — the measured cold path is five to fifty seconds — and short enough
 * that somebody who opened the layer is still looking at it. The retry is what
 * turns a fifteen-second deadline expiring into a pause rather than an empty
 * layer for the life of the screen.
 */
const DAMS_RETRY_MS = 20_000;

export function useDams(wanted: boolean): DamSnapshot[] | null {
  // Null until the layer has been switched on and answered, so the layers
  // sheet can tell "not fetched" from "none".
  const [dams, setDams] = useState<DamSnapshot[] | null>(null);
  // ── A LATCH THAT ONLY HOLDS ON SUCCESS ──────────────────────────────────
  //
  // Claimed on the ANSWER, not before the fetch: claimed early, one unlucky
  // cold-CDN timeout emptied the layer and wedged it there until the process
  // died — toggling the layer off and on could not retry. A failure releases
  // it and schedules one retry, so returning to a warm CDN entry — the
  // ordinary state seconds later — refills the layer.
  const loaded = useRef(false);
  const attempts = useRef(0);

  useEffect(() => {
    if (!wanted || loaded.current) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const attempt = () => {
      const nth = ++attempts.current;
      // The first-paint cost the everything-on default added to a cold open,
      // kept checkable — same log the gauges and services fetches carry.
      const startedAt = Date.now();
      void fetchDams()
        .then((live) => {
          if (cancelled) return;
          if (__DEV__) {
            console.info('[map] dams loaded', {
              durationMs: Date.now() - startedAt,
              returned: live.length,
              attempt: nth,
            });
          }
          loaded.current = true;
          // Told apart in the log: an empty array from a healthy route is a
          // claim about the Corps, and it has never been true. If this line
          // ever appears, the route changed shape.
          if (live.length === 0) warn('map', 'dams responded with no dams', { attempt: nth });
          setDams(live);
        })
        .catch((err) => {
          if (cancelled) return;
          // WHICH failure, because the two want different fixes: 'No connection'
          // is the deadline expiring on a cold read-through and argues for
          // caching the route; a status code is the route itself failing.
          warn('map', 'dams fetch failed', {
            attempt: nth,
            reason: err instanceof ApiError ? (err.status ?? err.message) : 'unknown',
          });
          // Once. A second failure leaves the catalog pins standing rather than
          // retrying into a route that is evidently unwell — and the layer is
          // still drawn, which is the difference this whole arrangement makes.
          if (nth === 1) timer = setTimeout(attempt, DAMS_RETRY_MS);
        });
    };

    attempt();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [wanted]);

  return dams;
}
