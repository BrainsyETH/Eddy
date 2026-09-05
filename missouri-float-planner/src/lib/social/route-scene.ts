// Assemble the truthful geographic payload for the scrolling Remotion route.

import type { Section } from './section-picker';
import {
  progressAlongRoute,
  sampleRouteCoordinates,
  validRouteCoordinates,
  type LngLat,
  type RoutePointKind,
  type SocialRoutePoint,
  type UnanchoredRoutePoint,
} from '@shared/social-route-journey';

export type SocialRouteScene = {
  /** The exact PostGIS channel, simplified for payload size. ABSENT when the
   *  database has no drawable line for this section — the reel then renders
   *  its non-geographic itinerary from routePoints instead of inventing one. */
  routeCoordinates?: LngLat[];
  /** Every feature on the float in order. Coordinate-backed features are
   *  pinned to the channel by arc length; without a channel, by mile fraction
   *  (which orders them correctly for the itinerary, and is never drawn as a
   *  map position). */
  routePoints: SocialRoutePoint[];
  /** Mile-only features: named once as "also along this float", never pinned. */
  unanchoredPoints: UnanchoredRoutePoint[];
};

type GeoJsonPoint = { coordinates?: number[] } | null;

const numberOrNull = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const pointCoordinates = (value: unknown): LngLat | null => {
  const coordinates = (value as GeoJsonPoint)?.coordinates;
  return Array.isArray(coordinates) && Number.isFinite(coordinates[0]) && Number.isFinite(coordinates[1])
    ? [coordinates[0], coordinates[1]]
    : null;
};

const fallbackProgress = (mile: number, section: Section): number =>
  Math.max(0, Math.min(1, (mile - section.putInMile) / Math.max(section.takeOutMile - section.putInMile, 0.01)));

function locatedProgress(
  coordinates: ReadonlyArray<LngLat>,
  location: LngLat | null,
  mile: number,
  section: Section,
): number {
  return progressAlongRoute(coordinates, location) ?? fallbackProgress(mile, section);
}

function accessKind(row: { type?: string | null; types?: string[] | null }): RoutePointKind {
  const types = Array.isArray(row.types) ? row.types : [];
  return row.type === 'campground' || types.includes('campground') || types.includes('float_camp')
    ? 'campground'
    : 'access';
}

/**
 * The exact channel between the two access points, or [] when PostGIS cannot
 * supply one. Never a reconstructed line: the reel draws what the database
 * knows, and says so when it knows less.
 */
async function loadSegment(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  section: Section,
): Promise<LngLat[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: segment, error: segmentError } = await (supabase.rpc as any)('get_float_segment', {
    p_start_access_id: section.putInId,
    p_end_access_id: section.takeOutId,
  });
  const rawCoordinates = validRouteCoordinates(segment?.[0]?.segment_geom?.coordinates);
  if (segmentError || rawCoordinates.length < 2) {
    console.warn('[SocialRoute] exact geometry unavailable; rendering the itinerary instead', segmentError?.message || 'empty LineString');
    return [];
  }
  return rawCoordinates;
}

/**
 * Returns null only when a route-point query fails: a float presented as
 * "what you pass" cannot silently lose a whole data source — especially the
 * hazards — so the caller then renders the two-stop factual card and the
 * omission is observable. Missing geometry is NOT a failure: the stops are
 * still fetched, ordered by mile, and the reel renders its itinerary.
 */
