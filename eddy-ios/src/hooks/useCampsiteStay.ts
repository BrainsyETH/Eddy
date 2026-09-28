import { useEffect, useState } from 'react';
import type { CampsiteSitesResponse } from '@eddy/types';
import { fetchCampsiteSites } from '@/api/client';
import { stayNights, type CampingStay } from '@/lib/campingStay';

const cache = new Map<
  string,
  { at: number; data: CampsiteSitesResponse | null }
>();
/** Fetch every occupied month; never hold a previous stay's answer under a new stay. */
export function useCampsiteStay(facilityId: string, stay: CampingStay) {
  const months = [...new Set(stayNights(stay).map((d) => d.slice(0, 7)))].join(
    ',',
  );
  const key = `${facilityId}:${months}`;
  const [retry, setRetry] = useState(0);
  const [held, setHeld] = useState<{
    key: string;
    responses: CampsiteSitesResponse[];
    failed: boolean;
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all(
      months
        .split(',')
        .filter(Boolean)
        .map(async (month) => {
          const cacheKey = `${facilityId}:${month}`;
          const hit = cache.get(cacheKey);
          if (hit && Date.now() - hit.at < 300000) return hit.data;
          const data = await fetchCampsiteSites(
            facilityId,
            controller.signal,
            month,
          );
          if (!controller.signal.aborted) {
            cache.set(cacheKey, { at: Date.now(), data });
            if (cache.size > 12) cache.delete(cache.keys().next().value!);
          }
          return data;
        }),
    )
      .then((responses) => {
        if (!controller.signal.aborted)
          setHeld({
            key,
            responses: responses.filter(
              (r): r is CampsiteSitesResponse => r !== null,
            ),
            failed: false,
          });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setHeld({ key, responses: [], failed: true });
      });
    return () => controller.abort();
  }, [facilityId, months, key, retry]);
  const current = held?.key === key ? held : null;
  return {
    responses: current?.responses ?? [],
    loading: !current,
    failed: current?.failed ?? false,
    refresh: () => {
      setHeld(null);
      setRetry((n) => n + 1);
    },
  };
}
