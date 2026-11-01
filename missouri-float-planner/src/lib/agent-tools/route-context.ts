// What a Find a Float card shows besides time and conditions: facilities at the
// ends, outfitters that work the route, and what lies between the ends.
//
// All of it is enrichment. A failed read here drops the facts from the card and
// never the route from the results, so each loader resolves empty on error.

import type { FloatFacility, FloatOutfitter, FloatOutfitterOffer, FloatStop, FloatStopKind } from '@shared/float-search';
import { geographicMiles } from '@shared/float-search';
import { hazardRoutePosition } from '@shared/route-hazards';
import { accessView, checked, normalize, numeric, type Access, type DataContext, type River } from './data';

const OFFERS: Record<string, FloatOutfitterOffer> = {
  shuttle: 'shuttle',
  canoe_rental: 'canoe',
  kayak_rental: 'kayak',
  raft_rental: 'raft',
  tube_rental: 'tube',
};
const OPERATING = new Set(['active', 'seasonal']);
/** Cards show two; the third lets the card say "+1" honestly. */
export const MAX_ROUTE_OUTFITTERS = 3;
/** Enough for any real Ozarks float; bounds the payload on a long multi-day run. */
const MAX_STOPS = 24;
const POI_KINDS: Record<string, FloatStopKind> = {
  spring: 'spring',
  cave: 'cave',
  waterfall: 'sight',
  scenic_viewpoint: 'sight',
  geological: 'sight',
  historical_site: 'sight',
  float_camp: 'campground',
};

export interface RiverOutfitter {
  id: string;
  name: string;
  offers: FloatOutfitterOffer[];
  website: string | null;
  phone: string | null;
  point: { lat: number; lng: number } | null;
  /** Normalized endpoint names from the runs this business lists on this river. */
  runEnds: string[];
}

interface ServiceRow {
  services_offered: string[] | null;
  routes: unknown;
  nearby_services: {
    id: string; name: string; phone: string | null; website: string | null;
    latitude: number | null; longitude: number | null;
    services_offered: string[] | null; status: string | null;
  } | null;
}

/** Operating businesses on these rivers that rent boats or run shuttles. */
export async function loadRiverOutfitters(ctx: DataContext, riverIds: string[]): Promise<Map<string, RiverOutfitter[]>> {
  const byRiver = new Map<string, RiverOutfitter[]>();
  if (!riverIds.length) return byRiver;
  try {
    const rows = checked(
      await ctx.db
        .from('service_rivers')
        .select('river_id, services_offered, routes, nearby_services(id, name, phone, website, latitude, longitude, services_offered, status)')
        .in('river_id', riverIds)
        .limit(2001),
      'river services',
    ) as unknown as Array<ServiceRow & { river_id: string }>;
    if (rows.length > 2000) return byRiver;
    for (const row of rows) {
      const outfitter = riverOutfitter(row);
      if (outfitter) byRiver.set(row.river_id, [...(byRiver.get(row.river_id) ?? []), outfitter]);
    }
  } catch {
    // Enrichment only.
  }
  return byRiver;
}

export function riverOutfitter(row: ServiceRow): RiverOutfitter | null {
  const s = row.nearby_services;
  if (!s || !OPERATING.has(s.status ?? '')) return null;
  // River-specific offerings win: a business on two rivers may shuttle only one.
  const offered = row.services_offered?.length ? row.services_offered : s.services_offered ?? [];
  const offers = [...new Set(offered.flatMap(key => OFFERS[key] ? [OFFERS[key]] : []))];
  if (!offers.length) return null;
  const lat = numeric(s.latitude), lng = numeric(s.longitude);
  const runs = Array.isArray(row.routes) ? row.routes as Array<{ putIn?: unknown; takeOut?: unknown }> : [];
  return {
    id: s.id,
    name: s.name,
    offers: (['shuttle', 'canoe', 'kayak', 'raft', 'tube'] as const).filter(offer => offers.includes(offer)),
    website: s.website ?? null,
    phone: s.phone ?? null,
    point: lat != null && lng != null ? { lat, lng } : null,
    runEnds: runs.flatMap(run => [run.putIn, run.takeOut]).filter((end): end is string => typeof end === 'string' && end.trim() !== '').map(normalize),
  };
}

/** A run's end names a route endpoint when either name contains the other: "Akers" ↔ "Akers Ferry". */
function namesEnd(ends: string[], point: Pick<Access, 'name'>) {
  const name = normalize(point.name);
  return ends.some(end => end.length >= 4 && (name.includes(end) || end.includes(name)));
}

/**
 * Most relevant first: a business that lists a run from this put-in or to this
 * take-out, then one that rents the boat being searched for, then the nearest
 * to the put-in. Directory facts, not live availability.
 */
