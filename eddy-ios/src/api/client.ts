// eddy-ios/src/api/client.ts
// Thin client over the existing Next.js REST API, which the app consumes as a
// headless backend. No auth yet — every endpoint used by the shell is public.
//
// The User-Agent is deliberate: the backend runs an x402 layer that charges AI
// crawlers, and it matches on UA. Identifying as EddyiOS keeps our own app on
// the free path (see src/lib/x402/ in the web app).

import Constants from 'expo-constants';
import type {
  AccessPointsResponse,
  AlertFeedEntry,
  AlertsResponse,
  AppConfigResponse,
  MapAccessPoint,
  RiverDetail,
  RiverDetailResponse,
  RiversResponse,
  RiverListItem,
  StarredRiversResponse,
} from '@eddy/types';
import type { ServerStar } from '@eddy/sync';

const BASE_URL =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ?? 'https://eddy.guide';

export const USER_AGENT = 'EddyiOS/0.1';

export class ApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'ApiError';
  }
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      signal,
    });
  } catch (err) {
    // Offline is the expected case on a river, not an exceptional one — give
    // the UI something it can phrase kindly.
    throw new ApiError(
      err instanceof Error && err.name === 'AbortError' ? 'Request cancelled' : 'No connection',
    );
  }

  if (!response.ok) {
    throw new ApiError(`Request failed (${response.status})`, response.status);
  }

  return (await response.json()) as T;
}

/**
 * Authenticated request against /api/me/*.
 *
 * A 401 is returned as null rather than thrown: the caller's job is to fall
 * back to local data, and an expired session is an ordinary event, not an
 * error worth surfacing.
 */
async function authed<T>(
  path: string,
  token: string,
  init?: { method?: string; body?: unknown; signal?: AbortSignal },
): Promise<T | null> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    signal: init?.signal,
  });

  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) {
    throw new ApiError(`Request failed (${response.status})`, response.status);
  }
  return (await response.json()) as T;
}

/** The caller's starred rivers. Null when the session is not usable. */
export async function fetchStarredRivers(
  token: string,
  signal?: AbortSignal,
): Promise<ServerStar[] | null> {
  const data = await authed<StarredRiversResponse>('/api/me/starred-rivers', token, { signal });
  if (!data) return null;
  return data.starred.map((entry) => ({
    riverId: entry.riverId,
    riverName: entry.riverName,
    riverSlug: entry.riverSlug,
    starredAt: entry.starredAt,
  }));
}

export async function starRiver(token: string, riverId: string): Promise<void> {
  await authed('/api/me/starred-rivers', token, { method: 'POST', body: { riverId } });
}

export async function unstarRiver(token: string, riverId: string): Promise<void> {
  await authed(
    `/api/me/starred-rivers?riverId=${encodeURIComponent(riverId)}`,
    token,
    { method: 'DELETE' },
  );
}

/** All curated Eddy Rivers with their current condition. */
export async function fetchRivers(signal?: AbortSignal): Promise<RiverListItem[]> {
  const data = await get<RiversResponse>('/api/rivers', signal);
  return data.rivers ?? [];
}

/**
 * One river with its full centreline geometry.
 *
 * This is the heaviest response the app fetches — the Current River alone is a
 * 632-point LineString — so callers should treat it as a per-river load, not
 * something to fan out across all thirteen.
 */
export async function fetchRiverDetail(slug: string, signal?: AbortSignal): Promise<RiverDetail> {
  const data = await get<RiverDetailResponse>(`/api/rivers/${encodeURIComponent(slug)}`, signal);
  return data.river;
}

/** Approved access points, ordered from headwaters downstream. */
export async function fetchRiverAccessPoints(
  slug: string,
  signal?: AbortSignal,
): Promise<MapAccessPoint[]> {
  const data = await get<AccessPointsResponse>(
    `/api/rivers/${encodeURIComponent(slug)}/access-points`,
    signal,
  );
  return data.accessPoints ?? [];
}

/**
 * Remote config and kill switches.
 *
 * Never throws: the caller treats an unreachable config as "no restrictions"
 * rather than blocking startup. A version gate that fails closed would turn a
 * config outage into a total outage.
 */
export async function fetchAppConfig(signal?: AbortSignal): Promise<AppConfigResponse | null> {
  try {
    return await get<AppConfigResponse>('/api/app-config', signal);
  } catch {
    return null;
  }
}

/**
 * Public condition-change feed. Free to read and requires no account, which is
 * why the app filters to locally-starred rivers on the client rather than
 * asking the server for "my" alerts.
 */
export async function fetchAlerts(signal?: AbortSignal): Promise<AlertFeedEntry[]> {
  const data = await get<AlertsResponse>('/api/alerts?limit=100', signal);
  return data.alerts ?? [];
}
