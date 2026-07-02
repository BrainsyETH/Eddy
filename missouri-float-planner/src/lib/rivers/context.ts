// src/lib/rivers/context.ts
// Per-river region/hydrology context loaded from the database.
//
// This replaces the hardcoded Missouri maps that used to live in code
// (RIVER_CITY_MAP, RIVER_SEARCH_TERMS, RIVER_NOTES, RAIN_LAG) and carries the
// multi-region fields added in migration 00145 (state, timezone, river_type,
// park_code). Reads are served from a short in-memory cache because callers
// (chat requests, cron update generation) hit the same rows repeatedly.

import { createAdminClient } from '@/lib/supabase/admin';

export type RiverType =
  | 'spring_fed_float'
  | 'dam_tailwater'
  | 'rain_flashy'
  | 'snowmelt'
  | 'flatwater';

export interface RiverCharacteristics {
  isSpringFed: boolean | null;
  primaryHazards: string[];
  lowWaterMeaning: string | null;
  risingWaterHazards: string | null;
  rainLagHours: number | null;
  rainLagNote: string | null;
  dropRateNote: string | null;
  riverNote: string | null;
  /** Optional per-river float-speed multipliers, e.g. { low: 0.75, too_low: 0.5 } */
  speedCurve: { low?: number; too_low?: number } | null;
}

export interface RiverContext {
  id: string;
  slug: string;
  name: string;
  /** Free-text region label (e.g. "Ozarks") from rivers.region. */
  region: string | null;
  state: string;
  country: string;
  /** IANA timezone, e.g. America/Chicago */
  timezone: string;
  riverType: RiverType;
  parkCode: string | null;
  weatherCity: string | null;
  weatherLat: number | null;
  weatherLon: number | null;
  alertSearchTerms: string[] | null;
  characteristics: RiverCharacteristics | null;
}

export const DEFAULT_TIMEZONE = 'America/Chicago';

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  contexts: Map<string, RiverContext>;
  loadedAt: number;
}

let cache: CacheEntry | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): RiverContext {
  const rc = Array.isArray(row.river_characteristics)
    ? row.river_characteristics[0]
    : row.river_characteristics;

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    region: row.region ?? null,
    state: row.state || 'MO',
    country: row.country || 'US',
    timezone: row.timezone || DEFAULT_TIMEZONE,
    riverType: (row.river_type || 'spring_fed_float') as RiverType,
    parkCode: row.park_code ?? null,
    weatherCity: row.weather_city ?? null,
    weatherLat: row.weather_lat !== null && row.weather_lat !== undefined ? Number(row.weather_lat) : null,
    weatherLon: row.weather_lon !== null && row.weather_lon !== undefined ? Number(row.weather_lon) : null,
    alertSearchTerms: row.alert_search_terms ?? null,
    characteristics: rc
      ? {
          isSpringFed: rc.is_spring_fed ?? null,
          primaryHazards: rc.primary_hazards ?? [],
          lowWaterMeaning: rc.low_water_meaning ?? null,
          risingWaterHazards: rc.rising_water_hazards ?? null,
          rainLagHours: rc.rain_lag_hours !== null && rc.rain_lag_hours !== undefined ? Number(rc.rain_lag_hours) : null,
          rainLagNote: rc.rain_lag_note ?? null,
          dropRateNote: rc.drop_rate_note ?? null,
          riverNote: rc.river_note ?? null,
          speedCurve: rc.speed_curve ?? null,
        }
      : null,
  };
}

async function loadAll(): Promise<Map<string, RiverContext>> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
    return cache.contexts;
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('rivers')
    .select(
      `id, slug, name, region, state, country, timezone, river_type, park_code,
       weather_city, weather_lat, weather_lon, alert_search_terms, active,
       river_characteristics (
         is_spring_fed, primary_hazards, low_water_meaning, rising_water_hazards,
         rain_lag_hours, rain_lag_note, drop_rate_note, river_note, speed_curve
       )`
    )
    .eq('active', true);

  if (error || !data) {
    console.error('[RiverContext] Failed to load rivers:', error);
    // Keep serving a stale cache on transient failures rather than nothing.
    if (cache) return cache.contexts;
    return new Map();
  }

  const contexts = new Map<string, RiverContext>();
  for (const row of data) {
    const ctx = mapRow(row);
    contexts.set(ctx.slug, ctx);
  }
  cache = { contexts, loadedAt: Date.now() };
  return contexts;
}

/** Context for one active river, or null if unknown. */
export async function getRiverContext(riverSlug: string): Promise<RiverContext | null> {
  const contexts = await loadAll();
  return contexts.get(riverSlug) ?? null;
}

/** Contexts for all active rivers. */
export async function getActiveRiverContexts(): Promise<RiverContext[]> {
  const contexts = await loadAll();
  return Array.from(contexts.values());
}

/** Distinct states across active rivers (drives NWS alert fetching). */
export async function getActiveStates(): Promise<string[]> {
  const contexts = await getActiveRiverContexts();
  return Array.from(new Set(contexts.map((c) => c.state)));
}

/** Distinct NPS park codes across active rivers (drives NPS sync). */
export async function getActiveParkCodes(): Promise<string[]> {
  const contexts = await getActiveRiverContexts();
  return Array.from(new Set(contexts.map((c) => c.parkCode).filter((c): c is string => !!c)));
}

/** Test/ops hook: drop the cache so the next read hits the database. */
export function invalidateRiverContextCache(): void {
  cache = null;
}
