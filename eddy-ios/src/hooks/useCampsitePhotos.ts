import { queueCampsitePhoto } from '@/lib/campsitePhotoQueue';
import { useEffect, useState } from 'react';
import type { CampsitePhotosResponse } from '@eddy/types';
import { fetchCampsitePhotos } from '@/api/client';

/** Gate on the active camping tab. Hold each response with its facility. */
export function useCampsitePhotos(facilityId: string | null, siteId?: string) {
  const [held, setHeld] = useState<(CampsitePhotosResponse & { siteId?: string }) | null>(null);
  useEffect(() => {
    if (!facilityId) return;
    const controller = new AbortController();
    const load = () => fetchCampsitePhotos(facilityId, controller.signal, siteId);
    const request = siteId ? queueCampsitePhoto(load, controller.signal) : load();
    void request.then((response) => {
      if (!controller.signal.aborted && response.facilityId === facilityId) setHeld({ ...response, siteId });
    }).catch(() => { /* Optional: retain text rows when offline or unavailable. */ });
    return () => controller.abort();
  }, [facilityId, siteId]);
  return held?.facilityId === facilityId && held?.siteId === siteId ? held.photos : undefined;
}
