// src/lib/mapbox/directions.ts
// Mapbox Directions API integration for drive time calculations

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

/**
 * Calculates driving time and distance between two points using Mapbox Directions API
 * 
 * @param startLng Start longitude
 * @param startLat Start latitude
 * @param endLng End longitude
 * @param endLat End latitude
 * @returns Drive time result with minutes, miles, and route summary
 */
export async function getDriveTime(
  startLng: number,
  startLat: number,
  endLng: number,
  endLat: number
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

  try {
    const response = await fetch(url.toString(), {
      next: { revalidate: 2592000 }, // Cache for 30 days
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
