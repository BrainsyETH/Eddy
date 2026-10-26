import type { PointOfInterest, POIType } from '@/types/nps';
import type { MODataset } from '@/lib/usgs/mo-statewide-data';

/** Overview pins are places, never authoritative routing endpoints. */
export interface PlannerMapPlace {
  id: string;
  name: string;
  slug: string;
  riverId: string;
  riverSlug: string;
  riverName: string;
  coordinates: { lng: number; lat: number };
}

export function plannerMapPlaces(dataset: MODataset | undefined): PlannerMapPlace[] {
  const seen = new Set<string>();
  return (dataset?.rivers ?? []).flatMap(river => (river.access_points ?? []).flatMap(point => {
    const key = `${river.id}:${point.id}`;
    if (seen.has(key) || !Number.isFinite(point.lon) || !Number.isFinite(point.lat)
      || Math.abs(point.lon) > 180 || Math.abs(point.lat) > 90) return [];
    seen.add(key);
    return [{ id: point.id, name: point.name, slug: point.slug, riverId: river.id,
      riverSlug: river.slug, riverName: river.name, coordinates: { lng: point.lon, lat: point.lat } }];
  }));
}

export function matchesMapSearch(query: string, ...values: (string | null | undefined)[]): boolean {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
  const text = normalize(values.filter(Boolean).join(' '));
  return normalize(query).trim().split(/\s+/).every(word => text.includes(word));
}

export function plannerMapPois(dataset: MODataset | undefined): PointOfInterest[] {
  const seen = new Set<string>();
  const types = new Set<POIType>(['spring', 'cave', 'historical_site', 'scenic_viewpoint', 'waterfall', 'geological', 'float_camp', 'outfitter', 'other']);
  return (dataset?.rivers ?? []).flatMap(river => (river.pois ?? []).flatMap(poi => {
    if (seen.has(poi.id) || !Number.isFinite(poi.lon) || !Number.isFinite(poi.lat)
      || Math.abs(poi.lon) > 180 || Math.abs(poi.lat) > 90) return [];
    seen.add(poi.id);
    return [{ id: poi.id, riverId: river.id, name: poi.name, slug: poi.slug,
      description: poi.description, bodyText: null, type: types.has(poi.type as POIType) ? poi.type as POIType : 'other',
      source: 'manual' as const, npsUrl: poi.nps_url, latitude: poi.lat, longitude: poi.lon,
      riverMile: poi.river_mile, images: [], amenities: [], active: true, isOnWater: poi.river_mile !== null }];
  }));
}
