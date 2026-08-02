// eddy-ios/src/hooks/useAccessGaugeStatus.ts
// The water at a tapped put-in, fetched after the callout is already up.
//
// Tapping an access point on the map gave you a place: a name, a river mile,
// a list of what the place is. It did not give you the one fact that decides
// whether you drive there. The value exists — /api/rivers/[slug]/access/[slug]
// has returned `gaugeStatus` since the detail screen shipped — and the map
// simply never asked for it.
//
// ── Late, never blocking ────────────────────────────────────────────────────
//
// The callout renders immediately from data the map already holds, and this
// arrives underneath it a moment later. Nothing above it waits: Directions and
// "Use as put-in" are both live from the first frame, because the request can
// be slow or fail and neither of those actions depends on it.
//
// ── It is the RIVER's gauge, and it says so ─────────────────────────────────
//
// The server grades this from the nearest at-or-upstream gauge applied to the
// reach — not from a sensor at this put-in, which does not exist. That is the
// same number the access-point detail screen shows, computed by the same
// function, so the callout is not making a new claim; but it must carry the
// gauge's NAME for the same reason the detail screen does. A reading with no
// station on it reads as measured here.

import { useEffect, useState } from 'react';
import type { AccessPointGaugeStatus } from '@eddy/types';
import { fetchAccessPointDetail } from '@/api/client';
import { warn } from '@/lib/monitoring';

/**
 * Pull the two slugs back out of the route the map built.
 *
 * Mirrors the one place that constructs it — `/river/{riverSlug}/access/
 * {accessSlug}` in src/map/RiverMap.tsx. Returns null on anything else, so if
 * that shape ever changes this degrades to "no reading" rather than issuing a
 * request against slugs it guessed.
 */
function slugsFromRoute(route: string | null | undefined): { river: string; access: string } | null {
  if (!route) return null;
  const parts = route.split('/').filter(Boolean);
  if (parts.length !== 4 || parts[0] !== 'river' || parts[2] !== 'access') return null;
  return { river: parts[1], access: parts[3] };
}

/**
 * `null` covers all three of "not an access point", "still loading" and
 * "failed" — deliberately, because the callout does the same thing in each
 * case: it shows the place without a reading. A row that distinguished them
 * would be a row about the request.
 */
export function useAccessGaugeStatus(detailRoute: string | null | undefined) {
  /**
   * The reading AND the route it belongs to, stored together.
   *
   * Two fields rather than one so the answer for the previous pin is never
   * surfaced under the current one — including for the frame between tapping a
   * new pin and its request settling. Resetting to null at the top of the
   * effect would do the same job by clearing state during render, which is the
   * cascading-render pattern the lint rule is about.
   */
  const [held, setHeld] = useState<{ route: string; status: AccessPointGaugeStatus | null } | null>(
    null,
  );
  const status = held && held.route === detailRoute ? held.status : null;

  useEffect(() => {
    const slugs = slugsFromRoute(detailRoute);
    if (!slugs) return;

    // Aborted on every change of pin. Without it a slow response for the put-in
    // somebody just dismissed lands under the one they tapped next, which is
    // the worst available failure for a reading attached to a place.
    const controller = new AbortController();
    const route = detailRoute as string;
    void fetchAccessPointDetail(slugs.river, slugs.access, controller.signal)
      .then((detail) => {
        if (!controller.signal.aborted) setHeld({ route, status: detail?.gaugeStatus ?? null });
      })
      .catch((err) => {
        // Non-fatal by construction — the callout is fully usable without it.
        if (!controller.signal.aborted) warn('map', 'access gauge status failed', err);
      });
    return () => controller.abort();
  }, [detailRoute]);

  return status;
}
