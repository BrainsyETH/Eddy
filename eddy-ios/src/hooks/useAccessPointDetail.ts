// eddy-ios/src/hooks/useAccessPointDetail.ts
// Everything the server knows about a tapped put-in, fetched after the sheet is
// already up.
//
// A generalisation of useAccessGaugeStatus, which asked this exact endpoint for
// exactly one field. The sheet's tabs want the rest of it — the road, the
// parking, the amenities, who runs it, and the neighbouring accesses that make
// a float — and they all arrive in the SAME response, so one request feeds
// every tab and adding a tab costs nothing at the network.
//
// The three properties that hook established are kept verbatim, because each of
// them is load-bearing:
//
//   LATE, NEVER BLOCKING. The sheet renders immediately from what the map
//   already holds in memory; this lands underneath a moment later. Nothing
//   above it waits, because the request can be slow or fail and neither
//   Directions nor "Use as put-in" depends on it.
//
//   ABORTED ON EVERY CHANGE OF PIN. Without it a slow response for the put-in
//   somebody just dismissed lands under the one they tapped next.
//
//   THE ANSWER IS HELD WITH THE QUESTION. Route and payload are stored in one
//   piece of state so a stale response can never surface under the current pin,
//   including in the frame between the tap and the request settling. Clearing
//   to null at the top of the effect would do the same job by cascading a
//   render, which is the pattern the lint rule is about.

import { useEffect, useState } from 'react';
import type { AccessPointDetailResponse } from '@eddy/types';
import { fetchAccessPointDetail } from '@/api/client';
import { warn } from '@/lib/monitoring';

/**
 * Pull the two slugs back out of the route the map built.
 *
 * Mirrors the one place that constructs it — `/river/{riverSlug}/access/
 * {accessSlug}` in src/map/RiverMap.tsx. Returns null on anything else, so if
 * that shape ever changes this degrades to "no detail" rather than issuing a
 * request against slugs it guessed.
 */
function slugsFromRoute(route: string | null | undefined): { river: string; access: string } | null {
  if (!route) return null;
  const parts = route.split('/').filter(Boolean);
  if (parts.length !== 4 || parts[0] !== 'river' || parts[2] !== 'access') return null;
  return { river: parts[1], access: parts[3] };
}

/**
 * `null` covers "not an access point", "still loading" and "failed" alike.
 *
 * Deliberate, and the same choice useAccessGaugeStatus made: every tab does the
 * same thing in all three cases, which is to show what it can and leave out
 * what it cannot. A state that distinguished them would be state about the
 * request rather than about the place, and it would have to be rendered.
 */
export function useAccessPointDetail(
  detailRoute: string | null | undefined,
): AccessPointDetailResponse | null {
  const [held, setHeld] = useState<{
    route: string;
    detail: AccessPointDetailResponse | null;
  } | null>(null);

  const detail = held && held.route === detailRoute ? held.detail : null;

  useEffect(() => {
    const slugs = slugsFromRoute(detailRoute);
    if (!slugs) return;

    const controller = new AbortController();
    const route = detailRoute as string;
    void fetchAccessPointDetail(slugs.river, slugs.access, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setHeld({ route, detail: response ?? null });
      })
      .catch((err) => {
        // Non-fatal by construction — the sheet is usable without any of this.
        if (!controller.signal.aborted) warn('map', 'access point detail failed', err);
      });
    return () => controller.abort();
  }, [detailRoute]);

  return detail;
}
