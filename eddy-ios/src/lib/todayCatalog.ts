import type { MapGauge, RiverListItem } from '@eddy/types';
import { agedIndex, envelope, observationAgeHours } from './offline-cache';

export interface TodayCatalogSnapshot {
  rivers: RiverListItem[] | null;
  gauges: MapGauge[] | null;
  error: string | null;
  gaugeError: string | null;
  awaitingConditions: boolean;
}

interface Dependencies {
  loadRivers: () => Promise<RiverListItem[]>;
  loadGauges: () => Promise<MapGauge[]>;
  /** The adapter ages stored conditions before returning them. */
  readCache: () => Promise<{ rivers: RiverListItem[]; seeded: boolean } | null>;
  describeError: (error: unknown) => string;
  now?: () => number;
}

/** Process-only public data shared by Today and its child routes. Route-local
 * searches, filters and scroll positions never enter this store.
 */
export function createTodayCatalog(deps: Dependencies) {
  const now = deps.now ?? Date.now;
  let snapshot: TodayCatalogSnapshot = { rivers: null, gauges: null, error: null, gaugeError: null, awaitingConditions: false };
  let loadedAt: number | null = null;
  let gaugesLoadedAt: number | null = null;
  let riverBaseline: { rivers: RiverListItem[]; at: number } | null = null;
  let gaugeBaseline: { gauges: MapGauge[]; at: number } | null = null;
  let riverRequest: Promise<void> | null = null;
  let gaugeRequest: Promise<MapGauge[]> | null = null;
  const listeners = new Set<() => void>();
  function update(next: Partial<TodayCatalogSnapshot>) {
    snapshot = { ...snapshot, ...next };
    for (const listener of listeners) listener();
  }

  // Always derive from the received snapshot, not the previous render's ages.
  function age() {
    const time = now();
    const next: Partial<TodayCatalogSnapshot> = {};
    if (riverBaseline?.rivers.some((river) => river.currentCondition)) {
      next.rivers = agedIndex(envelope(riverBaseline.rivers, new Date(riverBaseline.at).toISOString()), time);
    }
    if (gaugeBaseline) {
      const receivedAt = new Date(gaugeBaseline.at).toISOString();
      next.gauges = gaugeBaseline.gauges.map((gauge) => ({
        ...gauge,
        readingAgeHours: observationAgeHours(gauge.readingTimestamp, gauge.readingAgeHours, receivedAt, time),
      }));
    }
    if (Object.keys(next).length) update(next);
  }

  async function fetchRivers() {
    // Start the network first, paint disk/seed data into an empty screen, then
    // await the settled request. A cache read must not hide a rejection.
    const network = deps.loadRivers().then(
      (rivers) => ({ rivers, error: null }),
      (error: unknown) => ({ rivers: null, error }),
    );
    const cached = await deps.readCache().catch(() => null);
    if (snapshot.rivers === null && cached && cached.rivers.length > 0) {
      riverBaseline = { rivers: cached.rivers, at: now() };
      update({ rivers: cached.rivers, awaitingConditions: cached.seeded });
    }
    const result = await network;
    if (result.rivers !== null) {
      loadedAt = now();
      riverBaseline = { rivers: result.rivers, at: loadedAt };
      update({ rivers: result.rivers, error: null, awaitingConditions: false });
    } else {
      age();
      // Retain any live list during a failed refresh. Never roll it back to
      // the older disk copy, and never spend the freshness TTL on a failure.
      update({
        awaitingConditions: false,
        error: snapshot.rivers?.length
          ? loadedAt === null && cached?.seeded
            ? 'Offline — Eddy has the rivers but not today’s water. Pull down to retry.'
            : 'Offline — showing the last conditions Eddy saw. Pull down to retry.'
          : deps.describeError(result.error),
      });
    }
  }

  function load(force = false): Promise<void> {
    if (riverRequest) return riverRequest;
    // Match the river endpoint's five-minute freshness window. A child push
    // can immediately read its parent's snapshot without another request.
    if (!force && loadedAt !== null && now() - loadedAt < 300_000) return Promise.resolve();
    riverRequest = fetchRivers().finally(() => { riverRequest = null; });
    return riverRequest;
  }

  function ensureGauges(force = false): Promise<MapGauge[]> {
    if (gaugeRequest) return gaugeRequest;
    if (!force && snapshot.gauges !== null && gaugesLoadedAt !== null && now() - gaugesLoadedAt < 300_000) {
      return Promise.resolve(snapshot.gauges);
    }
    gaugeRequest = deps.loadGauges()
      .then((gauges) => {
        gaugesLoadedAt = now();
        gaugeBaseline = { gauges, at: gaugesLoadedAt };
        update({ gauges, gaugeError: null });
        return gauges;
      })
      .catch(() => {
        age();
        update({ gaugeError: snapshot.gauges?.length
          ? 'Couldn’t refresh gauges — showing last readings. Pull down to retry.'
          : 'Couldn’t load gauges. Pull down to retry.' });
        return snapshot.gauges ?? [];
      })
      .finally(() => { gaugeRequest = null; });
    return gaugeRequest;
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    load,
    ensureGauges,
    age,
  };
}
