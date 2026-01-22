// src/lib/utils/geo.ts
// GeoJSON and geographic utility functions

import type { GeoJSON } from 'geojson';
import type { BBox, Coordinates } from '@/types/geo';

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
export function postgisToGeoJSON(geom: any): GeoJSON.Geometry {
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
