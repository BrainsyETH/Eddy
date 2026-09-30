import type { MapGauge, RiverListItem } from '@eddy/types';

export interface TodayCatalogSnapshot {
  rivers: RiverListItem[] | null;
  gauges: MapGauge[] | null;
  error: string | null;
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
  let snapshot: TodayCatalogSnapshot = { rivers: null, gauges: null, error: null, awaitingConditions: false };
  let loadedAt: number | null = null;
  let riverRequest: Promise<void> | null = null;
  let gaugeRequest: Promise<MapGauge[]> | null = null;
  const listeners = new Set<() => void>();
  function update(next: Partial<TodayCatalogSnapshot>) {
    snapshot = { ...snapshot, ...next };
    for (const listener of listeners) listener();
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
      update({ rivers: cached.rivers, awaitingConditions: cached.seeded });
    }
    const result = await network;
    if (result.rivers !== null) {
      loadedAt = now();
      update({ rivers: result.rivers, error: null, awaitingConditions: false });
    } else {
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

  function ensureGauges(): Promise<MapGauge[]> {
    if (gaugeRequest) return gaugeRequest;
    if (snapshot.gauges !== null) return Promise.resolve(snapshot.gauges);
    gaugeRequest = deps.loadGauges()
      .then((gauges) => { update({ gauges }); return gauges; })
      // Enrichment is optional; failure must remain retryable on the next visit.
      .catch(() => [] as MapGauge[])
      .finally(() => { gaugeRequest = null; });
    return gaugeRequest;
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    load,
    ensureGauges,
  };
}
