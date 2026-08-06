// eddy-ios/src/hooks/useCampsiteSites.ts
// The individual sites at one campground, fetched only when somebody looks.
//
// Keeps useAccessPointDetail's three invariants verbatim — late and never
// blocking, aborted on every change, and the answer held with the question —
// for the same reasons, which are argued in full in that file's header.
//
// ── Why this is not part of the pin's one request ─────────────────────────
//
// The fortnight of COUNTS rides inline on the access-point response, so the
// strip paints on the first frame with nothing outstanding. The SITES do not:
// Meramec has 197 of them, and putting that on every pin tap would charge every
// reader who never opens the Camping tab.
//
// ── Gate on the ACTIVE tab, not on mount ──────────────────────────────────
//
// SheetPager mounts the active page and both its neighbours, so Camping mounts
// as a neighbour of Floats on most pins. Firing on mount would request the
// sites of nearly every campground somebody taps, which is the whole thing this
// hook exists to avoid. The caller passes null until its tab is the live one.

import { useEffect, useState } from 'react';
import type { CampsiteSitesResponse } from '@eddy/types';
import { fetchCampsiteSites } from '@/api/client';
import { warn } from '@/lib/monitoring';
import type { DetailStatus } from './useAccessPointDetail';

export function useCampsiteSites(facilityId: string | null | undefined): {
  sites: CampsiteSitesResponse | null;
  status: DetailStatus;
} {
  const [held, setHeld] = useState<{
    facilityId: string;
    sites: CampsiteSitesResponse | null;
    failed: boolean;
  } | null>(null);

  const current = held && held.facilityId === facilityId ? held : null;
  const status: DetailStatus = !facilityId
    ? 'idle'
    : current
      ? current.failed
        ? 'failed'
        : 'ready'
      : 'loading';

  useEffect(() => {
    if (!facilityId) return;

    const controller = new AbortController();
    void fetchCampsiteSites(facilityId, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) {
          setHeld({ facilityId, sites: response, failed: false });
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          warn('map', 'campsite sites failed', err);
          setHeld({ facilityId, sites: null, failed: true });
        }
      });
    return () => controller.abort();
  }, [facilityId]);

  return { sites: current?.sites ?? null, status };
}
