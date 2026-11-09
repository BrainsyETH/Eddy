// src/lib/lakes/store.ts
// The database half of the lake section: pool readings and reviewed launches.
//
// Reads never throw. The lake section sits below the generation content on a
// dam page, and a database blip there must not take the schedule down with it.
// Reads and writes use the service client: neither table carries a client
// grant (see the migration header).

import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import type { PoolPoint } from './pool-history';

const POOL_TABLE = 'lake_pool_readings';
const LAUNCH_TABLE = 'lake_launches';

export interface PoolReadingWrite {
  /** ISO instant, as the source stamped it. */
  at: string;
  elevationFt: number;
  datum: 'NGVD29' | 'NAVD88';
  source: string;
  daily: boolean;
}

/** Upsert on (lake_slug, observed_at): an overlapping re-read is idempotent, which is what repairs a missed run. */
export async function writePoolReadings(supabase: SupabaseClient, lakeSlug: string, readings: PoolReadingWrite[]): Promise<number> {
  if (readings.length === 0) return 0;
  const rows = readings.map((r) => ({
    lake_slug: lakeSlug,
    observed_at: r.at,
    elevation_ft: r.elevationFt,
    datum: r.datum,
    source: r.source,
    daily: r.daily,
  }));
  const { error } = await supabase.from(POOL_TABLE).upsert(rows, { onConflict: 'lake_slug,observed_at' });
  if (error) throw new Error(`${POOL_TABLE}: ${error.message}`);
  return rows.length;
}

/** Recorded readings for the last `days`, oldest first. Empty on any failure. */
export async function readPoolReadings(lakeSlug: string, options?: { days?: number; now?: number; client?: SupabaseClient }): Promise<PoolPoint[]> {
  const days = options?.days ?? 8;
  const now = options?.now ?? Date.now();
  try {
    const supabase = options?.client ?? createAdminClient();
    const { data, error } = await supabase
      .from(POOL_TABLE)
      .select('observed_at, elevation_ft')
      .eq('lake_slug', lakeSlug)
      .gte('observed_at', new Date(now - days * 86_400_000).toISOString())
      .lte('observed_at', new Date(now + 3_600_000).toISOString())
      .order('observed_at', { ascending: true })
      .limit(1_000);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({ at: Date.parse(row.observed_at as string), elevationFt: Number(row.elevation_ft) }));
  } catch (error) {
    logger.warn('lake pool readings unavailable', { lakeSlug, error: error instanceof Error ? error.message : String(error) });
    return [];
  }
}

export interface LaunchRow {
  id: string;
  lake_slug: string;
  slug: string;
  name: string;
  longitude: number;
  latitude: number;
  launch_methods: string[];
  amenities: string[];
  managing_agency: string | null;
  fee_required: boolean | null;
  ramp_bottom_elev_ft: number | null;
  ramp_closure_elev_ft: number | null;
  elev_datum: 'NGVD29' | 'NAVD88' | null;
  elev_source: string | null;
  elev_source_updated_at: string | null;
  access_point_id: string | null;
  /** Filled by the join below when the launch is an access point Eddy already carries. */
  access_point?: { slug: string; river_slug: string } | null;
}

/** Approved launches on a lake, with the access point each one is, when it is one. Empty on any failure. */
export async function readApprovedLaunches(lakeSlug: string, client?: SupabaseClient): Promise<LaunchRow[]> {
  try {
    const supabase = client ?? createAdminClient();
    const { data, error } = await supabase
      .from(LAUNCH_TABLE)
      .select('id, lake_slug, slug, name, longitude, latitude, launch_methods, amenities, managing_agency, fee_required, ramp_bottom_elev_ft, ramp_closure_elev_ft, elev_datum, elev_source, elev_source_updated_at, access_point_id')
      .eq('lake_slug', lakeSlug)
      .eq('approved', true)
      .order('name', { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as LaunchRow[];
    const linked = rows.filter((r) => r.access_point_id);
    if (linked.length) {
      const { data: points, error: pointsError } = await supabase
        .from('access_points')
        .select('id, slug, rivers!inner(slug)')
        .in('id', linked.map((r) => r.access_point_id as string));
      if (!pointsError && points) {
        const bySlug = new Map<string, { slug: string; river_slug: string }>();
        for (const p of points as unknown as Array<{ id: string; slug: string; rivers: { slug: string } | { slug: string }[] }>) {
          const river = Array.isArray(p.rivers) ? p.rivers[0] : p.rivers;
          if (river) bySlug.set(p.id, { slug: p.slug, river_slug: river.slug });
        }
        for (const r of rows) r.access_point = r.access_point_id ? bySlug.get(r.access_point_id) ?? null : null;
      }
    }
    return rows;
  } catch (error) {
    logger.warn('lake launches unavailable', { lakeSlug, error: error instanceof Error ? error.message : String(error) });
    return [];
  }
}
