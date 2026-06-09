// src/lib/usfs/ridb.ts
// RIDB (Recreation Information Database) API client
// Fetches USFS campground, facility, and recreation data from Recreation.gov
// Docs: https://ridb.recreation.gov/docs

import type {
  RIDBPaginatedResponse,
  RIDBFacility,
  RIDBRecArea,
  RIDBCampsite,
} from '@/types/ridb';

const RIDB_API_BASE = 'https://ridb.recreation.gov/api/v1';

function getApiKey(): string {
  const key = process.env.RIDB_API_KEY;
  if (!key) {
    throw new Error('RIDB_API_KEY environment variable is not set');
  }
  return key;
}

/**
 * Generic RIDB API fetch helper
 */
async function fetchRIDB<T>(
  endpoint: string,
  params: Record<string, string> = {}
): Promise<RIDBPaginatedResponse<T>> {
  const apiKey = getApiKey();
  const url = new URL(`${RIDB_API_BASE}/${endpoint}`);

  url.searchParams.set('apikey', apiKey);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`RIDB API error ${response.status}: ${text}`);
  }

  return response.json();
}

// ─────────────────────────────────────────────────────────────
// Recreation Areas
// ─────────────────────────────────────────────────────────────

/**
 * Search for recreation areas by state and optional query
 */
export async function fetchRecAreas(
  params: { state?: string; query?: string; limit?: number; offset?: number } = {}
): Promise<RIDBRecArea[]> {
  const queryParams: Record<string, string> = {
    limit: String(params.limit || 50),
    offset: String(params.offset || 0),
  };
  if (params.state) queryParams.state = params.state;
  if (params.query) queryParams.query = params.query;

  const response = await fetchRIDB<RIDBRecArea>('recareas', queryParams);
  return response.RECDATA;
}

// ─────────────────────────────────────────────────────────────
// Facilities (Campgrounds, Day Use, Trailheads, etc.)
// ─────────────────────────────────────────────────────────────

/**
 * Fetch facilities for a specific recreation area
 */
export async function fetchFacilitiesByRecArea(
  recAreaId: string,
  params: { limit?: number; offset?: number } = {}
): Promise<RIDBFacility[]> {
  const queryParams: Record<string, string> = {
    limit: String(params.limit || 50),
    offset: String(params.offset || 0),
  };

  const response = await fetchRIDB<RIDBFacility>(
    `recareas/${recAreaId}/facilities`,
    queryParams
  );
  return response.RECDATA;
}

/**
 * Search facilities by proximity to a lat/lng point.
 * This is the key method for finding USFS campgrounds near rivers.
 *
 * @param lat - Latitude of center point
 * @param lng - Longitude of center point
 * @param radius - Search radius in miles
 * @param params - Additional filter parameters
 */
export async function fetchFacilitiesByProximity(
  lat: number,
  lng: number,
  radius: number,
  params: { activity?: string; limit?: number; offset?: number } = {}
): Promise<RIDBFacility[]> {
  const queryParams: Record<string, string> = {
    latitude: String(lat),
    longitude: String(lng),
    radius: String(radius),
    limit: String(params.limit || 50),
    offset: String(params.offset || 0),
    full: 'true', // Include nested ORGANIZATION/ACTIVITY arrays
  };
  if (params.activity) queryParams.activity = params.activity;

  const response = await fetchRIDB<RIDBFacility>('facilities', queryParams);
  return response.RECDATA;
}

/**
 * Fetch a single facility by ID (includes full detail)
 */
export async function fetchFacility(facilityId: string): Promise<RIDBFacility | null> {
  try {
    const apiKey = getApiKey();
    const url = new URL(`${RIDB_API_BASE}/facilities/${facilityId}`);
    url.searchParams.set('apikey', apiKey);

    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });

    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

/**
 * Search all facilities by state with optional query
 */
export async function fetchFacilitiesByState(
  state: string,
  params: { query?: string; activity?: string; limit?: number; offset?: number } = {}
): Promise<RIDBFacility[]> {
  const queryParams: Record<string, string> = {
    state,
    limit: String(params.limit || 50),
    offset: String(params.offset || 0),
  };
  if (params.query) queryParams.query = params.query;
  if (params.activity) queryParams.activity = params.activity;

  const response = await fetchRIDB<RIDBFacility>('facilities', queryParams);
  return response.RECDATA;
}

// ─────────────────────────────────────────────────────────────
// Campsites (individual sites within a facility)
// ─────────────────────────────────────────────────────────────

/**
 * Fetch all campsites for a facility
 */
export async function fetchCampsites(
  facilityId: string,
  params: { limit?: number; offset?: number } = {}
): Promise<RIDBCampsite[]> {
  const queryParams: Record<string, string> = {
    limit: String(params.limit || 100),
    offset: String(params.offset || 0),
  };

  const response = await fetchRIDB<RIDBCampsite>(
    `facilities/${facilityId}/campsites`,
    queryParams
  );
  return response.RECDATA;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Check if a facility is a campground based on its type or activities
 */
export function isCampground(facility: RIDBFacility): boolean {
  const type = (facility.FacilityTypeDescription || '').toLowerCase();
  if (type.includes('campground') || type.includes('camping')) return true;

  const activities = facility.ACTIVITY || [];
  return activities.some(
    (a) => a.ActivityName.toLowerCase().includes('camping')
  );
}

/**
 * Check if a facility is managed by the U.S. Forest Service.
 * Checks ParentOrgID (top-level, always present) and ORGANIZATION array
 * (only populated when full=true is used in the query).
 */
export function isUSFS(facility: RIDBFacility): boolean {
  // ParentOrgID "131" = USDA Forest Service in RIDB
  if (facility.ParentOrgID === '131') return true;

  // Fallback: check nested ORGANIZATION array (requires full=true)
  const orgs = facility.ORGANIZATION || [];
  return orgs.some((o) => {
    if (o.OrgParentID === '131') return true;
    const name = (o.OrgName || '').toLowerCase();
    const type = (o.OrgType || '').toLowerCase();
    const abbrev = (o.OrgAbbrevName || '').toLowerCase();
    return (
      type === 'usda' ||
      abbrev === 'fs' ||
      abbrev === 'usfs' ||
      name.includes('forest service') ||
      name.includes('usda') ||
      name.includes('u.s. forest') ||
      name.includes('us forest')
    );
  });
}

/**
 * Extract a usable reservation URL for a facility
 */
export function getReservationURL(facility: RIDBFacility): string | null {
  if (facility.FacilityReservationURL) return facility.FacilityReservationURL;

  // Construct recreation.gov URL from facility ID
  if (facility.FacilityID) {
    return `https://www.recreation.gov/camping/campgrounds/${facility.FacilityID}`;
  }

  return null;
}
