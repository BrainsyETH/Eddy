import type { SupabaseClient } from '@supabase/supabase-js';
import type { CampingWindow } from './window';
import type { CampsiteSitesResult } from './sites';
import { SITE_NIGHT_CODE } from './sites';
import type { UnitStatus } from './types';
import { searchCampingStay } from './stay';
import { MAX_AGE_MS } from './freshness';
import { type CampingStayResult } from '../../../shared/camping-stay';

export interface StayObservation {
  facilityId: string;
  date: string;
  fetchedAt: string;
}
/** Batch all cards: one ordered, paged site-night read, not one request per card. */
export async function loadStaySummaries(
  db: SupabaseClient,
  observations: StayObservation[],
  window: CampingWindow,
  now: Date,
) {
  const result = new Map<string, CampingStayResult>();
  const ids = [...new Set(observations.map((o) => o.facilityId))];
  if (!ids.length) return result;
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
  const pageSize = 900;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await db
      .from('campsite_site_availability')
      .select(
        'site_id,date,status,fetched_at,campsite_sites!inner(facility_id)',
      )
      .in('campsite_sites.facility_id', ids)
      .in('date', window.nights)
      .order('site_id')
      .order('date')
      .range(offset, offset + pageSize - 1);
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
      let snapshot = snapshots.get(facilityId);
      if (!snapshot) {
        snapshot = {
          facility: { id: facilityId, displayName: '', kind: '', source: '' },
          window,
          fetchedAt: row.fetched_at,
          sites: [],
        };
        snapshots.set(facilityId, snapshot);
      }
      if (row.fetched_at < snapshot.fetchedAt!)
        snapshot.fetchedAt = row.fetched_at;
      const catalog = sites.get(facilityId) ?? new Map();
      const entry = catalog.get(row.site_id) ?? {
        site: {
          id: row.site_id,
          name: null,
          loop: null,
          siteType: null,
          maxOccupancy: null,
          bookingUrl: null,
          nights: '',
        },
        codes: window.nights.map(() => '-'),
      };
      entry.codes[position] = SITE_NIGHT_CODE[row.status] ?? '-';
      catalog.set(row.site_id, entry);
      sites.set(facilityId, catalog);
    }
    if (rows.length < pageSize) break;
  }
  for (const [id, snapshot] of snapshots) {
    snapshot.sites = [...sites.get(id)!.values()].map(({ site, codes }) => ({
      ...site,
      nights: codes.join(''),
    }));
    result.set(
      id,
      searchCampingStay(snapshot, window.startDate, window.endDate, now),
    );
  }
  return result;
}
