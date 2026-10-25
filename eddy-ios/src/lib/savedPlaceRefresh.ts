import type { AccessPointDetailResponse, DamSnapshot, RiverService } from '@eddy/types';
import { createSavedPlacesStore, placeFromAccess, placeFromService, wholeRiverDam, type SavedPlace } from './savedPlaces';

export interface PlaceTransport {
  access(river: string, slug: string): Promise<AccessPointDetailResponse>;
  dams(): Promise<DamSnapshot[]>;
  dam(id: string): Promise<DamSnapshot>;
  service(id: string): Promise<RiverService>;
}
const MINUTE = 60_000;
const due = (stamp: string | null | undefined, interval: number, now: number) => {
  const at = stamp ? Date.parse(stamp) : NaN;
  return !Number.isFinite(at) || at > now || now - at >= interval;
};
export function placeRefreshNeeds(place: SavedPlace, now: number) {
  return {
    details: due(place.detailsDownloadedAt, 24 * 60 * MINUTE, now) || (!!place.gauge && due(place.gauge.downloadedAt, 15 * MINUTE, now)),
    dam: place.damChoice !== 'none' && (!!place.dam || place.damChoice !== 'auto') && due(place.dam?.downloadedAt, 15 * MINUTE, now),
    association: !!place.riverSlug && place.damChoice !== 'none' && due(place.damsCheckedAt, 24 * 60 * MINUTE, now),
  };
}
export function refreshedDam(previous: SavedPlace['dam'], snapshot: DamSnapshot, downloadedAt: string): NonNullable<SavedPlace['dam']> {
  const schedule = snapshot.schedule.length || previous?.snapshot.id !== snapshot.id
    ? snapshot.schedule : previous.snapshot.schedule;
  return { snapshot: { ...snapshot, schedule }, downloadedAt };
}
export function createSavedPlaceRefresher(store: ReturnType<typeof createSavedPlacesStore>, api: PlaceTransport, clock = () => new Date().toISOString()) {
  const requests = new Map<string, { previous: SavedPlace; promise: Promise<boolean> }>();
  return async (id: string, damId?: string, options?: { owner?: string; automatic?: boolean }): Promise<boolean> => {
    const initial = store.snapshot();
    const owner = options?.owner ?? initial.owner;
    if (owner !== initial.owner) return false;
    await store.load();
    if (store.snapshot().scopeToken !== initial.scopeToken) return false;
    if (damId) await store.linkDam(id, damId, owner);
    if (store.snapshot().scopeToken !== initial.scopeToken) return false;
    const previous = store.snapshot().places.find(p => p.id === id);
    if (!previous) return false;
    const key = `${initial.scopeToken}:${id}`;
    const pending = requests.get(key);
    if (pending?.previous === previous) return pending.promise;
    const request = { previous, promise: Promise.resolve(false) };
    request.promise = (async () => {
      let failed = false;
      const fail = () => { failed = true; return null; };
      const needs = options?.automatic ? placeRefreshNeeds(previous, Date.parse(clock())) : { details: !damId, dam: true, association: !damId };
      const match = previous.detailRoute?.match(/^\/river\/([^/]+)\/access\/([^/]+)$/);
      const serviceId = previous.id.startsWith('place:service:') ? previous.id.slice('place:service:'.length) : null;
      const selectedDam = previous.damChoice === 'none' ? null : previous.damChoice === 'auto' ? previous.dam?.snapshot.id : previous.damChoice;
      const indexPromise = needs.association && previous.riverSlug && previous.damChoice !== 'none' ? api.dams().catch(fail) : Promise.resolve(null);
      const [detail, dam, service, index] = await Promise.all([
        needs.details && match ? api.access(match[1], match[2]).catch(fail) : null,
        selectedDam && needs.dam ? api.dam(selectedDam).catch(fail) : !selectedDam && previous.damChoice === 'auto'
          ? indexPromise.then(async dams => { const associated = dams && wholeRiverDam(dams, previous.riverSlug); return associated ? api.dam(associated.id) : null; }).catch(fail) : null,
        needs.details && serviceId ? api.service(serviceId).catch(fail) : null,
        indexPromise,
      ]);
      if (requests.get(key) !== request || store.snapshot().scopeToken !== initial.scopeToken) return false;
      const now = clock();
      let next = detail ? placeFromAccess(detail, now, previous) : previous;
      if (service) next = placeFromService(service, next, now);
      if (index) next = { ...next, relatedDamIds: index.filter(d => d.tailwater?.riverSlug === previous.riverSlug).map(d => d.id), damsCheckedAt: now };
      if (dam) next = { ...next, dam: refreshedDam(previous.dam, dam, now) };
      if (next !== previous) await store.replace(previous, next, owner);
      return !failed;
    })().finally(() => { if (requests.get(key) === request) requests.delete(key); });
    requests.set(key, request);
    return request.promise;
  };
}

/** One foreground batch, at most four places and two workers; no background timer. */
export function createPlaceAutoRefresh(store: ReturnType<typeof createSavedPlacesStore>, refresh: ReturnType<typeof createSavedPlaceRefresher>, clock = Date.now) {
  const attempts = new Map<string, { at: number; failures: number }>();
  let running: Promise<void> | null = null;
  return (canRun: () => boolean) => {
    if (running) return running;
    const { owner, scopeToken, ready, places } = store.snapshot();
    if (!ready || !canRun()) return Promise.resolve();
    const now = clock();
    const eligible = places.filter(place => {
      const attempt = attempts.get(`${owner}:${place.id}`);
      const wait = attempt?.failures ? Math.min(30 * MINUTE, MINUTE * 2 ** (attempt.failures - 1)) : 15 * MINUTE;
      return (!attempt || now - attempt.at >= wait) && Object.values(placeRefreshNeeds(place, now)).some(Boolean);
    }).sort((a, b) => Number(!!a.detailsDownloadedAt) - Number(!!b.detailsDownloadedAt)
      || (attempts.get(`${owner}:${a.id}`)?.at ?? 0) - (attempts.get(`${owner}:${b.id}`)?.at ?? 0)).slice(0, 4);
    running = (async () => {
      let index = 0;
      const worker = async () => {
        while (index < eligible.length && canRun() && store.snapshot().scopeToken === scopeToken) {
          const place = eligible[index++]; const key = `${owner}:${place.id}`;
          const failures = attempts.get(key)?.failures ?? 0;
          attempts.set(key, { at: now, failures });
          const ok = await refresh(place.id, undefined, { owner, automatic: true }).catch(() => false);
          attempts.set(key, { at: clock(), failures: ok ? 0 : failures + 1 });
        }
      };
      await Promise.all([worker(), worker()]);
      // Bound metadata during a long session with many account changes.
      if (attempts.size > 500) for (const key of [...attempts.keys()].slice(0, attempts.size - 500)) attempts.delete(key);
    })().finally(() => { running = null; });
    return running;
  };
}
