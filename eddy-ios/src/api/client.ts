// eddy-ios/src/api/client.ts
// Thin client over the existing Next.js REST API, which the app consumes as a
// headless backend. No auth yet — every endpoint used by the shell is public.
//
// The User-Agent is deliberate: the backend runs an x402 layer that charges AI
// crawlers, and it matches on UA. Identifying as EddyiOS keeps our own app on
// the free path (see src/lib/x402/ in the web app).

import Constants from 'expo-constants';
import type { AppConfigResponse, RiversResponse, RiverListItem } from '@eddy/types';

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

/** All curated Eddy Rivers with their current condition. */
export async function fetchRivers(signal?: AbortSignal): Promise<RiverListItem[]> {
  const data = await get<RiversResponse>('/api/rivers', signal);
  return data.rivers ?? [];
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
