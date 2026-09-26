import { fetchRivers, fetchGauges, fetchFavoriteFloats, fetchHighWater, fetchRiverAlerts } from '@/api/client';
import { getSharedDams } from '@/hooks/useDams';
import { preloadEddyUpdates } from '@/hooks/useEddyUpdates';
import { createPreloadHandoff } from './preloadHandoff';

const handoff = createPreloadHandoff();
const loaders = {
  rivers: fetchRivers,
  gauges: fetchGauges,
  floats: fetchFavoriteFloats,
  highWater: fetchHighWater,
  notices: (signal?: AbortSignal) => fetchRiverAlerts(undefined, signal),
};
type Key = keyof typeof loaders;
type Data<K extends Key> = Awaited<ReturnType<(typeof loaders)[K]>>;

/** Public data only. No permissions, account fetches, or blocking completion. */
export function preloadTodayData(): void {
  for (const key of Object.keys(loaders) as Key[]) {
    void handoff.warm<unknown>(key, () => loaders[key]()).catch(() => {});
  }
  void getSharedDams().catch(() => {});
  preloadEddyUpdates();
}

/** Picker may read the river catalog without spending Today's handoff. */
export function firstRunRivers() {
  return handoff.warm('rivers', () => fetchRivers());
}

/** Nearby lookup shares the preload without consuming Today's copy. */
export function firstRunGauges() {
  return handoff.warm('gauges', () => fetchGauges());
}

/** Refresh always bypasses the handoff; cancellation stays local to the caller. */
export function takePreloadedToday<K extends Key>(key: K, signal?: AbortSignal): Promise<Data<K>> {
  if (signal?.aborted) return Promise.reject(Object.assign(new Error('Request cancelled'), { name: 'AbortError' }));
  return (handoff.take<Data<K>>(key) ?? loaders[key](signal)) as Promise<Data<K>>;
}

export function clearFirstRunPreload(): void { handoff.clear(); }
