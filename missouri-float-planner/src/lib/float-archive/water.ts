import type { SupabaseClient } from '@supabase/supabase-js';
import type { CompletedFloat } from '@shared/float-archive';
import { classifyQualifiers } from '@/lib/usgs/gauges';

/** A nearby historical observation, never today's reading or a daily mean. */
export async function waterAtStart(db: SupabaseClient, trip: CompletedFloat): Promise<CompletedFloat['water']> {
  if (trip.firstMile == null) return null;
  try {
    const { data: river } = await db.from('rivers').select('id').eq('slug', trip.riverSlug).maybeSingle();
    if (!river) return null;
    // Nearest curated upstream gauge. No primary-gauge fallback across reaches.
    const { data: link } = await db
      .from('river_gauges')
      .select('gauge_station_id,gauge_stations(name)')
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
    return {
      gaugeName: station?.name ?? 'Upstream gauge',
      gaugeStationId: link.gauge_station_id,
      observedAt: reading.reading_timestamp,
      heightFt: reading.gauge_height_ft == null ? null : Number(reading.gauge_height_ft),
      dischargeCfs: reading.discharge_cfs == null ? null : Number(reading.discharge_cfs),
    };
  } catch {
    return null;
  }
}
