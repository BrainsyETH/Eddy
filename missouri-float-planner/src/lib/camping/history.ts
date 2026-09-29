// src/lib/camping/history.ts
// Occupancy snapshots for campsite_occupancy_history (see that migration).
//
// campsite_availability forgets a night seven days after it passes. This
// keeps one row per enabled facility, per night, at lead times 0, 7 and 14
// days, so a future baseline can say "busier than a typical Saturday" and how
// fast a weekend fills. Upserted: later cron slots on the same day replace
// earlier ones with a fresher reading.
//
// Never allowed to fail the sync that calls it — history is a by-product.

import type { SupabaseClient } from '@supabase/supabase-js';
import { localDate } from './window';

export const HISTORY_LEAD_DAYS = [0, 7, 14] as const;
const CAPACITY_WINDOW_MS = 30 * 86_400_000;

export interface HistoryFacility {
  id: string;
  source: 'recreation_gov' | 'mo_state_parks';
}
export interface HistoryObservation {
  facility_id: string;
  date: string;
  sites_open: number;
  sites_reservable: number;
  status: 'open' | 'full' | 'closed' | 'not_yet_released';
  fetched_at: string;
}
export interface OccupancySnapshot {
  facility_id: string;
  date: string;
  lead_days: number;
  source: HistoryFacility['source'];
  status: HistoryObservation['status'] | 'missing';
  sites_open: number | null;
  sites_reservable: number | null;
  expected_reservable: number | null;
  observed_at: string | null;
  captured_at: string;
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** Pure: every enabled facility gets a row for every lead time, observed or not. */
export function buildOccupancySnapshots(
  facilities: HistoryFacility[],
  observations: HistoryObservation[],
  now = new Date(),
): OccupancySnapshot[] {
  const today = localDate(now);
  const capturedAt = now.toISOString();
  const byKey = new Map<string, HistoryObservation>();
  const capacity = new Map<string, number>();
  for (const o of observations) {
    const age = now.getTime() - Date.parse(o.fetched_at);
    if (!(age >= 0)) continue;
    const key = `${o.facility_id}|${o.date}`;
    const held = byKey.get(key);
    if (!held || Date.parse(held.fetched_at) < Date.parse(o.fetched_at)) byKey.set(key, o);
    if (
      age < CAPACITY_WINDOW_MS &&
      (o.status === 'open' || o.status === 'full') &&
      o.sites_reservable > 0
    )
      capacity.set(o.facility_id, Math.max(capacity.get(o.facility_id) ?? 0, o.sites_reservable));
  }
  const rows: OccupancySnapshot[] = [];
  for (const f of facilities) {
    for (const lead of HISTORY_LEAD_DAYS) {
      const date = addDays(today, lead);
      const o = byKey.get(`${f.id}|${date}`);
      rows.push({
        facility_id: f.id,
        date,
        lead_days: lead,
        source: f.source,
        status: o ? o.status : 'missing',
        sites_open: o ? o.sites_open : null,
        sites_reservable: o ? o.sites_reservable : null,
        expected_reservable: capacity.get(f.id) ?? null,
        observed_at: o ? o.fetched_at : null,
        captured_at: capturedAt,
      });
    }
  }
  return rows;
}

/** Read, build, upsert. Returns rows written; throws on database error. */
export async function recordOccupancyHistory(
  supabase: SupabaseClient,
  now = new Date(),
): Promise<number> {
  const since = new Date(now.getTime() - CAPACITY_WINDOW_MS).toISOString();
  const { data: facilities, error: facilityError } = await supabase
    .from('campsite_facilities')
    .select('id, source')
    .eq('enabled', true)
    .eq('kind', 'campground');
  if (facilityError) throw new Error(`history facilities: ${facilityError.message}`);

  const observations: HistoryObservation[] = [];
  for (let from = 0; from < 50_000; from += 1000) {
    const { data, error } = await supabase
      .from('campsite_availability')
      .select('facility_id, date, sites_open, sites_reservable, status, fetched_at')
      .gte('fetched_at', since)
      .order('facility_id')
      .order('date')
      .range(from, from + 999);
    if (error) throw new Error(`history observations: ${error.message}`);
    observations.push(...((data ?? []) as HistoryObservation[]));
    if (!data || data.length < 1000) break;
  }

  const rows = buildOccupancySnapshots(
    (facilities ?? []) as HistoryFacility[],
    observations,
    now,
  );
  if (!rows.length) return 0;
  const { error } = await supabase
    .from('campsite_occupancy_history')
    .upsert(rows, { onConflict: 'facility_id,date,lead_days' });
  if (error) throw new Error(`history upsert: ${error.message}`);
  return rows.length;
}
