import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useFocusEffect } from 'expo-router';
import { useObservationClock } from '@/hooks/useObservationClock';
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
  // Never the transport message ("Request failed (503)", "No connection"):
  // a floater needs to know what to do, not which request failed.
  describeError: () => 'Couldn’t load rivers. Pull down to try again.',
});

export function useTodayCatalog() {
  const now = useObservationClock();
  const snapshot = useSyncExternalStore(catalog.subscribe, catalog.getSnapshot, catalog.getSnapshot);
  useEffect(() => { catalog.age(); }, [now]);
  useFocusEffect(useCallback(() => {
    const refresh = () => {
      catalog.age();
      void catalog.load();
      if (catalog.getSnapshot().gauges !== null || catalog.getSnapshot().gaugeError !== null) void catalog.ensureGauges();
    };
    refresh();
    // All mounted routes share the freshness check and in-flight request.
    // Unmounting one route must not cancel another route's public-data load.
    return onForeground(refresh);
  }, []));
  return { ...snapshot, now, load: catalog.load, ensureGauges: catalog.ensureGauges };
}
