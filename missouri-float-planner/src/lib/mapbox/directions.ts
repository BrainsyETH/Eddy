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

export interface MapboxGeocodingResponse {
  features: Array<{
    center: [number, number]; // [lng, lat]
    place_name: string;
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
 * How far a geocoded result may sit from the point it is supposed to describe.
 *
 * A `directions_override` is a driving address for a place we ALREADY have
 * coordinates for — it exists to move a route's endpoint from mid-river to the
 * parking lot, which is a matter of a mile or two. 25 is loose enough for a
 * remote access reached by a long county road and tight enough that a match in
 * the wrong state cannot survive it.
 */
const GEOCODE_MAX_DRIFT_MILES = 25;

const EARTH_RADIUS_MILES = 3958.8;

/** Great-circle distance in miles. */
function haversineMiles(
  [lngA, latA]: [number, number],
  [lngB, latB]: [number, number],
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(latB - latA);
  const dLng = toRad(lngB - lngA);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(latA)) * Math.cos(toRad(latB)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Geocodes an address to coordinates using Mapbox Geocoding API
 *
 * @param address The address or place name to geocode
 * @param near Coordinates the answer must be close to — the access point's own
 *   position. STRONGLY RECOMMENDED. Without it this returns whatever Mapbox
 *   ranked first, which is how the drive-time cache came to hold Two Rivers,
 *   MO → Tan Vat at 1,689 miles by way of I-90: there is a Two Rivers in
 *   Wisconsin, `proximity` is only a soft bias with no `bbox` behind it, and
 *   nothing downstream questioned the number. A rejected result is far better
 *   than a confident wrong one — the caller falls back to the coordinates it
 *   already had, which is exactly what the other 372 access points use.
 * @returns Coordinates [lng, lat] or null if not found or implausible
 */
export async function geocodeAddress(
  address: string,
  near?: { lng: number; lat: number } | null,
): Promise<[number, number] | null> {
  const accessToken = process.env.MAPBOX_ACCESS_TOKEN;

  if (!accessToken) {
    throw new Error('MAPBOX_ACCESS_TOKEN environment variable is not set');
  }

  const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json`);
  url.searchParams.set('access_token', accessToken);
  url.searchParams.set('limit', '1');
  // Bias results toward the point we are anchored to, falling back to the
  // centre of the Ozarks. Still only a bias — the check below is the guarantee.
  url.searchParams.set('proximity', near ? `${near.lng},${near.lat}` : '-91.5,37.5');
  url.searchParams.set('country', 'US');

  try {
    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10_000),
      next: { revalidate: CACHE_NORMAL }, // Cache for 30 days
    });

    if (!response.ok) {
      console.error('Mapbox Geocoding API error:', response.status);
      return null;
    }

    const data = await response.json() as MapboxGeocodingResponse;

    if (!data.features || data.features.length === 0) {
      console.warn('No geocoding results for:', address);
      return null;
    }

    const center = data.features[0].center;

    if (near) {
      const drift = haversineMiles(center, [near.lng, near.lat]);
      if (drift > GEOCODE_MAX_DRIFT_MILES) {
        console.warn(
          `[Geocode] Rejected "${address}" → ${data.features[0].place_name}: ` +
            `${drift.toFixed(0)} mi from the access point (max ${GEOCODE_MAX_DRIFT_MILES}).`,
        );
        return null;
      }
    }

    return center;
  } catch (error) {
    console.error('Error geocoding address:', error);
    return null;
  }
}

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
      signal: AbortSignal.timeout(10_000),
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
