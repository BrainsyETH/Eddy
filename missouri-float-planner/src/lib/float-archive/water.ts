import type { SupabaseClient } from '@supabase/supabase-js';
import type { CompletedFloat } from '@shared/float-archive';
import { classifyQualifiers } from '@/lib/usgs/gauges';
import { applyFloodStageOverride, computeConditionFromDbRow } from '@/lib/conditions';

// The same columns computeConditionFromDbRow reads, plus the flood stage that
// outranks them: the anchor gauge's ladder, so a float with no condition
// snapshot from Start still gets one (docs/float-history-card-plan.md, 2a).
// Anchor only, without the in-stretch escalation the planner applies, so the
// badge names this gauge. Like all of `water`, computed on first upload only.
const LINK_COLUMNS =
  'gauge_station_id,threshold_unit,level_too_low,level_low,level_optimal_min,level_optimal_max,level_high,level_dangerous,flood_stage_ft,gauge_stations(name,usgs_site_id)' as const;

/** A nearby historical observation, never today's reading or a daily mean. */
export async function waterAtStart(db: SupabaseClient, trip: CompletedFloat): Promise<CompletedFloat['water']> {
  if (trip.firstMile == null) return null;
  try {
    const { data: river } = await db.from('rivers').select('id').eq('slug', trip.riverSlug).maybeSingle();
    if (!river) return null;
    // Nearest curated upstream gauge. No primary-gauge fallback across reaches.
    const { data: link } = await db
      .from('river_gauges')
      .select(LINK_COLUMNS)
      .eq('river_id', river.id)
      .lte('river_mile', trip.firstMile)
      .order('river_mile', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!link) return null;
    const tolerance = 30 * 60000;
    const { data: readings, error } = await db
      .from('gauge_readings')
      .select('reading_timestamp,gauge_height_ft,discharge_cfs,qualifiers')
      .eq('gauge_station_id', link.gauge_station_id)
      .gte('reading_timestamp', new Date(trip.startedAt - tolerance).toISOString())
      .lte('reading_timestamp', new Date(trip.startedAt + tolerance).toISOString())
      .order('reading_timestamp')
      .limit(100);
    if (error) return null;
    const reading = readings
      ?.filter((r) => !classifyQualifiers(r.qualifiers).suspect)
      .sort(
        (a, b) =>
          Math.abs(Date.parse(a.reading_timestamp) - trip.startedAt) -
          Math.abs(Date.parse(b.reading_timestamp) - trip.startedAt),
      )[0];
    if (!reading || (reading.gauge_height_ft == null && reading.discharge_cfs == null)) return null;
    const station = Array.isArray(link.gauge_stations) ? link.gauge_stations[0] : link.gauge_stations;
    const heightFt = reading.gauge_height_ft == null ? null : Number(reading.gauge_height_ft);
    const dischargeCfs = reading.discharge_cfs == null ? null : Number(reading.discharge_cfs);
    const flood = link.flood_stage_ft == null ? null : Number(link.flood_stage_ft);
    const code = applyFloodStageOverride(computeConditionFromDbRow(heightFt, link, dischargeCfs).code, heightFt, flood);
    return {
      gaugeName: station?.name ?? 'Upstream gauge',
      gaugeStationId: link.gauge_station_id,
      observedAt: reading.reading_timestamp,
      heightFt,
      dischargeCfs,
      ...(code !== 'unknown' ? { conditionCode: code } : {}),
      ...(station?.usgs_site_id ? { usgsSiteId: station.usgs_site_id } : {}),
    };
  } catch {
    return null;
  }
}
