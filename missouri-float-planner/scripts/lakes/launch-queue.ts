/**
 * The lake launch review queue: agency ramp features, Kansas City ramps and
 * Corps recreation areas joined to a lake polygon, deduplicated into places,
 * and matched against access points Eddy already publishes.
 *
 * Produces a QUEUE FOR HUMAN REVIEW. Nothing here is a launch pin, a launch
 * method, or an approval. The rules it enforces are the plan's:
 *
 *   - a Corps recreation area is an ENTRANCE; it is attached to a candidate as
 *     context (and as the carrier of the area's status), never promoted to a
 *     launch itself;
 *   - one physical launch has one identity: a candidate within
 *     EXISTING_MATCH_METERS of an access point Eddy already carries is flagged
 *     to link to it, not to become a second pin;
 *   - the layer's own lake assignment is advisory; the polygon decides, and a
 *     ramp assigned to this lake that sits off the polygon is reported, not
 *     dropped silently.
 */

export type LngLat = [number, number];
/** GeoJSON Polygon rings: outer first, holes after. */
export type PolygonRings = LngLat[][];

export function metersBetween(a: LngLat, b: LngLat): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function pointInRing(point: LngLat, ring: LngLat[]): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function segmentDistanceMeters(p: LngLat, a: LngLat, b: LngLat): number {
  const k = Math.cos((p[1] * Math.PI) / 180);
  const px = p[0] * k; const py = p[1];
  const ax = a[0] * k; const ay = a[1];
  const bx = b[0] * k; const by = b[1];
  const dx = bx - ax; const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) * 111_320;
}

/** 0 when inside any polygon (and not in one of its holes); otherwise metres to the nearest edge. */
export function distanceToPolygonsMeters(point: LngLat, polygons: PolygonRings[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (const rings of polygons) {
    if (rings.length && pointInRing(point, rings[0]) && !rings.slice(1).some((hole) => pointInRing(point, hole))) return 0;
    for (const ring of rings) {
      for (let i = 0; i + 1 < ring.length; i++) best = Math.min(best, segmentDistanceMeters(point, ring[i], ring[i + 1]));
    }
  }
  return best;
}

export type CandidateSource = 'agfc' | 'mdc' | 'nwk';

export interface LaunchCandidate {
  source: CandidateSource;
  source_id: string;
  name: string;
  /** The source's own type word, verbatim ("Boating Access", "Boat Ramp", "Access"). */
  source_type: string | null;
  source_waterbody: string | null;
  agency: string | null;
  lon: number;
  lat: number;
  source_updated_at: string | null;
  ramp_bottom_elev_ft?: number | null;
  ramp_closure_elev_ft?: number | null;
}

export interface RecreationArea {
  area_id: string;
  name: string;
  subtype: string | null;
  lon: number;
  lat: number;
  boat_status: string | null;
  boat_ramps: number | null;
  source_updated_at: string | null;
}

export interface ExistingAccessPoint {
  slug: string;
  name: string;
  river_slug: string;
  lon: number;
  lat: number;
}

export interface QueueOptions {
  lake_slug: string;
  polygons: PolygonRings[];
  candidates: LaunchCandidate[];
  areas: RecreationArea[];
  existing: ExistingAccessPoint[];
  /** Candidates farther than this from the polygon are reported under `off_lake`, not queued. */
  limit_meters?: number;
}

export const EXISTING_MATCH_METERS = 150;
export const AREA_CONTEXT_METERS = 400;
/** A Corps area is an entrance, often a kilometre or more from its ramp; a same-name match may reach this far. */
export const AREA_NAME_MATCH_METERS = 5_000;
export const PLACE_CLUSTER_METERS = 75;
export const DEFAULT_LIMIT_METERS = 500;

const NAME_NOISE = /\b(boat|ramp|ramps|launch|marina|access|area|park|rec|recreation|the|of|city|village|lake|public|use|dock)\b/g;

/** "CRICKET CREEK BOAT RAMP" and "Cricket Creek" are one name. */
export function nameKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(NAME_NOISE, ' ').replace(/\s+/g, ' ').trim();
}

export interface QueuedPlace {
  place_key: string;
  lake_slug: string;
  name: string;
  lon: number;
  lat: number;
  sources: Array<Pick<LaunchCandidate, 'source' | 'source_id' | 'name' | 'source_type' | 'source_waterbody' | 'agency' | 'source_updated_at' | 'ramp_bottom_elev_ft' | 'ramp_closure_elev_ft'> & { distance_to_lake_m: number }>;
  distance_to_lake_m: number;
  nearest_area: (Pick<RecreationArea, 'area_id' | 'name' | 'subtype' | 'boat_status' | 'boat_ramps' | 'source_updated_at'> & { distance_m: number; matched_by: 'distance' | 'name' }) | null;
  existing_access_point: (Pick<ExistingAccessPoint, 'slug' | 'name' | 'river_slug'> & { distance_m: number }) | null;
  /** Always empty here. Launch methods are a human decision (plan §2.4). */
  launch_methods: never[];
  review: string[];
}

export interface LaunchQueue {
  lake_slug: string;
  places: QueuedPlace[];
  /** Candidates whose source assigns them to this lake but which sit beyond the limit. Reported, never dropped silently. Candidates with no claim on this lake are simply elsewhere. */
  off_lake: Array<LaunchCandidate & { distance_to_lake_m: number }>;
  /** Corps areas with a boat status or ramps that no queued place sits near: launches Eddy has no pin for yet. */
  areas_without_candidate: RecreationArea[];
}

const round = (m: number) => Math.round(m);

