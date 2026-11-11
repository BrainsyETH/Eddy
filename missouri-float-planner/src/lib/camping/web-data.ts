import { createClient } from '@supabase/supabase-js';
import { loadCampingOverview } from './overview';
import { loadWebStaySnapshots } from './web-inventory';
import { toWireStay } from './sites';
import { searchCampingStay } from './stay';
import { compactStay, shippingFilters, type RegionalStay } from './web-search';
import { stayNights } from '../../../shared/camping-stay';
import type { CampingOverview } from './overview-types';

export { campingWebEnabled } from './web-launch';
/** Public RLS reads only. The abort covers every page and metadata request. */
function publicDb(signal: AbortSignal) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Camping database is not configured');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, cache: 'no-store', signal }),
    },
  });
}
// Bounded per-instance memo; no stale-on-error answers. CDN is deliberately bypassed
// on the stay endpoint so the limiter also sees cache hits. Key: version + dates.
const cache = new Map<
  string,
  { until: number; promise: Promise<RegionalStay> }
>();
export function regionalStay(
  arrival: string,
  departure: string,
): Promise<RegionalStay> {
  const key = `v1:${arrival}:${departure}`,
    now = Date.now();
  for (const [k, value] of cache) if (value.until <= now) cache.delete(k);
  const existing = cache.get(key);
  if (existing) return existing.promise;
  if (cache.size >= 100) cache.delete(cache.keys().next().value!);
  const promise = readRegionalStay(arrival, departure).catch((error) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, { until: now + 60_000, promise });
  return promise;
}
export async function readRegionalStay(
  arrival: string,
  departure: string,
): Promise<RegionalStay> {
  const { facilities, snapshots, now } = await readWebSnapshots(arrival, departure);
  const summaries = facilities.map((f) => compactStay(
    searchCampingStay(snapshots.get(f.id)!, arrival, departure, now), f.source,
  ));
  return {
    arrival, departure, generatedAt: now.toISOString(),
    facilities: summaries, filters: shippingFilters(summaries),
  };
}

/** The new hub's detail path never changes the existing /api/campsites reader. */
export async function readWebFacilityStay(facilityId: string, arrival: string, departure: string) {
  const { snapshots, now } = await readWebSnapshots(arrival, departure, facilityId);
  const snapshot = snapshots.get(facilityId);
  return snapshot ? toWireStay(searchCampingStay(snapshot, arrival, departure, now)) : null;
}

async function readWebSnapshots(arrival: string, departure: string, facilityId?: string) {
  const signal = AbortSignal.timeout(5000),
    db = publicDb(signal),
    now = new Date();
  const nights = stayNights({ arrival, departure });
  let query = db
    .from('campsite_facilities')
    .select('id,source,source_facility_id,source_loop')
    .eq('enabled', true)
    .eq('kind', 'campground')
    .limit(201);
  if (facilityId) query = query.eq('id', facilityId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  if ((data?.length ?? 0) > 200)
    throw new Error('Camping facility read exceeds budget');
  const facilities = (data ?? []).filter(
      (f) =>
        f.source_loop ||
        !(data ?? []).some(
          (other) =>
            other.source === f.source &&
            other.source_facility_id === f.source_facility_id &&
            other.source_loop,
        ),
    ),
    ids = facilities.map((f) => f.id as string);
  const observations: {
    facilityId: string;
    date: string;
    fetchedAt: string;
  }[] = [];
  for (let offset = 0; ids.length; offset += 900) {
    const { data: rows, error: err } = await db
      .from('campsite_availability')
      .select('facility_id,date,fetched_at')
      .in('facility_id', ids)
      .in('date', nights)
      .order('facility_id')
      .order('date')
      .range(offset, offset + 899);
    if (err) throw new Error(err.message);
    observations.push(
      ...(rows ?? []).map((r) => ({
        facilityId: r.facility_id,
        date: r.date,
        fetchedAt: r.fetched_at,
      })),
    );
    if ((rows?.length ?? 0) < 900) break;
    if (offset + 900 > ids.length * nights.length)
      throw new Error('Camping observation read exceeds budget');
  }
  const snapshots = await loadWebStaySnapshots(
    db,
    observations,
    { startDate: arrival, endDate: departure, label: '', nights },
    now,
    { facilityIds: ids, signal, maxSites: 5000,
      sources: new Map(facilities.map((f) => [f.id, f.source])),
      sourceFacilityIds: new Map(facilities.map((f) => [f.id, f.source_facility_id])),
    },
  );
  return { facilities, snapshots, now };
}
let overview: { until: number; promise: Promise<CampingOverview> } | undefined;
export function webCampingOverview() {
  if (overview && overview.until > Date.now()) return overview.promise;
  const promise = loadCampingOverview(
    publicDb(AbortSignal.timeout(5000)),
    new Date(),
    90,
  ).catch((error) => {
    overview = undefined;
    throw error;
  });
  overview = { until: Date.now() + 60_000, promise };
  return promise;
}
