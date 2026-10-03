import { createCampingRollover } from '@/lib/campingRollover';
import { parseCampingSnapshot } from '@/lib/campingSnapshot';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
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
  const [held, setHeld] = useState({ nights, data: entry.cached });
  const data = held.nights === nights ? held.data : entry.cached;
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
        const next = await request(nights);
        if (active) {
          setHeld({ nights, data: next });
          setError(false);
        }
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    }
    // Disk and network race independently; an old disk read never overwrites
    // a fresh network result. Stored observations retain their checkedAt.
    if (!entry.cached) {
      void AsyncStorage.getItem(`eddy:camping:v1:${nights}`).then((raw) => {
        if (!active || entry.cached || !raw) return;
        const saved = parseCampingSnapshot(raw, nights);
        if (!saved) return;
        entry.cached = saved;
        setHeld({ nights, data: saved });
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
  return {
    data: data ? currentOverview(data, now) : null,
    loading,
    error,
    refresh,
    now,
  };
}
