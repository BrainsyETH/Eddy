import { mergeCampingSnapshots } from '@/lib/mergeCampingSnapshots';
import { loadCampingWindow } from '@/lib/loadCampingWindow';
import { createCampingRollover } from '@/lib/campingRollover';
import { parseCampingSnapshot } from '@/lib/campingSnapshot';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CampingOverview } from '@eddy/types';
import { fetchCampingOverview } from '@/api/client';
import { onForeground } from '@/lib/foreground';
import { campingDate, currentOverview } from '@/lib/campingHeatmap';

// Shared, public memory cache. No location, account, or individual sites stored here.
type WindowSize = 21 | 90;
type Entry = {
  cached: CampingOverview | null;
  fetchedAt: number;
  inFlight: Promise<CampingOverview> | null;
};
const windows: Record<WindowSize, Entry> = {
  21: { cached: null, fetchedAt: 0, inFlight: null },
  90: { cached: null, fetchedAt: 0, inFlight: null },
};
function request(nights: WindowSize): Promise<CampingOverview> {
  const entry = windows[nights];
  if (!entry.inFlight)
    entry.inFlight = fetchCampingOverview(undefined, nights)
      .then((data) => {
        entry.cached = data;
        entry.fetchedAt = Date.now();
        void AsyncStorage.setItem(`eddy:camping:v1:${nights}`, JSON.stringify(data)).catch(() => {});
        return data;
      })
      .finally(() => {
        entry.inFlight = null;
      });
  return entry.inFlight;
}
export function useCampingOverview(
  enabled = true,
  revision = 0,
  nights: WindowSize = 90,
) {
  const entry = windows[nights];
  // Today already holds the short window. Use it on the very first render,
  // instead of flashing an empty screen until this hook's effect publishes it.
  const initial = entry.cached ?? (nights === 90 ? windows[21].cached : null);
  const [held, setHeld] = useState({ nights, data: initial });
  const data = held.nights === nights ? held.data : initial;
  const [loading, setLoading] = useState(enabled && !entry.cached);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [now, setNow] = useState(Date.now);
  const refresh = useCallback(() => setRetry((n) => n + 1), []);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const dayChanged = createCampingRollover(campingDate());
    async function load(force = false) {
      if (
        !force &&
        entry.cached &&
        Date.now() - entry.fetchedAt < 300000 &&
        entry.cached.horizon.startDate === campingDate()
      ) {
        if (active) {
          setHeld({ nights, data: entry.cached });
          setLoading(false);
        }
        return;
      }
      if (active) setLoading(true);
      try {
        await loadCampingWindow({
          nights,
          hasFullSnapshot: () => !!entry.cached,
          fetchWindow: (window) => {
            const cached = windows[window];
            return !force && cached.cached && Date.now() - cached.fetchedAt < 300000 &&
              cached.cached.horizon.startDate === campingDate()
              ? Promise.resolve(cached.cached) : request(window);
          },
          publish: (next) => {
            if (!active) return;
            setHeld((current) => ({ nights, data: mergeCampingSnapshots(current.nights === nights ? current.data : null, next) }));
            setError(false);
          },
        });
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    }
    // Disk and network can arrive in either order. Saved dates extend a fresh
    // short window without replacing newer observations or their checkedAt.
    if (!entry.cached) {
      void Promise.all([
        AsyncStorage.getItem(`eddy:camping:v1:${nights}`),
        nights === 90 ? AsyncStorage.getItem('eddy:camping:v1:21') : Promise.resolve(null),
      ]).then(([full, partial]) => {
        if (!active || entry.cached) return;
        const savedFull = full ? parseCampingSnapshot(full, nights) : null;
        const savedPartial = partial ? parseCampingSnapshot(partial, 21) : null;
        const saved = savedFull ?? savedPartial;
        if (!saved) return;
        if (savedFull) entry.cached = savedFull;
        else if (!windows[21].cached) windows[21].cached = savedPartial;
        setHeld((current) => ({ nights, data: mergeCampingSnapshots(current.nights === nights ? current.data : null, saved) }));
      }).catch(() => {});
    }
    void load(revision > 0 || retry > 0);
    const off = onForeground(() => {
      dayChanged(campingDate());
      setNow(Date.now());
      void load();
    });
    // Age every minute, but refresh only once per observed calendar-day change.
    // An old disk snapshot or failed refresh must not become a polling loop.
    const timer = setInterval(() => {
      setNow(Date.now());
      if (dayChanged(campingDate())) void load();
    }, 60000);
    return () => {
      active = false;
      off();
      clearInterval(timer);
    };
  }, [enabled, revision, retry, nights, entry]);
  const current = useMemo(() => data ? currentOverview(data, now) : null, [data, now]);
  return {
    data: current,
    loading,
    extending: nights === 90 && !!data && data.horizon.nights.length < 90 && loading,
    error,
    refresh,
    now,
  };
}
