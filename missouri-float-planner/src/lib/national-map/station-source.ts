// src/lib/national-map/station-source.ts
// Server-side readers for the national map: every in-scope USGS station with
// its position and metadata, and every gauge_latest row.
//
// Both walk PostgREST's silent 1,000-row cap with the walkers in
// src/lib/gauges/points.ts (keyset pages end on an EMPTY page; ranged pages
// that come back short are an error), so a truncated read throws instead of
// shipping a fourteenth of the country.

import type { SupabaseClient } from '@supabase/supabase-js';
import { collectKeyset, collectRanges } from '@/lib/gauges/points';
import { classifyQualifiers } from '@/lib/usgs/gauges';
import { toNum } from '@/lib/utils/num';
import { inNationalScope } from './scope';
import type { LatestInput } from './frame';

const PAGE = 1000;

export interface NationalStation {
  stationId: string;
  siteId: string;
  name: string;
  stateCode: string | null;
  waterbody: string | null;
  nwsLid: string | null;
  curated: boolean;
  lng: number;
  lat: number;
  /** NWS action / flood / moderate / major stages (ft, NWS stage datum), when published. */
  stages?: [number | null, number | null, number | null, number | null] | null;
  /** USGS water-resources region (first two digits of the gauge's HUC), e.g. '05' Ohio. */
  huc2?: string | null;
}

interface PointRow {
  id: string;
  site_id: string | null;
  curated: boolean;
  lng: number | null;
  lat: number | null;
}

interface MetaRow {
  id: string;
  name: string | null;
  state_code: string | null;
  waterbody_name: string | null;
  nws_lid: string | null;
  nwps_action_stage_ft?: number | string | null;
  nwps_flood_stage_ft?: number | string | null;
  nwps_moderate_stage_ft?: number | string | null;
  nwps_major_stage_ft?: number | string | null;
  huc?: string | null;
}

/** The 2-digit USGS water-resources region of a HUC (01–21), or null. */
export function huc2(huc: string | null | undefined): string | null {
  const m = typeof huc === 'string' ? /^(\d{2})\d*$/.exec(huc.trim()) : null;
  return m && Number(m[1]) >= 1 && Number(m[1]) <= 21 ? m[1] : null;
}

const stage = (v: number | string | null | undefined): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

// Loose on purpose: the typed client's generic parameters differ between the
// admin client and test fakes, and nothing here depends on generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

/** Join positions (gauge_points RPC) to metadata (gauge_stations) and apply map scope. */
export function joinStations(points: PointRow[], meta: MetaRow[]): NationalStation[] {
  const byId = new Map(meta.map((m) => [m.id, m]));
  const out: NationalStation[] = [];
  const seenSite = new Set<string>();
  for (const p of points) {
    const m = byId.get(p.id);
    // No metadata row means not an active USGS station (gauge_points spans
    // every provider) — the national map is USGS gauges plus NWS points.
    if (!m || !p.site_id || !/^\d{8,15}$/.test(p.site_id)) continue;
    if (p.lng === null || p.lat === null) continue;
    if (!inNationalScope(m.state_code, p.lng, p.lat)) continue;
    if (seenSite.has(p.site_id)) continue;
    seenSite.add(p.site_id);
    out.push({
      stationId: p.id,
      siteId: p.site_id,
      name: m.name?.trim() || `USGS ${p.site_id}`,
      stateCode: m.state_code?.trim().toUpperCase() || null,
      waterbody: m.waterbody_name?.trim() || null,
      nwsLid: m.nws_lid?.trim().toUpperCase() || null,
      curated: p.curated,
      lng: p.lng,
      lat: p.lat,
      stages: (() => {
        const s: [number | null, number | null, number | null, number | null] = [
          stage(m.nwps_action_stage_ft),
          stage(m.nwps_flood_stage_ft),
          stage(m.nwps_moderate_stage_ft),
          stage(m.nwps_major_stage_ft),
        ];
        return s.some((v) => v !== null) ? s : null;
      })(),
      huc2: huc2(m.huc),
    });
  }
  return out;
}

export async function loadNationalStations(supabase: Client): Promise<NationalStation[]> {
  const [points, meta] = await Promise.all([
    collectKeyset<PointRow>(
      async (after) => {
        const { data, error } = await supabase.rpc('gauge_points', {
          p_after: after ?? undefined,
          p_limit: PAGE,
        });
        if (error) throw new Error(`gauge_points: ${error.message}`);
        return (data ?? []) as PointRow[];
      },
      (row) => row.id,
    ),
    collectKeyset<MetaRow>(
      async (after) => {
        let q = supabase
          .from('gauge_stations')
          .select('id, name, state_code, waterbody_name, nws_lid, nwps_action_stage_ft, nwps_flood_stage_ft, nwps_moderate_stage_ft, nwps_major_stage_ft, huc')
          .eq('provider', 'usgs')
          .eq('active', true)
          .order('id')
          .limit(PAGE);
        if (after) q = q.gt('id', after);
        const { data, error } = await q;
        if (error) throw new Error(`gauge_stations: ${error.message}`);
        return (data ?? []) as MetaRow[];
      },
      (row) => row.id,
    ),
  ]);
  return joinStations(points, meta);
}

interface LatestRow {
  gauge_station_id: string;
  discharge_cfs: number | string | null;
  gauge_height_ft: number | string | null;
  reading_timestamp: string | null;
  qualifiers: string[] | null;
  flow_percentile: number | null;
  fetched_at: string | null;
}

/** gauge_latest rows for the given stations, as frame inputs keyed by USGS site id. */
export async function loadLatestForStations(
  supabase: Client,
  stations: NationalStation[],
): Promise<LatestInput[]> {
  const { count, error } = await supabase
    .from('gauge_latest')
    .select('gauge_station_id', { count: 'exact', head: true });
  if (error) throw new Error(`gauge_latest count: ${error.message}`);
  const rows = await collectRanges<LatestRow>(count ?? 0, PAGE, async (from, to) => {
    const { data, error: pageError } = await supabase
      .from('gauge_latest')
      .select(
        'gauge_station_id, discharge_cfs, gauge_height_ft, reading_timestamp, qualifiers, flow_percentile, fetched_at',
      )
      .order('gauge_station_id')
      .range(from, to);
    if (pageError) throw new Error(`gauge_latest: ${pageError.message}`);
    return (data ?? []) as LatestRow[];
  });
  return latestInputs(stations, rows);
}

export function latestInputs(stations: NationalStation[], rows: LatestRow[]): LatestInput[] {
  const siteByStation = new Map(stations.map((s) => [s.stationId, s.siteId]));
  const out: LatestInput[] = [];
  for (const r of rows) {
    const siteId = siteByStation.get(r.gauge_station_id);
    if (!siteId) continue;
    out.push({
      siteId,
      dischargeCfs: toNum(r.discharge_cfs),
      gaugeHeightFt: toNum(r.gauge_height_ft),
      readingTimestamp: r.reading_timestamp,
      suspect: classifyQualifiers(r.qualifiers).suspect,
      flowPercentile: r.flow_percentile,
      fetchedAt: r.fetched_at,
    });
  }
  return out;
}

/** nws_lid → USGS site id, from the stations' own crosswalk column. */
export function crosswalk(stations: NationalStation[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of stations) if (s.nwsLid && !out.has(s.nwsLid)) out.set(s.nwsLid, s.siteId);
  return out;
}
