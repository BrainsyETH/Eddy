// src/lib/utils/geo.ts
// GeoJSON and geographic utility functions

import type { GeoJSON } from 'geojson';
import type { BBox, Coordinates } from '@/types/geo';
import { MISSOURI_BOUNDS } from '@/constants';

/**
 * Calculates bounding box from a LineString geometry
 */
export function calculateBounds(geometry: GeoJSON.LineString): BBox {
  const coords = geometry.coordinates;
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  for (const [lng, lat] of coords) {
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  }

  return [minLng, minLat, maxLng, maxLat];
}

/**
 * Calculates center point from a LineString geometry
 */
export function calculateCenter(geometry: GeoJSON.LineString): Coordinates {
  const bounds = calculateBounds(geometry);
  return {
    lng: (bounds[0] + bounds[2]) / 2,
    lat: (bounds[1] + bounds[3]) / 2,
  };
}

/**
 * Converts PostGIS geometry to GeoJSON
 */
export function postgisToGeoJSON(geom: unknown): GeoJSON.Geometry {
  // PostGIS returns geometry as GeoJSON already when using ST_AsGeoJSON
  // This is a type-safe wrapper
  return geom as GeoJSON.Geometry;
}

/**
 * Converts coordinates array to GeoJSON Point
 */
export function coordinatesToPoint(coords: Coordinates): GeoJSON.Point {
  return {
    type: 'Point',
    coordinates: [coords.lng, coords.lat],
  };
}

/**
 * Converts GeoJSON Point to coordinates
 */
export function pointToCoordinates(point: GeoJSON.Point): Coordinates {
  const [lng, lat] = point.coordinates;
  return { lng, lat };
}

// Re-export MISSOURI_BOUNDS from constants for backwards compatibility
export { MISSOURI_BOUNDS } from '@/constants';

/**
 * Validates coordinates are within Missouri bounds
 */
export function isValidMissouriCoord(lat: number, lng: number): boolean {
  return (
    lat >= MISSOURI_BOUNDS.minLat &&
    lat <= MISSOURI_BOUNDS.maxLat &&
    lng >= MISSOURI_BOUNDS.minLng &&
    lng <= MISSOURI_BOUNDS.maxLng
  );
}

/**
 * Type guard for GeoJSON Point coordinates extraction
 */
export function getPointCoordinates(geom: unknown): Coordinates | null {
  if (!geom || typeof geom !== 'object') return null;
  const geo = geom as { type?: string; coordinates?: [number, number] };
  if (geo.type === 'Point' && Array.isArray(geo.coordinates) && geo.coordinates.length >= 2) {
    return { lng: geo.coordinates[0], lat: geo.coordinates[1] };
  }
  return null;
}
