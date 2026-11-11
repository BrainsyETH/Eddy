// New web Camping reads only. Existing iOS/services availability loaders stay unchanged.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CampingWindow } from './window';
import type { CampsiteSitesResult } from './sites';
import { SITE_NIGHT_CODE } from './sites';
import type { UnitStatus } from './types';
import { MAX_AGE_MS } from './freshness';
import { campsitePolicy } from './policies';

export interface StayObservation {
  facilityId: string;
  date: string;
  fetchedAt: string;
}
/** Batch all cards: one ordered, paged site-night read, not one request per card. */
export async function loadWebStaySnapshots(
  db: SupabaseClient,
  observations: StayObservation[],
  window: CampingWindow,
  now: Date,
  options: {
    facilityIds?: string[];
    signal?: AbortSignal;
    maxSites?: number;
    sources?: Map<string, string>;
    sourceFacilityIds?: Map<string, string>;
  } = {},
) {
  const ids = options.facilityIds ?? [
    ...new Set(observations.map((o) => o.facilityId)),
  ];
  if (!ids.length) return new Map<string, CampsiteSitesResult>();
  const observed = new Map(
    observations.map((o) => [
      `${o.facilityId}|${o.date}`,
      Date.parse(o.fetchedAt),
    ]),
  );
  const snapshots = new Map<string, CampsiteSitesResult>();
  const sites = new Map<
    string,
    Map<string, { site: CampsiteSitesResult['sites'][number]; codes: string[] }>
  >();
  const catalogRows = await loadSiteCatalog(db, ids, options);
  for (const id of ids) {
    snapshots.set(id, {
      facility: { id, displayName: '', kind: '', source: '' },
      window,
      fetchedAt: null,
      sites: [],
    });
    sites.set(id, new Map());
  }
  for (const row of catalogRows) {
    sites.get(row.facility_id)?.set(row.id, {
      site: {
        id: row.id,
        name: row.name,
        loop: row.loop,
        siteType: row.site_type,
        maxOccupancy: row.max_occupancy,
        bookingUrl: options.sources?.get(row.facility_id) === 'recreation_gov' && row.source_site_id
          ? `https://www.recreation.gov/camping/campsites/${encodeURIComponent(row.source_site_id)}`
          : null,
        nights: '',
        policy: campsitePolicy(options.sources?.get(row.facility_id) ?? '', options.sourceFacilityIds?.get(row.facility_id), row),
      },
      codes: window.nights.map(() => '-'),
    });
  }
  const pageSize = 900;
  for (let offset = 0; ; offset += pageSize) {
    options.signal?.throwIfAborted();
    let query = db
      .from('campsite_site_availability')
      .select(
        'site_id,date,status,fetched_at,campsite_sites!inner(facility_id)',
      )
      .in('campsite_sites.facility_id', ids)
      .in('date', window.nights)
      .order('site_id')
      .order('date')
      .range(offset, offset + pageSize - 1);
    if (options.signal) query = query.abortSignal(options.signal);
    const { data, error } = await query;
    if (error) throw new Error(`camping stay summaries: ${error.message}`);
    const rows = (data ?? []) as unknown as {
      site_id: string;
      date: string;
      status: UnitStatus;
      fetched_at: string;
      campsite_sites: { facility_id: string };
    }[];
    for (const row of rows) {
      const facilityId = row.campsite_sites.facility_id;
      const age = now.getTime() - Date.parse(row.fetched_at);
      const position = window.nights.indexOf(row.date);
      if (
        position < 0 ||
        !Number.isFinite(age) ||
        age < 0 ||
        age >= MAX_AGE_MS ||
        observed.get(`${facilityId}|${row.date}`) !== Date.parse(row.fetched_at)
      )
        continue;
      const snapshot = snapshots.get(facilityId);
      const entry = sites.get(facilityId)?.get(row.site_id);
      if (!snapshot || !entry)
        throw new Error('Camping catalog changed during the stay read');
      if (!snapshot.fetchedAt || row.fetched_at < snapshot.fetchedAt)
        snapshot.fetchedAt = row.fetched_at;
      entry.codes[position] = SITE_NIGHT_CODE[row.status] ?? '-';
    }
    if (rows.length < pageSize) break;
    // PK(site,date) bounds the read. Catalog changes during paging fail safely.
    if (offset + pageSize > catalogRows.length * window.nights.length)
      throw new Error('Camping site-night read exceeds catalog budget');
  }
  for (const [id, snapshot] of snapshots) {
    snapshot.sites = [...sites.get(id)!.values()].map(({ site, codes }) => ({
      ...site,
      nights: codes.join(''),
    }));
  }
  return snapshots;
}

export interface SiteRow {
  facility_id: string;
  id: string;
  name: string | null;
  loop: string | null;
  site_type: string | null;
  max_occupancy: number | null;
  source_site_id: string;
}


const PAGE = 900;
/** Missing catalog sites must remain unknown, never disappear from the denominator. */
export async function loadSiteCatalog(
  db: SupabaseClient, facilityIds: string[],
  options: { signal?: AbortSignal; maxSites?: number } = {},
): Promise<SiteRow[]> {
  if (!facilityIds.length) return [];
  const sites: SiteRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    options.signal?.throwIfAborted();
    let query = db.from('campsite_sites')
      .select('id,facility_id,name,loop,site_type,max_occupancy,source_site_id')
      .in('facility_id', facilityIds).order('id').range(offset, offset + PAGE - 1);
    if (options.signal) query = query.abortSignal(options.signal);
    const { data, error } = await query;
    if (error) throw new Error(`campsite_sites: ${error.message}`);
    sites.push(...(data ?? []) as SiteRow[]);
    if (options.maxSites && sites.length > options.maxSites) throw new Error('Camping catalog exceeds read budget');
    if ((data ?? []).length < PAGE) return sites;
  }
}