export function buildLaunchQueue(options: QueueOptions): LaunchQueue {
  const limit = options.limit_meters ?? DEFAULT_LIMIT_METERS;
  const lakeWord = options.lake_slug.split('-')[0].toLowerCase();
  const namesThisLake = (c: LaunchCandidate) => (c.source_waterbody ?? '').toLowerCase().includes(lakeWord);
  const measured = options.candidates.map((c) => ({ ...c, distance_to_lake_m: distanceToPolygonsMeters([c.lon, c.lat], options.polygons) }));
  const near = measured.filter((c) => c.distance_to_lake_m <= limit).sort((a, b) => a.source.localeCompare(b.source) || a.name.localeCompare(b.name));
  // A far candidate is only "off lake" when its source says it is on this lake; a ramp
  // elsewhere in the state with no lake assignment is simply elsewhere.
  const offLake = measured.filter((c) => c.distance_to_lake_m > limit && namesThisLake(c));

  const clusters: Array<typeof near> = [];
  for (const c of near) {
    const home = clusters.find((cl) => metersBetween([c.lon, c.lat], [cl[0].lon, cl[0].lat]) <= PLACE_CLUSTER_METERS);
    if (home) home.push(c); else clusters.push([c]);
  }

  const places: QueuedPlace[] = clusters.map((cl) => {
    const lead = cl[0];
    const point: LngLat = [lead.lon, lead.lat];
    const ranked = options.areas.map((a) => ({ a, d: metersBetween(point, [a.lon, a.lat]) })).sort((x, y) => x.d - y.d);
    const keys = new Set(cl.map((c) => nameKey(c.name)).filter((k) => k.length >= 4));
    const byDistance = ranked[0] && ranked[0].d <= AREA_CONTEXT_METERS ? ranked[0] : null;
    const byName = ranked.find(({ a, d }) => d <= AREA_NAME_MATCH_METERS && keys.has(nameKey(a.name))) ?? null;
    const area = byName && (!byDistance || byName.a.area_id !== byDistance.a.area_id) && (!byDistance || byName.d < byDistance.d || keys.has(nameKey(byName.a.name)))
      ? { ...byName, matched_by: 'name' as const }
      : byDistance ? { ...byDistance, matched_by: 'distance' as const } : null;
    const nearestExisting = options.existing
      .map((e) => ({ e, d: metersBetween(point, [e.lon, e.lat]) }))
      .sort((x, y) => x.d - y.d)[0];
    const review: string[] = [];
    if (nearestExisting && nearestExisting.d <= EXISTING_MATCH_METERS) {
      review.push(`Link to existing access point ${nearestExisting.e.slug} (${round(nearestExisting.d)} m); do not create a second place.`);
    }
    if (lead.distance_to_lake_m > 0) review.push(`Sits ${round(lead.distance_to_lake_m)} m off the lake polygon; confirm the pin is at the water.`);
    if (cl.some((c) => c.source_waterbody && !namesThisLake(c))) {
      review.push(`A source files this place under "${cl.map((c) => c.source_waterbody).filter(Boolean).join('", "')}"; confirm it is on this lake.`);
    }
    if (cl.some((c) => c.source === 'nwk' && (c.ramp_bottom_elev_ft == null || c.ramp_closure_elev_ft == null))) {
      review.push('No elevation thresholds published; the page must say so rather than compare the pool.');
    }
    if (new Set(cl.map((c) => c.source)).size > 1) review.push('Seen by more than one source; keep one place.');
    review.push('Decide launch methods (trailer, hand) from the source type and imagery; the queue does not.');
    return {
      place_key: `${options.lake_slug}:${lead.source}:${lead.source_id}`,
      lake_slug: options.lake_slug,
      name: lead.name,
      lon: lead.lon,
      lat: lead.lat,
      sources: cl.map(({ source, source_id, name, source_type, source_waterbody, agency, source_updated_at, ramp_bottom_elev_ft, ramp_closure_elev_ft, distance_to_lake_m }) =>
        ({ source, source_id, name, source_type, source_waterbody, agency, source_updated_at, ramp_bottom_elev_ft, ramp_closure_elev_ft, distance_to_lake_m: round(distance_to_lake_m) })),
      distance_to_lake_m: round(lead.distance_to_lake_m),
      nearest_area: area
        ? { area_id: area.a.area_id, name: area.a.name, subtype: area.a.subtype, boat_status: area.a.boat_status, boat_ramps: area.a.boat_ramps, source_updated_at: area.a.source_updated_at, distance_m: round(area.d), matched_by: area.matched_by }
        : null,
      existing_access_point: nearestExisting && nearestExisting.d <= EXISTING_MATCH_METERS
        ? { slug: nearestExisting.e.slug, name: nearestExisting.e.name, river_slug: nearestExisting.e.river_slug, distance_m: round(nearestExisting.d) }
        : null,
      launch_methods: [],
      review,
    };
  });

  const covered = new Set(places.map((p) => p.nearest_area?.area_id).filter(Boolean));
  const areasWithoutCandidate = options.areas.filter((a) => !covered.has(a.area_id) && ((a.boat_ramps ?? 0) > 0 || a.boat_status));

  return {
    lake_slug: options.lake_slug,
    places: places.sort((a, b) => a.name.localeCompare(b.name)),
    off_lake: offLake.sort((a, b) => a.distance_to_lake_m - b.distance_to_lake_m).map((c) => ({ ...c, distance_to_lake_m: round(c.distance_to_lake_m) })),
    areas_without_candidate: areasWithoutCandidate.sort((a, b) => a.name.localeCompare(b.name)),
  };
}
