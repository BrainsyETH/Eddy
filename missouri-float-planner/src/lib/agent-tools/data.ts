import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { riverPath, riverAccessPath } from '@/lib/navigation/river-path';
import { getCoordinates } from '@/lib/api-utils';
import { loadCurrentReadings } from '@/lib/gauges/latest-readings';
import { applyFloodStageOverride, computeConditionFromDbRow, getConditionShortLabel, type DbThresholdRow } from '@/lib/conditions';
import { getFlowProvider } from '@/lib/flow-providers';
import { classifyQualifiers } from '@/lib/usgs/gauges';
import { AgentError, BASE_URL, freshness, memoizeAsync } from './contracts';

export type Db = SupabaseClient<Database>;
export type River = Pick<Database['public']['Tables']['rivers']['Row'], 'id' | 'name' | 'slug' | 'state' | 'region' | 'length_miles' | 'description' | 'difficulty_rating' | 'float_summary' | 'float_tip' | 'timezone' | 'park_code' | 'alert_search_terms' | 'weather_city' | 'weather_lat' | 'weather_lon'>;
export type Access = Database['public']['Tables']['access_points']['Row'];
export type Gauge = { id: string; name: string; usgs_site_id: string; nws_lid: string | null; provider: string | null; location: unknown; active: boolean };
export type GaugeLink = DbThresholdRow & { gauge_station_id: string; is_primary: boolean; river_mile: number | null; flood_stage_ft: number | null; gauge_stations: Gauge | Gauge[] | null };
export const GAUGE_SELECT = 'gauge_station_id, is_primary, river_mile, threshold_unit, level_too_low, level_low, level_optimal_min, level_optimal_max, level_high, level_dangerous, alt_level_too_low, alt_level_low, alt_level_optimal_min, alt_level_optimal_max, alt_level_high, alt_level_dangerous, flood_stage_ft, gauge_stations(id, name, usgs_site_id, nws_lid, provider, location, active)';
export const ACCESS_SELECT = 'id, river_id, name, slug, river_mile_downstream, type, types, is_public, is_float_endpoint, approved, amenities, description, fee_required, managing_agency, location_snap, location_orig, driving_lat, driving_lng, nps_campground_id';

export function checked<T>({ data, error }: { data: T; error: unknown }, what: string): T {
  if (error) throw new AgentError(`Could not look up ${what}. Please retry.`, 'lookup_failed');
  return data;
}
export function station(link: GaugeLink): Gauge | null { return Array.isArray(link.gauge_stations) ? link.gauge_stations[0] ?? null : link.gauge_stations; }
export function gaugeSource(link: GaugeLink | null) {
  const gauge = link && station(link);
  return gauge ? getFlowProvider(gauge.provider)?.publicUrl(gauge.usgs_site_id) ?? null : null;
}
export function numeric(value: unknown): number | null { if (value == null) return null; const n = Number(value); return Number.isFinite(n) ? n : null; }
export function normalize(value: string) { return value.trim().toLowerCase().replace(/[_\s]+/g, '-'); }
export function riverUrl(river: River) { return `${BASE_URL}${riverPath(river.state || 'MO', river.slug)}`; }
export function accessView(ap: Access, river: River) {
  return { id: ap.id, name: ap.name, slug: ap.slug, riverMile: numeric(ap.river_mile_downstream), isFloatEndpoint: ap.is_float_endpoint === true, isPublic: ap.is_public, types: ap.types ?? [ap.type], amenities: ap.amenities ?? [], feeRequired: ap.fee_required, description: ap.description, managingAgency: ap.managing_agency, coordinates: getCoordinates(ap.location_orig) ?? getCoordinates(ap.location_snap), url: ap.slug ? `${BASE_URL}${riverAccessPath(river.state || 'MO', river.slug, ap.slug)}` : riverUrl(river) };
}

