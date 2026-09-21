import { useEffect, useState } from 'react';
import type { CampsitePhotosResponse } from '@eddy/types';
import { fetchCampsitePhotos } from '@/api/client';

/** Gate on the active camping tab. Hold each response with its facility. */
export function useCampsitePhotos(facilityId: string | null) {
  const [held, setHeld] = useState<CampsitePhotosResponse | null>(null);
  useEffect(() => {
    if (!facilityId) return;
    const controller = new AbortController();
    void fetchCampsitePhotos(facilityId, controller.signal).then((response) => {
      if (!controller.signal.aborted && response.facilityId === facilityId) setHeld(response);
    }).catch(() => { /* Optional: retain text rows when offline or unavailable. */ });
    return () => controller.abort();
  }, [facilityId]);
  return held?.facilityId === facilityId ? held.photos : undefined;
}
