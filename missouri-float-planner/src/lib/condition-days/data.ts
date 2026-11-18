import 'server-only';
import { unstable_cache } from 'next/cache';
import { centralDayKey } from '@shared/dam-schedule-copy';
import { classifyReading, type ConditionThresholds } from '@shared/condition-ladder';
import { gaugeFreshness } from '@shared/gauge-freshness';
import { hasSuspectQualifier } from '@shared/reading-trust';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadCurrentReadings } from '@/lib/gauges/latest-readings';
import { linkFloodStageFt } from '@/lib/gauges/flood-stages';
import snapshots from '@/data/condition-days/observations.json';
import { median, offsetDay, SNAPSHOT_THROUGH, type Archive, type Station } from './study';

const configured = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
export async function archiveFor(station: Station): Promise<Archive> {
  // Station comes exclusively from the published catalog.
  return (await import(`@/data/condition-days/archive/${station.site}.json`)).default;
}
const readPair = unstable_cache(async (site: string, slug: string) => {
  const { data, error } = await createAdminClient().from('river_gauges')
    .select('gauge_station_id,threshold_unit,level_too_low,level_low,level_optimal_min,level_optimal_max,level_high,level_dangerous,flood_stage_ft,gauge_stations!inner(active,curated,provider,usgs_site_id,nwps_flood_stage_ft),rivers!inner(slug,active,condition_rating_mode)')
    .eq('gauge_stations.usgs_site_id', site).eq('gauge_stations.active', true)
    .eq('rivers.slug', slug).eq('rivers.active', true).eq('rivers.condition_rating_mode', 'rated')
    .eq('threshold_unit', 'cfs').maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const values = [data.level_too_low, data.level_low, data.level_optimal_min, data.level_optimal_max, data.level_high, data.level_dangerous];
  if (values.some(x => x == null || !Number.isFinite(Number(x)))) return null;
  const [levelTooLow, levelLow, levelOptimalMin, levelOptimalMax, levelHigh, levelDangerous] = values.map(Number);
  if (!(0 <= levelTooLow && levelTooLow <= levelLow && levelLow <= levelOptimalMin && levelOptimalMin <= levelOptimalMax && levelOptimalMax < levelDangerous)) return null;
  return { id: String(data.gauge_station_id), thresholds: { levelTooLow, levelLow, levelOptimalMin, levelOptimalMax, levelHigh, levelDangerous }, floodStageFt: linkFloodStageFt(data) };
}, ['condition-days-pair-v1'], { revalidate: 3600 });

export async function resolvePair(station: Station) {
  if (configured()) {
    try {
      const pair = await readPair(station.site, station.slug);
      return pair && { ...pair, archived: false };
    } catch (error) { console.warn('Condition Days rating lookup unavailable', station.site, error); }
  }
  return { id: null, thresholds: station.thresholds, archived: true, floodStageFt: null };
}
const readLatest = unstable_cache(async (id: string) => {
  const rows = await loadCurrentReadings(createAdminClient(), [id], { strict: true, stations: [{ id, provider: 'usgs', curated: true }] });
  return rows.get(id) ?? null;
}, ['condition-days-reading-v1'], { revalidate: 900 });

export async function recentReading(id: string | null, thresholds: ConditionThresholds, floodStageFt: number | null, today: string) {
  if (!id) return null;
  try {
    const row = await readLatest(id);
    if (!row?.reading_at || gaugeFreshness(row.reading_at) !== 'live' || centralDayKey(Date.parse(row.reading_at)) !== today ||
        hasSuspectQualifier(row.qualifiers) || row.discharge_cfs == null || row.discharge_cfs < 0) return null;
    return { cfs: row.discharge_cfs, at: row.reading_at,
      level: classifyReading(row.gauge_height_ft, { ...thresholds, thresholdUnit: 'cfs', floodStageFt }, row.discharge_cfs, { strictUnit: true }) };
  } catch { return null; }
}
const centralDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' });
const readDays = unstable_cache(async (id: string, start: string, end: string) => {
  const samples = new Map<string, number[]>();
  const client = createAdminClient();
  // Bound each read by a month. Offset bounds cover DST; bucket by the actual Central day.
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.from('gauge_readings').select('reading_timestamp,discharge_cfs,qualifiers')
      .eq('gauge_station_id', id).gte('reading_timestamp', start + 'T00:00:00-05:00')
      .lt('reading_timestamp', end + 'T00:00:00-06:00').order('reading_timestamp').range(offset, offset + 999);
    if (error) throw error;
    for (const row of data ?? []) {
      if (row.discharge_cfs == null || hasSuspectQualifier(row.qualifiers)) continue;
      const cfs = Number(row.discharge_cfs);
      const day = centralDate.format(new Date(row.reading_timestamp));
      if (!Number.isFinite(cfs) || cfs < 0 || day < start || day >= end) continue;
      const readings = samples.get(day) ?? [];
      readings.push(cfs);
      samples.set(day, readings);
    }
    if ((data?.length ?? 0) < 1000) break;
  }
  return Object.fromEntries(Array.from(samples, ([day, values]) => [day, median(values)!]));
}, ['condition-days-observations-v1'], { revalidate: 86400 });

export async function seasonFor(site: string, id: string | null, today: string) {
  const year = today.slice(0, 4);
  const days: Record<string, number> = {};
  let start = year + '-01-01';
  if (year === SNAPSHOT_THROUGH.slice(0, 4)) {
    const rows = snapshots[site as keyof typeof snapshots] ?? [];
    rows.forEach((value, index) => {
      const key = offsetDay(start, index);
      if (value != null && key < today) days[key] = value;
    });
    start = offsetDay(SNAPSHOT_THROUGH, 1);
  }
  let through = start < today ? offsetDay(start, -1) : offsetDay(today, -1);
  if (id) {
    while (start < today) {
      const nextMonth = new Date(Date.UTC(Number(year), Number(start.slice(5, 7)), 1)).toISOString().slice(0, 10);
      const end = nextMonth < today ? nextMonth : today;
      try { Object.assign(days, await readDays(id, start, end)); }
      catch { break; } // Only mark a month checked once its whole query succeeds.
      through = offsetDay(end, -1);
      start = end;
    }
  }
  return { days, through, year: Number(year) };
}
