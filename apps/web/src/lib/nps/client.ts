// src/lib/nps/client.ts
// NPS API client for fetching campground and places data

import type {
  NPSApiResponse,
  NPSCampgroundRaw,
  NPSPlaceRaw,
} from '@/types/nps';

const NPS_API_BASE = 'https://developer.nps.gov/api/v1';
const PARK_CODE = 'ozar';

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
 * Fetch all campgrounds for ONSR (park code: ozar)
 */
export async function fetchNPSCampgrounds(): Promise<NPSCampgroundRaw[]> {
  const response = await fetchNPS<NPSCampgroundRaw>('campgrounds', {
    parkCode: PARK_CODE,
    limit: '50', // ONSR has 23 campgrounds
  });
  return response.data;
}

/**
 * Fetch all places/POIs for ONSR (park code: ozar)
 */
export async function fetchNPSPlaces(): Promise<NPSPlaceRaw[]> {
  const response = await fetchNPS<NPSPlaceRaw>('places', {
    parkCode: PARK_CODE,
    limit: '50', // ONSR has 13 places
  });
  return response.data;
}