export async function buildSocialRouteScene(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  section: Section,
): Promise<SocialRouteScene | null> {
  const rawCoordinates = await loadSegment(supabase, section);
  const minMile = Math.min(section.putInMile, section.takeOutMile);
  const maxMile = Math.max(section.putInMile, section.takeOutMile);

  const [accessResult, poiResult, hazardResult] = await Promise.all([
    supabase
      .from('access_points')
      .select('id, name, river_mile_downstream, type, types, description, location_orig, location_snap')
      .eq('river_id', section.riverId)
      .eq('is_public', true)
      .eq('approved', true)
      .gt('river_mile_downstream', minMile)
      .lt('river_mile_downstream', maxMile)
      .order('river_mile_downstream'),
    supabase
      .from('points_of_interest')
      .select('id, name, type, description, river_mile, latitude, longitude')
      .eq('river_id', section.riverId)
      .eq('active', true)
      .eq('is_on_water', true)
      .gt('river_mile', minMile)
      .lt('river_mile', maxMile)
      .order('river_mile'),
    supabase
      .from('river_hazards')
      .select('id, name, type, description, severity, river_mile_downstream, location, portage_required')
      .eq('river_id', section.riverId)
      .eq('active', true)
      .gt('river_mile_downstream', minMile)
      .lt('river_mile_downstream', maxMile)
      .order('river_mile_downstream'),
  ]);

  const routeDataError = accessResult.error || poiResult.error || hazardResult.error;
  if (routeDataError) {
    console.warn('[SocialRoute] route-point query failed; using the two-stop section card', routeDataError.message);
    return null;
  }

  const points: SocialRoutePoint[] = [
    {
      id: section.putInId,
      name: section.putInName,
      kind: 'put_in',
      riverMile: section.putInMile,
      progress: 0,
      detail: 'Put-in',
    },
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (accessResult.data || []) as any[]) {
    const mile = numberOrNull(row.river_mile_downstream);
    if (mile === null) continue;
    const location = pointCoordinates(row.location_snap) ?? pointCoordinates(row.location_orig);
    points.push({
      id: row.id,
      name: row.name,
      kind: accessKind(row),
      riverMile: mile,
      progress: locatedProgress(rawCoordinates, location, mile, section),
      detail: accessKind(row) === 'campground' ? 'Campground & access' : 'River access',
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (poiResult.data || []) as any[]) {
    const mile = numberOrNull(row.river_mile);
    if (mile === null) continue;
    const location = Number.isFinite(row.longitude) && Number.isFinite(row.latitude)
      ? [row.longitude, row.latitude] as LngLat
      : null;
    points.push({
      id: row.id,
      name: row.name,
      kind: row.type === 'spring' ? 'spring' : 'poi',
      riverMile: mile,
      progress: locatedProgress(rawCoordinates, location, mile, section),
      detail: humanize(row.type || 'Point of interest'),
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (hazardResult.data || []) as any[]) {
    const mile = numberOrNull(row.river_mile_downstream);
    if (mile === null) continue;
    points.push({
      id: row.id,
      name: row.name,
      kind: 'hazard',
      riverMile: mile,
      progress: locatedProgress(rawCoordinates, pointCoordinates(row.location), mile, section),
      detail: row.portage_required ? 'Portage required' : humanize(row.type || 'Hazard'),
      severity: row.severity || 'caution',
    });
  }

  points.push({
    id: section.takeOutId,
    name: section.takeOutName,
    kind: 'take_out',
    riverMile: section.takeOutMile,
    progress: 1,
    detail: 'Take-out',
  });

  // The same spring can exist in curated mile markers and the POI table. Keep
  // the mapped record, then collapse near-identical name/mile duplicates.
  const deduped = new Map<string, SocialRoutePoint>();
  for (const point of points.sort((a, b) => a.progress - b.progress || priority(a.kind) - priority(b.kind))) {
    const key = `${point.name.toLowerCase().replace(/\W/g, '')}:${point.riverMile.toFixed(1)}`;
    if (!deduped.has(key)) deduped.set(key, point);
  }
  const routePoints = Array.from(deduped.values()).sort((a, b) => a.progress - b.progress);

  // Guidebook springs (section.springs, from floatmissouri_mile_markers.json)
  // carry a river mile only, on the guidebook's own mile scale, which disagrees
  // with access_points' by more than a mile in places (Powder Mill: 58.7 vs
  // 60.73). Pinning one by mile-fraction puts a named spring in the wrong bend
  // of a line that is otherwise exact, and pausing at it by mile can fire it
  // out of order with the mapped stops. So they are NOT pinned or paused: the
  // reel names them once, marked approximate. A spring the POI table already
  // maps is dropped here so it is not said twice.
  const mapped = new Set(routePoints.map((point) => nameKey(point.name)));
  const unanchoredPoints: UnanchoredRoutePoint[] = section.springs
    .filter((spring) => !mapped.has(nameKey(spring.name)))
    .sort((a, b) => a.mile - b.mile)
    .map((spring) => ({
      id: `spring-${section.riverSlug}-${spring.mile}`,
      name: spring.name,
      kind: 'spring',
      riverMile: spring.mile,
      detail: spring.side ? `Spring · river ${spring.side}` : 'Spring',
    }));

  return {
    routeCoordinates: rawCoordinates.length >= 2 ? sampleRouteCoordinates(rawCoordinates, 180) : undefined,
    routePoints,
    unanchoredPoints,
  };
}

function nameKey(name: string): string {
  return name.toLowerCase().replace(/\W/g, '');
}

function priority(kind: RoutePointKind): number {
  return kind === 'hazard' ? 0 : kind === 'spring' ? 2 : 1;
}

function humanize(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
