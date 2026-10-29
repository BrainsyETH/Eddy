import type { FloatSearchFilters } from '@shared/float-search';
import { checked, numeric, type Access, type DataContext, type River } from './data';

/** Find a Float filters. Each one only removes routes: missing data never
 * satisfies a filter that asks for a feature (restrooms, camping, beginner),
 * and only recorded data can fail one that rules a feature out (fees, rough
 * roads, portages). */

const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6 };
const ROUGH_ROADS = new Set(['gravel_unmaintained', 'dirt', '4wd_required']);

/** The highest class in the leading rating, e.g. "Class I-II (…)" → 2. */
export function difficultyClass(rating: string | null | undefined): number | null {
  const match = /^\s*class\s+([IV]+)(?:\s*[-–]\s*([IV]+))?/i.exec(rating ?? '');
  if (!match) return null;
  return ROMAN[(match[2] ?? match[1]).toUpperCase()] ?? null;
}

export function riverPasses(river: Pick<River, 'river_type' | 'difficulty_rating'>, filters: FloatSearchFilters | undefined, shuttleRivers?: Set<string>, riverId?: string) {
  if (filters?.springFed && river.river_type !== 'spring_fed_float') return false;
  if (filters?.beginner && difficultyClass(river.difficulty_rating) !== 1) return false;
  if (filters?.shuttle && !(riverId && shuttleRivers?.has(riverId))) return false;
  return true;
}

type Endpoint = Pick<Access, 'amenities' | 'fee_required' | 'nps_campground_id'> & { road_surface?: string[] | null };
const has = (point: Endpoint, amenity: string) => (point.amenities ?? []).includes(amenity);
const camping = (point: Endpoint) => has(point, 'camping') || Boolean(point.nps_campground_id);

export function pairPasses(
  putIn: Endpoint & Pick<Access, 'river_mile_downstream'>,
  takeOut: Endpoint & Pick<Access, 'river_mile_downstream'>,
  filters: FloatSearchFilters | undefined,
  portageMiles: number[] = [],
) {
  if (filters?.restrooms && !has(putIn, 'restrooms') && !has(takeOut, 'restrooms')) return false;
  if (filters?.camping && !camping(putIn) && !camping(takeOut)) return false;
  if (filters?.noFees && (putIn.fee_required === true || takeOut.fee_required === true)) return false;
  if (filters?.smoothRoads && [putIn, takeOut].some(point => (point.road_surface ?? []).some(surface => ROUGH_ROADS.has(surface)))) return false;
  if (filters?.noPortages) {
    const start = Number(putIn.river_mile_downstream), end = Number(takeOut.river_mile_downstream);
    if (portageMiles.some(mile => mile >= start && mile <= end)) return false;
  }
  return true;
}

/** Facts worth naming on a card, matched filters first. */
export function routeHighlights(putIn: Endpoint, takeOut: Endpoint, shuttle: boolean, filters?: FloatSearchFilters) {
  const facts = [
    { key: 'shuttle', label: 'Outfitter shuttle', on: shuttle },
    { key: 'camping', label: 'Camping', on: camping(putIn) || camping(takeOut) },
    { key: 'restrooms', label: 'Restrooms', on: has(putIn, 'restrooms') || has(takeOut, 'restrooms') },
    { key: 'noFees', label: 'No fees', on: putIn.fee_required === false && takeOut.fee_required === false },
  ].filter(fact => fact.on);
  const wanted = (key: string) => Number(!(filters as Record<string, boolean> | undefined)?.[key]);
  return facts.sort((a, b) => wanted(a.key) - wanted(b.key)).slice(0, 3).map(fact => fact.label);
}

export async function portageMiles(ctx: DataContext, riverId: string) {
  const hazards = (await ctx.hazards(riverId)) as Array<{ portage_required: boolean | null; river_mile_downstream: unknown }>;
  return hazards
    .filter(hazard => hazard.portage_required === true)
    .map(hazard => numeric(hazard.river_mile_downstream))
    .filter((mile): mile is number => mile != null);
}

/** Rivers with an operating outfitter that lists shuttles for that river. */
export async function shuttleRivers(ctx: DataContext, riverIds: string[]) {
  if (!riverIds.length) return new Set<string>();
  const rows = checked(
    await ctx.db
      .from('service_rivers')
      .select('river_id, services_offered, nearby_services(services_offered, status)')
      .in('river_id', riverIds)
      .limit(2001),
    'river services',
  ) as unknown as Array<{ river_id: string; services_offered: string[] | null; nearby_services: { services_offered: string[] | null; status: string | null } | null }>;
  if (rows.length > 2000) throw new Error('Service catalog exceeds search limit');
  return new Set(rows.filter(row => {
    const service = row.nearby_services;
    if (!service || !['active', 'seasonal'].includes(service.status ?? '')) return false;
    const offered = row.services_offered?.length ? row.services_offered : service.services_offered ?? [];
    return offered.includes('shuttle');
  }).map(row => row.river_id));
}