export function routeOutfitters(
  outfitters: RiverOutfitter[],
  putIn: Pick<Access, 'name'>,
  takeOut: Pick<Access, 'name'>,
  putInPoint: { lat: number; lng: number } | null,
  vessel: string,
): FloatOutfitter[] {
  const rents = (o: RiverOutfitter) => o.offers.includes(vessel as FloatOutfitterOffer);
  return outfitters
    .map(o => ({
      o,
      serves: namesEnd(o.runEnds, putIn) || namesEnd(o.runEnds, takeOut),
      miles: putInPoint && o.point ? geographicMiles(putInPoint, o.point) : Infinity,
    }))
    .sort((a, b) => Number(b.serves) - Number(a.serves) || Number(rents(b.o)) - Number(rents(a.o)) || a.miles - b.miles || a.o.name.localeCompare(b.o.name))
    .slice(0, MAX_ROUTE_OUTFITTERS)
    .map(({ o, serves }) => ({ id: o.id, name: o.name, offers: o.offers, website: o.website, phone: o.phone, servesRoute: serves }));
}

export interface RiverSights {
  pois: Array<{ name: string; type: string; mile: number }>;
  hazards: Array<{ name: string; mile: number; portage: boolean }>;
}

/** On-water points of interest and active hazards, by river mile. */
export async function loadRiverSights(ctx: DataContext, riverId: string): Promise<RiverSights> {
  const [pois, hazards] = await Promise.all([
    (async () => {
      try {
        const rows = checked(
          await ctx.db
            .from('points_of_interest')
            .select('name, type, river_mile')
            .eq('river_id', riverId)
            .eq('active', true)
            .eq('is_on_water', true)
            .limit(501),
          'points of interest',
        ) as Array<{ name: string; type: string; river_mile: unknown }> | null;
        return (rows ?? []).flatMap(row => {
          const mile = numeric(row.river_mile);
          return mile == null ? [] : [{ name: row.name, type: row.type, mile }];
        });
      } catch {
        return [];
      }
    })(),
    (async () => {
      try {
        const rows = (await ctx.hazards(riverId)) as Array<{ name: string | null; portage_required: boolean | null; river_mile_downstream: unknown }>;
        return rows.flatMap(row => {
          const mile = numeric(row.river_mile_downstream);
          return mile == null ? [] : [{ name: row.name ?? 'Hazard', mile, portage: row.portage_required === true }];
        });
      } catch {
        return [];
      }
    })(),
  ]);
  return { pois, hazards };
}

const hasAmenity = (point: Pick<Access, 'amenities'>, key: string) => (point.amenities ?? []).includes(key);
const isCampground = (point: Pick<Access, 'amenities' | 'nps_campground_id' | 'types' | 'type'>) =>
  hasAmenity(point, 'camping') || Boolean(point.nps_campground_id) || point.type === 'campground' || (point.types ?? []).includes('campground');

/** Everything strictly between the ends, in river order. Endpoint hazards are the cautions' job. */
export function routeStops(points: Access[], sights: RiverSights, putIn: Access, takeOut: Access): FloatStop[] {
  const start = numeric(putIn.river_mile_downstream), end = numeric(takeOut.river_mile_downstream);
  if (start == null || end == null || end <= start) return [];
  const between = (mile: number) => hazardRoutePosition(mile, start, end) === 'inside';
  const stops: FloatStop[] = [];
  for (const point of points) {
    const mile = numeric(point.river_mile_downstream);
    if (mile == null || point.id === putIn.id || point.id === takeOut.id || !point.approved || !between(mile)) continue;
    // A launch is a place to get off the river; a campground on the bank with no
    // ramp is still somewhere to stop for the night.
    if (point.is_float_endpoint !== false) stops.push({ kind: 'access', name: point.name, mile });
    if (isCampground(point)) stops.push({ kind: 'campground', name: point.name, mile });
  }
  for (const poi of sights.pois) {
    const kind = POI_KINDS[poi.type];
    if (kind && between(poi.mile) && !stops.some(stop => stop.kind === kind && normalize(stop.name) === normalize(poi.name))) {
      stops.push({ kind, name: poi.name, mile: poi.mile });
    }
  }
  for (const hazard of sights.hazards) {
    if (between(hazard.mile)) stops.push({ kind: hazard.portage ? 'portage' : 'hazard', name: hazard.name, mile: hazard.mile });
  }
  return stops.sort((a, b) => a.mile - b.mile).slice(0, MAX_STOPS);
}

/** Facilities at either end, in display order. "No fees" only when both ends say so. */
export function routeFacilities(putIn: Access, takeOut: Access): FloatFacility[] {
  const either = (test: (point: Access) => boolean) => test(putIn) || test(takeOut);
  const facilities: FloatFacility[] = [];
  if (either(isCampground)) facilities.push('camping');
  if (either(point => hasAmenity(point, 'restrooms') || hasAmenity(point, 'toilets'))) facilities.push('restrooms');
  if (either(point => hasAmenity(point, 'parking'))) facilities.push('parking');
  if (putIn.fee_required === false && takeOut.fee_required === false) facilities.push('noFees');
  return facilities;
}

export function putInCoordinates(putIn: Access, river: River) {
  const lat = numeric(putIn.driving_lat), lng = numeric(putIn.driving_lng);
  return lat != null && lng != null ? { lat, lng } : accessView(putIn, river).coordinates;
}
