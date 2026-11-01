// What a Find a Float card shows besides time and conditions: what each end
// offers, outfitters on the river and how they relate to this float, what lies
// between the ends, and cautions sorted by where they apply.
//
// All of it is enrichment. A failed read here drops the facts from the card and
// never the route from the results, so each loader resolves empty on error.

import type {
  FloatCaution, FloatEndpointFacts, FloatFacility, FloatOutfitter, FloatOutfitterMatch, FloatOutfitterOffer, FloatStop, FloatStopKind,
} from '@shared/float-search';
import { geographicMiles } from '@shared/float-search';
import { hazardRoutePosition } from '@shared/route-hazards';
import { accessView, checked, normalize, numeric, type Access, type DataContext, type River } from './data';
import { ALERT_SCOPE_SUFFIX } from './recommendation';

const OFFERS: Record<string, FloatOutfitterOffer> = {
  shuttle: 'shuttle',
  canoe_rental: 'canoe',
  kayak_rental: 'kayak',
  raft_rental: 'raft',
  tube_rental: 'tube',
};
const OPERATING = new Set(['active', 'seasonal']);
/** Route details lists this many; the card names at most one, and only a listed run. */
export const MAX_ROUTE_OUTFITTERS = 4;
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
  /** The runs this business lists on this river, direction kept: from → to. */
  runs: Array<{ from: string; to: string }>;
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
  const offers = (['shuttle', 'canoe', 'kayak', 'raft', 'tube'] as const)
    .filter(offer => offered.some(key => OFFERS[key] === offer));
  if (!offers.length) return null;
  const lat = numeric(s.latitude), lng = numeric(s.longitude);
  const listed = Array.isArray(row.routes) ? row.routes as Array<{ putIn?: unknown; takeOut?: unknown }> : [];
  return {
    id: s.id,
    name: s.name,
    offers,
    website: s.website ?? null,
    phone: s.phone ?? null,
    point: lat != null && lng != null ? { lat, lng } : null,
    runs: listed.flatMap(run => typeof run.putIn === 'string' && typeof run.takeOut === 'string' && run.putIn.trim() && run.takeOut.trim()
      ? [{ from: run.putIn, to: run.takeOut }] : []),
  };
}

/**
 * The river access a run's free-text end names, or null when it names none or
 * several. Exact name first; otherwise one name containing the other ("Akers"
 * ↔ "Akers Ferry"), and only when exactly one access matches.
 */
export function resolveRunEnd(name: string, points: Pick<Access, 'id' | 'name' | 'river_mile_downstream'>[]) {
  const key = normalize(name);
  if (key.length < 4) return null;
  const exact = points.filter(point => normalize(point.name) === key);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const loose = points.filter(point => {
    const candidate = normalize(point.name);
    return candidate.length >= 4 && (candidate.includes(key) || key.includes(candidate));
  });
  return loose.length === 1 ? loose[0] : null;
}

/** How a business's listed runs relate to this float. Direction matters: a run that ends at our put-in does not serve it. */
export function outfitterMatch(
  outfitter: Pick<RiverOutfitter, 'runs'>,
  points: Pick<Access, 'id' | 'name' | 'river_mile_downstream'>[],
  putIn: Pick<Access, 'id' | 'river_mile_downstream'>,
  takeOut: Pick<Access, 'id' | 'river_mile_downstream'>,
): FloatOutfitterMatch {
  const start = numeric(putIn.river_mile_downstream), end = numeric(takeOut.river_mile_downstream);
  let best: FloatOutfitterMatch = 'river';
  for (const run of outfitter.runs) {
    const from = resolveRunEnd(run.from, points), to = resolveRunEnd(run.to, points);
    if (!from || !to) continue;
    if (from.id === putIn.id && to.id === takeOut.id) return 'run';
    const runStart = numeric(from.river_mile_downstream), runEnd = numeric(to.river_mile_downstream);
    if (start != null && end != null && runStart != null && runEnd != null && runStart < runEnd && runStart <= start && runEnd >= end) best = 'stretch';
  }
  return best;
}

const MATCH_RANK: Record<FloatOutfitterMatch, number> = { run: 0, stretch: 1, river: 2 };

/**
 * Most relevant first: one listing this exact float, then a listed run that
 * covers it, then one renting the boat being searched for, then the nearest to
 * the put-in. Directory facts, not live availability.
 */
