import type { AccessPointDetailResponse, DamSnapshot, RiverService } from '@eddy/types';
import { createSavedPlacesStore, placeFromAccess, placeFromService, wholeRiverDam, type SavedPlace } from './savedPlaces';

interface Transport {
  access(river: string, slug: string): Promise<AccessPointDetailResponse>;
  dams(): Promise<DamSnapshot[]>;
  dam(id: string): Promise<DamSnapshot>;
  service(id: string): Promise<RiverService>;
}
export function refreshedDam(previous: SavedPlace['dam'], snapshot: DamSnapshot, downloadedAt: string): NonNullable<SavedPlace['dam']> {
  // An unavailable schedule does not erase the last downloaded one. Its own
  // scheduleDate/retrievedAt stay unchanged and the UI marks historical days.
  const schedule = snapshot.schedule.length || previous?.snapshot.id !== snapshot.id
    ? snapshot.schedule : previous.snapshot.schedule;
  return { snapshot: { ...snapshot, schedule }, downloadedAt };
}
export function createSavedPlaceRefresher(store: ReturnType<typeof createSavedPlacesStore>, api: Transport, clock = () => new Date().toISOString()) {
  const requests = new Map<string, { previous: SavedPlace; damId?: string; promise: Promise<boolean> }>();
  return async (id: string, damId?: string): Promise<boolean> => {
    await store.load();
    const previous = store.snapshot().places.find(p => p.id === id);
    if (!previous) return false;
    const pending = requests.get(id);
    if (pending?.previous === previous && pending.damId === damId) return pending.promise;
    const request = { previous, damId, promise: Promise.resolve(false) };
    request.promise = (async () => {
      let failed = false;
      const fail = () => { failed = true; return null; };
      const match = previous.detailRoute?.match(/^\/river\/([^/]+)\/access\/([^/]+)$/);
      const serviceId = previous.id.startsWith('place:service:') ? previous.id.slice('place:service:'.length) : null;
      const [detail, dam, service] = await Promise.all([
        match ? api.access(match[1], match[2]).catch(fail) : null,
        damId || previous.dam ? api.dam(damId ?? previous.dam!.snapshot.id).catch(fail)
          : previous.riverSlug ? api.dams().then(async dams => {
            const associated = wholeRiverDam(dams, previous.riverSlug);
            // The index omits the multi-day schedule: download the detail too.
            return associated ? api.dam(associated.id) : null;
          }).catch(fail) : null,
        serviceId ? api.service(serviceId).catch(fail) : null,
      ]);
      if (requests.get(id) !== request) return false; // A newer explicit dam choice wins.
      const now = clock();
      let next = detail ? placeFromAccess(detail, now, previous) : previous;
      if (service) next = placeFromService(service, next, now);
      if (dam) next = { ...next, dam: refreshedDam(previous.dam, dam, now) };
      if (next !== previous) await store.replace(previous, next);
      return !failed;
    })().finally(() => { if (requests.get(id) === request) requests.delete(id); });
    requests.set(id, request);
    return request.promise;
  };
}