export function createDataContext(db: Db, now = Date.now()) {
  const rivers = memoizeAsync<string, River[]>(async () => checked(await db.from('rivers').select('id, name, slug, state, region, length_miles, description, difficulty_rating, float_summary, float_tip, timezone, park_code, alert_search_terms, weather_city, weather_lat, weather_lon').eq('active', true).order('name'), 'river coverage') as River[]);
  const access = memoizeAsync(async (riverId: string) => checked(await db.from('access_points').select(ACCESS_SELECT).eq('river_id', riverId).eq('approved', true).order('river_mile_downstream').limit(501), 'access points') as Access[]);
  const gauges = memoizeAsync(async (riverId: string) => checked(await db.from('river_gauges').select(GAUGE_SELECT).eq('river_id', riverId), 'river gauges') as unknown as GaugeLink[]);
  const readings = memoizeAsync(async (riverId: string) => {
    const links = await gauges(riverId);
    try { return await loadCurrentReadings(db, links.map(g => g.gauge_station_id), { strict: true }); }
    catch { throw new AgentError('Could not look up current gauge readings. Please retry.', 'lookup_failed'); }
  });
  const hazards = memoizeAsync(async (riverId: string) => checked(await db.from('river_hazards').select('id, name, type, river_mile_downstream, description, severity, portage_required, portage_side, seasonal_notes').eq('river_id', riverId).eq('active', true).order('river_mile_downstream').limit(501), 'recorded hazards') ?? []);
  async function river(ref: string) {
    const rows = await rivers('active');
    const key = normalize(ref);
    const found = rows.find(r => r.id === ref || r.slug === key || normalize(r.name) === key);
    if (!found) throw new AgentError('River not found in curated coverage. Use list_rivers for supported slugs.');
    return found;
  }
  async function point(r: River, ref: string, endpoint = false) {
    const rows = await access(r.id);
    if (rows.length > 500) throw new AgentError('Access catalog exceeds this tool’s supported size.', 'unavailable');
    const key = normalize(ref);
    const matches = rows.filter(ap => ap.id === ref || ap.slug === key || normalize(ap.name) === key);
    if (matches.length !== 1) throw new AgentError('Access point not found or ambiguous on this river. Use get_access_points and provide its slug or UUID.');
    if (endpoint && !matches[0].is_float_endpoint) throw new AgentError('This place is not a launch and cannot be a float endpoint.');
    return matches[0];
  }
  async function chooseGauge(r: River, ap?: Access, gaugeId?: string) {
    const links = (await gauges(r.id)).filter(g => station(g)?.active);
    if (gaugeId) {
      const match = links.find(g => g.gauge_station_id === gaugeId);
      if (!match) throw new AgentError('The requested gauge is not an active gauge for this river.');
      return { link: match, reason: 'explicit_gauge' };
    }
    if (ap) {
      const mile = numeric(ap.river_mile_downstream);
      if (mile == null) throw new AgentError('This launch has no verified river mile.', 'unavailable');
      const conditionRows = checked(await db.rpc('get_river_condition_segment', { p_river_id: r.id, p_put_in_mile: mile }), 'segment gauge');
      const condition = conditionRows?.[0];
      const selected = links.find(g => station(g)?.usgs_site_id === condition?.gauge_usgs_id);
      if (!selected) return { link: null, reason: 'segment_gauge_unavailable' };
      return { link: selected, reason: 'shared_segment_resolver_at_put_in' };
    }
    return { link: links.find(g => g.is_primary) ?? null, reason: 'primary_river_reference_not_segment' };
  }
  async function gaugeView(r: River, link: GaugeLink) {
    const g = station(link)!;
    const reading = (await readings(r.id)).get(g.id);
    const age = freshness(reading?.reading_at, now);
    const qual = classifyQualifiers(reading?.qualifiers ?? []);
    const height = numeric(reading?.gauge_height_ft), discharge = numeric(reading?.discharge_cfs);
    const rated = applyFloodStageOverride(computeConditionFromDbRow(height, link, discharge).code, height, numeric(link.flood_stage_ft));
    const usable = age.stale === false && !qual.suspect && (height != null || discharge != null);
    const code = usable ? rated : 'unknown';
    return { id: g.id, name: g.name, usgsSiteId: g.usgs_site_id, siteId: g.usgs_site_id, provider: g.provider ?? 'usgs', river: r.slug, gaugeHeightFt: height, dischargeCfs: discharge, conditionCode: code, label: getConditionShortLabel(code), thresholdUnit: link.threshold_unit, ...age, qualifiers: reading?.qualifiers ?? [], accuracyWarning: qual.suspect || !usable, accuracyWarningReason: qual.note || (!usable ? 'Reading is missing, stale, or undated.' : null), source: gaugeSource(link), url: `${BASE_URL}/gauges/${g.usgs_site_id}` };
  }
  return { db, now, rivers, river, access, point, gauges, readings, hazards, chooseGauge, gaugeView };
}
export type DataContext = ReturnType<typeof createDataContext>;