export function routeOutfitters(
  outfitters: RiverOutfitter[],
  points: Pick<Access, 'id' | 'name' | 'river_mile_downstream'>[],
  putIn: Pick<Access, 'id' | 'river_mile_downstream'>,
  takeOut: Pick<Access, 'id' | 'river_mile_downstream'>,
  putInPoint: { lat: number; lng: number } | null,
  vessel: string,
): FloatOutfitter[] {
  const rents = (o: RiverOutfitter) => o.offers.includes(vessel as FloatOutfitterOffer);
  return outfitters
    .map(o => ({
      o,
      match: outfitterMatch(o, points, putIn, takeOut),
      miles: putInPoint && o.point ? geographicMiles(putInPoint, o.point) : Infinity,
    }))
    .sort((a, b) => MATCH_RANK[a.match] - MATCH_RANK[b.match] || Number(rents(b.o)) - Number(rents(a.o)) || a.miles - b.miles || a.o.name.localeCompare(b.o.name))
    .slice(0, MAX_ROUTE_OUTFITTERS)
    .map(({ o, match }) => ({ id: o.id, name: o.name, offers: o.offers, website: o.website, phone: o.phone, match }));
}

export interface RiverSights {
  pois: Array<{ name: string; type: string; mile: number }>;
  hazards: Array<{ id: string; name: string; mile: number; portage: boolean }>;
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
        const rows = (await ctx.hazards(riverId)) as Array<{ id: string; name: string | null; portage_required: boolean | null; river_mile_downstream: unknown }>;
        return rows.flatMap(row => {
          const mile = numeric(row.river_mile_downstream);
          return mile == null ? [] : [{ id: row.id, name: row.name ?? 'Hazard', mile, portage: row.portage_required === true }];
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

/**
 * Everything strictly between the ends, in river order. Accesses and
 * campgrounds carry their public status, so a private one is labeled rather than
 * counted as a place to get off. Endpoint hazards are the cautions' job.
 */
export function routeStops(points: Access[], sights: RiverSights, putIn: Access, takeOut: Access): FloatStop[] {
  const start = numeric(putIn.river_mile_downstream), end = numeric(takeOut.river_mile_downstream);
  if (start == null || end == null || end <= start) return [];
  const between = (mile: number) => hazardRoutePosition(mile, start, end) === 'inside';
  const stops: FloatStop[] = [];
  for (const point of points) {
    const mile = numeric(point.river_mile_downstream);
    if (mile == null || point.id === putIn.id || point.id === takeOut.id || !point.approved || !between(mile)) continue;
    const isPublic = point.is_public ?? null;
    if (point.is_float_endpoint !== false) stops.push({ kind: 'access', name: point.name, mile, isPublic });
    if (isCampground(point)) stops.push({ kind: 'campground', name: point.name, mile, isPublic });
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

/** What one end offers, kept per end so the card can say where the restroom is. */
export function endpointFacts(point: Access): FloatEndpointFacts {
  const facilities: FloatFacility[] = [];
  if (isCampground(point)) facilities.push('camping');
  if (hasAmenity(point, 'restrooms') || hasAmenity(point, 'toilets')) facilities.push('restrooms');
  if (hasAmenity(point, 'parking')) facilities.push('parking');
  return { facilities, feeRequired: point.fee_required ?? null };
}

export function putInCoordinates(putIn: Access, river: River) {
  const lat = numeric(putIn.driving_lat), lng = numeric(putIn.driving_lng);
  return lat != null && lng != null ? { lat, lng } : accessView(putIn, river).coordinates;
}


/**
 * A structured caution from a recommendation reason, by its code: never by
 * cutting prose at a colon, which would turn "notice not matched to this
 * stretch" into what looks like a confirmed problem on the float.
 */
export function cautionItem(reason: { code: string; message: string; sourceId?: string }, hazardNames: Map<string, string> = new Map()): FloatCaution {
  const { code, message } = reason;
  // Hazard reasons name their hazard by id; without the record, say what it is generically.
  const hazard = (reason.sourceId && hazardNames.get(reason.sourceId)) || 'Recorded hazard';
  switch (code) {
    case 'portage_required':
      return { scope: 'route', summary: `${hazard}: portage required`, detail: message };
    case 'recorded_hazard':
      return { scope: 'route', summary: hazard === 'Recorded hazard' ? hazard : `${hazard}: recorded hazard`, detail: message };
    case 'hazard_location_unknown':
      return { scope: 'check', summary: `${hazard}: location unknown`, detail: message };
    case 'hazard_at_endpoint':
      return { scope: 'endpoint', summary: message.replace(/\.$/, ''), detail: message };
    case 'alert_scope_unverified':
      return {
        scope: 'area',
        summary: message.endsWith(ALERT_SCOPE_SUFFIX) ? message.slice(0, -ALERT_SCOPE_SUFFIX.length) : message,
        detail: message,
      };
    case 'alert_source_incomplete':
      return { scope: 'check', summary: 'Official notices could not all be checked', detail: message };
    case 'forecast_incomplete':
      return { scope: 'check', summary: 'Forecast incomplete for your date', detail: message };
    default:
      return { scope: 'check', summary: message.length > 80 ? 'Check route cautions before going' : message.replace(/\.$/, ''), detail: message };
  }
}
