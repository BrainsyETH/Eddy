'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { normalizeRain, RAIN_PREFERENCE_KEY } from '@shared/rainfall';
import { normalizeRainDetail } from '@shared/rainfall-map';

export function useRainfall(siteId: string | null, enabled = true) {
  return useQuery({ queryKey: ['rainfall', siteId], enabled: !!siteId && enabled,
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/gauges/${siteId}/rainfall`, { signal });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error('Rain data unavailable');
      return normalizeRain(await response.json(), siteId!);
    }, staleTime: 5 * 60_000, refetchInterval: 5 * 60_000, retry: 1 });
}
export function useRainDetail(siteId: string, open: boolean) {
  return useQuery({ queryKey: ['rainfall-detail', siteId], enabled: open,
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/gauges/${siteId}/rainfall?detail=1`, { signal });
      if (!response.ok) throw new Error('Rain data unavailable');
      const data = normalizeRainDetail(await response.json(), siteId);
      if (!data) throw new Error('Rain data unavailable');
      return data;
    }, staleTime: 5 * 60_000, retry: 1 });
}
export function useRainPreference() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    try { setOn(localStorage.getItem(RAIN_PREFERENCE_KEY) !== 'off'); } catch { /* private browsing */ }
  }, []);
  return [on, (value: boolean) => {
    setOn(value);
    try { localStorage.setItem(RAIN_PREFERENCE_KEY, value ? 'on' : 'off'); } catch { /* preference is optional */ }
  }] as const;
}
