// Assemble the truthful geographic payload for the scrolling Remotion route.

import type { Section } from './section-picker';
import {
  progressAlongRoute,
  sampleRouteCoordinates,
  validRouteCoordinates,
  type LngLat,
  type RoutePointKind,
  type SocialRoutePoint,
} from '@shared/social-route-journey';

export type SocialRouteScene = {
  routeCoordinates: LngLat[];
  routePoints: SocialRoutePoint[];
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
 * Returns null when PostGIS cannot supply a drawable line. The caller then
 * selects the static section composition; it must never invent a fallback path.
 */
export async function buildSocialRouteScene(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  section: Section,
): Promise<SocialRouteScene | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: segment, error: segmentError } = await (supabase.rpc as any)('get_float_segment', {
    p_start_access_id: section.putInId,
    p_end_access_id: section.takeOutId,
  });
  const rawCoordinates = validRouteCoordinates(segment?.[0]?.segment_geom?.coordinates);
  if (segmentError || rawCoordinates.length < 2) {
    console.warn('[SocialRoute] exact geometry unavailable; using static section reel', segmentError?.message || 'empty LineString');
    return null;
  }
  const routeCoordinates = sampleRouteCoordinates(rawCoordinates, 180);
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
    // A route presented as "what you pass" cannot silently lose a whole data
    // source—especially hazards. Use the static factual card for this post and
    // make the omission observable instead.
    console.warn('[SocialRoute] route-point query failed; using static section reel', routeDataError.message);
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
      detail: accessKind(row) === 'campground' ? 'Campground & river access' : 'River access',
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

  // Mile-marker springs fill gaps where the POI table has no mapped feature.
  for (const spring of section.springs) {
    points.push({
      id: `spring-${section.riverSlug}-${spring.mile}`,
      name: spring.name,
      kind: 'spring',
      riverMile: spring.mile,
      progress: fallbackProgress(spring.mile, section),
      detail: spring.side ? `Spring · river ${spring.side}` : 'Spring',
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
  return { routeCoordinates, routePoints: Array.from(deduped.values()).sort((a, b) => a.progress - b.progress) };
}

function priority(kind: RoutePointKind): number {
  return kind === 'hazard' ? 0 : kind === 'spring' ? 2 : 1;
}

function humanize(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
