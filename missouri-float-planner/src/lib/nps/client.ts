// src/lib/nps/client.ts
// NPS API client for fetching campground and places data

import type {
  NPSAlertRaw,
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

interface FetchOptions {
  /**
   * Seconds to cache the response for, when this is called from a REQUEST
   * rather than from cron.
   *
   * The default stays `cache: 'no-store'` because the two sync wrappers below
   * run once a week and want the freshest possible answer. A user-facing route
   * wants the opposite: without this, every visitor to a river page would spend
   * an upstream NPS call, and the NPS rate-limits per key.
   */
  revalidateSeconds?: number;
}

async function fetchNPS<T>(
  endpoint: string,
  params: Record<string, string> = {},
  options: FetchOptions = {},
): Promise<NPSApiResponse<T>> {
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
    signal: AbortSignal.timeout(15_000),
    headers: {
      'Accept': 'application/json',
    },
    ...(options.revalidateSeconds
      ? { next: { revalidate: options.revalidateSeconds } }
      : // No caching — the default caller is cron, not a user request.
        { cache: 'no-store' as const }),
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

/**
 * Active alerts for one NPS unit — closures, cautions, dangers, notices.
 *
 * Unlike the two wrappers above, this one is called from a REQUEST path, and
 * that changes two things.
 *
 * It is CACHED (15 minutes, matching the NWS alert fetch it sits beside). A park
 * alert is not a weekly-sync kind of fact — a low-water bridge closing is the
 * thing a paddler needs before they drive out — but neither is it worth an
 * upstream call per visitor.
 *
 * It RETURNS [] INSTEAD OF THROWING. `getApiKey()` throws when NPS_API_KEY is
 * unset and `fetchNPS` throws on any non-2xx, which is correct for a cron job
 * that should fail loudly and get retried. On a page, the same throw would take
 * down the weather alerts sitting next to these and replace a river's whole
 * alerts section with an error — over a missing key for a park most rivers do
 * not even have. Failing to reach the NPS means we cannot say whether the park
 * is closed; the surface says nothing rather than pretending it is open.
 */
export async function fetchNPSAlerts(
  parkCode: string = DEFAULT_PARK_CODE
): Promise<NPSAlertRaw[]> {
  try {
    const response = await fetchNPS<NPSAlertRaw>(
      'alerts',
      { parkCode, limit: '50' },
      { revalidateSeconds: 900 },
    );
    return response.data ?? [];
  } catch (err) {
    console.warn(`[NPS] Alert fetch failed for ${parkCode}:`, err);
    return [];
  }
}
