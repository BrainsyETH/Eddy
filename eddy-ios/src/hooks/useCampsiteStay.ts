import { useEffect, useState } from 'react';
import type {
  CampingStayResult,
  CampingStay,
} from '@eddy/conditions/camping-stay';
import { fetchCampingStay } from '@/api/client';

const cache = new Map<string, { at: number; data: CampingStayResult | null }>();
/** Never hold a previous date range's answer under a new stay. */
export function useCampsiteStay(facilityId: string, stay: CampingStay) {
  const { arrival, departure } = stay;
  const key = `${facilityId}:${arrival}:${departure}`;
  const [retry, setRetry] = useState(0);
  const [held, setHeld] = useState<{
    key: string;
    result: CampingStayResult | null;
    failed: boolean;
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const hit = cache.get(key);
      const cached = hit && Date.now() - hit.at < 300000;
      const data = cached
        ? hit.data
        : await fetchCampingStay(
            facilityId,
            arrival,
            departure,
            controller.signal,
          );
      if (controller.signal.aborted) return;
      if (!cached) {
        cache.set(key, { at: Date.now(), data });
        if (cache.size > 12) cache.delete(cache.keys().next().value!);
      }
      setHeld({ key, result: data, failed: false });
    }
    void load().catch(() => {
      if (!controller.signal.aborted)
        setHeld({ key, result: null, failed: true });
    });
    return () => controller.abort();
  }, [facilityId, arrival, departure, key, retry]);
  const current = held?.key === key ? held : null;
  return {
    result: current?.result ?? null,
    loading: !current,
    failed: current?.failed ?? false,
    refresh: () => {
      cache.delete(key);
      setHeld(null);
      setRetry((n) => n + 1);
    },
  };
}
