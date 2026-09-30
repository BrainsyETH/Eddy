import { useEffect, useSyncExternalStore } from 'react';
import { ApiError } from '@/api/client';
import { takePreloadedToday } from '@/lib/firstRunPreload';
import { onForeground } from '@/lib/foreground';
import { agedIndex, readBestIndex } from '@/lib/riverCache';
import { createTodayCatalog } from '@/lib/todayCatalog';

const catalog = createTodayCatalog({
  loadRivers: () => takePreloadedToday('rivers'),
  loadGauges: () => takePreloadedToday('gauges'),
  readCache: async () => {
    const cached = await readBestIndex();
    if (!cached) return null;
    return { rivers: cached.seeded ? cached.payload : agedIndex(cached, Date.now()), seeded: cached.seeded };
  },
  describeError: (error) => error instanceof ApiError ? error.message : 'Couldn’t load rivers. Pull down to refresh.',
});

export function useTodayCatalog() {
  const snapshot = useSyncExternalStore(catalog.subscribe, catalog.getSnapshot, catalog.getSnapshot);
  useEffect(() => {
    void catalog.load();
    // All mounted routes share the freshness check and in-flight request.
    // Unmounting one route must not cancel another route's public-data load.
    return onForeground(() => { void catalog.load(); });
  }, []);
  return { ...snapshot, load: catalog.load, ensureGauges: catalog.ensureGauges };
}
