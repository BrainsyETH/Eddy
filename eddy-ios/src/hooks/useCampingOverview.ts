import { useCallback, useEffect, useState } from 'react';
import type { CampingOverview } from '@eddy/types';
import { fetchCampingOverview } from '@/api/client';
import { onForeground } from '@/lib/foreground';
import { campingDate, currentOverview } from '@/lib/campingHeatmap';

// Shared, public memory cache. No location, account, or individual sites stored here.
let cached: CampingOverview | null = null;
let fetchedAt = 0;
let inFlight: Promise<CampingOverview> | null = null;
function request(): Promise<CampingOverview> {
  if (!inFlight)
    inFlight = fetchCampingOverview()
      .then((data) => {
        cached = data;
        fetchedAt = Date.now();
        return data;
      })
      .finally(() => {
        inFlight = null;
      });
  return inFlight;
}
export function useCampingOverview(enabled = true, revision = 0) {
  const [data, setData] = useState(cached);
  const [loading, setLoading] = useState(enabled && !cached);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [now, setNow] = useState(Date.now);
  const refresh = useCallback(() => setRetry((n) => n + 1), []);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    async function load(force = false) {
      if (
        !force &&
        cached &&
        Date.now() - fetchedAt < 300000 &&
        cached.horizon.startDate === campingDate()
      ) {
        if (active) {
          setData(cached);
          setLoading(false);
        }
        return;
      }
      if (active) setLoading(true);
      try {
        const next = await request();
        if (active) {
          setData(next);
          setError(false);
        }
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load(revision > 0 || retry > 0);
    const off = onForeground(() => {
      setNow(Date.now());
      void load();
    });
    // Aging and midnight rollover only; this does not poll the provider or API.
    const timer = setInterval(() => {
      setNow(Date.now());
      if (cached && cached.horizon.startDate !== campingDate()) void load();
    }, 60000);
    return () => {
      active = false;
      off();
      clearInterval(timer);
    };
  }, [enabled, revision, retry]);
  return {
    data: data ? currentOverview(data, now) : null,
    loading,
    error,
    refresh,
    now,
  };
}
