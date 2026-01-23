// src/lib/mapbox/directions.ts
// Mapbox Directions API integration for drive time calculations

import type { ConditionCode } from '@/types/api';

export interface MapboxRoute {
  duration: number; // seconds
  distance: number; // meters
  geometry: {
    coordinates: number[][]; // [lng, lat] pairs
    type: 'LineString';
  };
  legs: Array<{
    duration: number;
    distance: number;
    summary: string;
  }>;
}

export interface MapboxDirectionsResponse {
  code: string;
  routes: MapboxRoute[];
  waypoints: Array<{
    location: [number, number];
    name: string;
  }>;
}

export interface DriveTimeResult {
  minutes: number;
  miles: number;
  routeSummary: string | null;
  geometry: GeoJSON.LineString | null;
}

// Cache durations in seconds
const CACHE_NORMAL = 2592000; // 30 days for normal conditions
const CACHE_DANGEROUS = 3600; // 1 hour for high/dangerous conditions (potential road closures)

/**
 * Calculates driving time and distance between two points using Mapbox Directions API
 * 
 * @param startLng Start longitude
 * @param startLat Start latitude
 * @param endLng End longitude
 * @param endLat End latitude
 * @param conditionCode Optional river condition code - if 'high' or 'dangerous', 
 *                      cache is reduced to 1 hour due to potential road/bridge closures
 * @returns Drive time result with minutes, miles, and route summary
 */
export async function getDriveTime(
  startLng: number,
  startLat: number,
  endLng: number,
  endLat: number,
  conditionCode?: ConditionCode
): Promise<DriveTimeResult> {
  const accessToken = process.env.MAPBOX_ACCESS_TOKEN;

  if (!accessToken) {
    throw new Error('MAPBOX_ACCESS_TOKEN environment variable is not set');
  }

  // Mapbox Directions API format: {lng},{lat};{lng},{lat}
  const coordinates = `${startLng},${startLat};${endLng},${endLat}`;
  const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}`);
  url.searchParams.set('access_token', accessToken);
  url.searchParams.set('geometries', 'geojson');
  url.searchParams.set('overview', 'full');
  url.searchParams.set('steps', 'false');

  // Determine cache duration based on river conditions
  // During high water or dangerous conditions, roads/bridges may be closed
  // so we need fresher routing data
  const isDangerousConditions = conditionCode === 'high' || conditionCode === 'dangerous';
  const revalidateTime = isDangerousConditions ? CACHE_DANGEROUS : CACHE_NORMAL;

  try {
    const response = await fetch(url.toString(), {
      next: { revalidate: revalidateTime },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Mapbox API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as MapboxDirectionsResponse;

    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      throw new Error('No route found');
    }

    const route = data.routes[0];
    const durationMinutes = Math.round(route.duration / 60);
    const distanceMiles = route.distance / 1609.34; // Convert meters to miles
    const routeSummary = route.legs[0]?.summary || null;

    return {
      minutes: durationMinutes,
      miles: Math.round(distanceMiles * 100) / 100,
      routeSummary,
      geometry: route.geometry as GeoJSON.LineString,
    };
  } catch (error) {
    console.error('Error fetching Mapbox directions:', error);
    throw error;
  }
}
