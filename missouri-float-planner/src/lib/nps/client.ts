// src/lib/nps/client.ts
// NPS API client for fetching campground and places data

import type {
  NPSApiResponse,
  NPSCampgroundRaw,
  NPSPlaceRaw,
} from '@/types/nps';

const NPS_API_BASE = 'https://developer.nps.gov/api/v1';

/** Fallback when no river carries a park_code (pre-migration data). */
export const DEFAULT_PARK_CODE = 'ozar';

function getApiKey(): string {
  const key = process.env.NPS_API_KEY;
  if (!key) {
    throw new Error('NPS_API_KEY environment variable is not set');
  }
  return key;
}

async function fetchNPS<T>(endpoint: string, params: Record<string, string> = {}): Promise<NPSApiResponse<T>> {
  const apiKey = getApiKey();
  const url = new URL(`${NPS_API_BASE}/${endpoint}`);

  // Default params
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('limit', '50');

  // Custom params
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json',
    },
    // No caching — this is called from cron, not user requests
    cache: 'no-store',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`NPS API error ${response.status}: ${text}`);
  }

  return response.json();
}

/**
 * Fetch all campgrounds for one NPS unit (park code from rivers.park_code,
 * e.g. 'ozar' = Ozark NSR, 'buff' = Buffalo National River).
 */
export async function fetchNPSCampgrounds(
  parkCode: string = DEFAULT_PARK_CODE
): Promise<NPSCampgroundRaw[]> {
  const response = await fetchNPS<NPSCampgroundRaw>('campgrounds', {
    parkCode,
    limit: '50',
  });
  return response.data;
}

/**
 * Fetch all places/POIs for one NPS unit.
 */
export async function fetchNPSPlaces(
  parkCode: string = DEFAULT_PARK_CODE
): Promise<NPSPlaceRaw[]> {
  const response = await fetchNPS<NPSPlaceRaw>('places', {
    parkCode,
    limit: '50',
  });
  return response.data;
}
