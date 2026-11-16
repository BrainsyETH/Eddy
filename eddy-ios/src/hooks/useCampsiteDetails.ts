import { useEffect, useState } from 'react';
import type { CampsiteDetailsResponse } from '@eddy/conditions/campsite-details';
import { fetchCampsiteDetails } from '@/api/client';

/** Key every result and retry to its exact site. Collapsing cancels optional work. */
export function useCampsiteDetails(facilityId: string | null, siteId: string) {
  const [retry, setRetry] = useState(0);
  const key = facilityId ? `${facilityId}:${siteId}:${retry}` : null;
  const [held, setHeld] = useState<{ key: string; response: CampsiteDetailsResponse | null; failed: boolean } | null>(null);
  useEffect(() => {
    if (!facilityId || !key) return;
    const controller = new AbortController();
    void fetchCampsiteDetails(facilityId, siteId, controller.signal).then(response => {
      if (response.facilityId !== facilityId || response.siteId !== siteId) throw new Error('Unexpected campsite details');
      if (!controller.signal.aborted) setHeld({ key, response, failed: false });
    }).catch(() => {
      if (!controller.signal.aborted) setHeld({ key, response: null, failed: true });
    });
    return () => controller.abort();
  }, [facilityId, siteId, key]);
  const current = key && held?.key === key ? held : null;
  return { details: current?.response?.details ?? null, loading: Boolean(key && !current), failed: current?.failed ?? false,
    refresh: () => setRetry(value => value + 1) };
}
