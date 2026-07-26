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
  ConditionResponse,
  Hazard,
  HazardsResponse,
  MapAccessPoint,
  RiverConditionDetail,
  RiverDetail,
  RiverDetailResponse,
  RiversResponse,
  RiverListItem,
  StarredRiversResponse,
  AlertSubscriptionEntry,
  AlertSubscriptionsResponse,
  MeProfileResponse,
  MeDeleteResponse,
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
 * Live conditions for one river: the reading, its age, and where today's flow
 * sits historically.
 *
 * Returns null when no gauge is wired or the reading is unavailable — the
 * endpoint answers 200 with `available: false` rather than erroring, because a
 * river without a gauge is an ordinary state, not a fault.
 */
export async function fetchCondition(
  riverId: string,
  signal?: AbortSignal,
): Promise<RiverConditionDetail | null> {
  const data = await get<ConditionResponse>(
    `/api/conditions/${encodeURIComponent(riverId)}`,
    signal,
  );
  return data.available ? (data.condition ?? null) : null;
}

/**
 * Hazards for a river — low-water dams, strainers, required portages.
 *
 * No entitlement check anywhere in this path, by design. Safety information
 * behind a paywall is a liability, and the alert engine already applies the same
 * rule (see kindRequiresEntitlement: `warning` is free).
 */
export async function fetchHazards(slug: string, signal?: AbortSignal): Promise<Hazard[]> {
  const data = await get<HazardsResponse>(
    `/api/rivers/${encodeURIComponent(slug)}/hazards`,
    signal,
  );
  return data.hazards ?? [];
}

/** Subscribe to condition alerts for a river. 402 means the paywall. */
export async function subscribeToRiver(
  token: string,
  riverId: string,
  kind: 'floatable' | 'safety' | 'all',
): Promise<{ ok: boolean; paymentRequired: boolean }> {
  const response = await fetch(`${BASE_URL}/api/me/alert-subscriptions`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ riverId, kind }),
  });

  // 402 is the contextual paywall trigger, not a failure — the caller presents
  // an offer rather than an error.
  if (response.status === 402) return { ok: false, paymentRequired: true };
  if (!response.ok) throw new ApiError(`Request failed (${response.status})`, response.status);
  return { ok: true, paymentRequired: false };
}

export async function unsubscribeFromRiver(token: string, riverId: string): Promise<void> {
  await authed(
    `/api/me/alert-subscriptions?riverId=${encodeURIComponent(riverId)}`,
    token,
    { method: 'DELETE' },
  );
}

/** The caller's current alert subscriptions. Null when the session is unusable. */
export async function fetchSubscriptions(
  token: string,
  signal?: AbortSignal,
): Promise<AlertSubscriptionEntry[] | null> {
  const data = await authed<AlertSubscriptionsResponse>(
    '/api/me/alert-subscriptions',
    token,
    { signal },
  );
  return data ? (data.subscriptions ?? []) : null;
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

/**
 * The caller's profile and entitlement snapshot.
 *
 * `isActive` on the entitlement is computed SERVER-side from `expires_at` — a
 * device clock is trivially wrong and occasionally set forward on purpose, so
 * the app never decides this itself.
 */
export async function fetchMeProfile(
  token: string,
  signal?: AbortSignal,
): Promise<MeProfileResponse | null> {
  return authed<MeProfileResponse>('/api/me/profile', token, { signal });
}

/** Persist a display name. Used once, right after Apple returns one. */
export async function updateDisplayName(token: string, displayName: string): Promise<void> {
  await authed('/api/me/profile', token, { method: 'PATCH', body: { displayName } });
}

/**
 * Delete the account and its owned data. Irreversible.
 *
 * Unlike the rest of the /api/me family this THROWS on failure rather than
 * returning null. Everywhere else a 401 means "fall back to local data", which
 * is a fine outcome; here, silently doing nothing would leave the app claiming
 * an account was deleted when it still exists.
 */
export async function deleteAccount(token: string): Promise<MeDeleteResponse> {
  const response = await fetch(`${BASE_URL}/api/me`, {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new ApiError(
      response.status === 429
        ? 'Too many attempts. Please try again later.'
        : 'Could not delete your account. Please try again.',
      response.status,
    );
  }

  return (await response.json()) as MeDeleteResponse;
}

/**
 * Poll /api/me/profile until the entitlement appears, after a purchase.
 *
 * WHY THIS IS NEEDED: a completed purchase means StoreKit is done, not that we
 * know about it. The entitlement reaches our database through RevenueCat's
 * webhook, which is fast but asynchronous — usually a second or two, longer if
 * RevenueCat is retrying. Refreshing the profile once, immediately, reliably
 * reads the state from BEFORE the purchase and tells a paying customer they
 * have not paid.
 *
 * Returns false on timeout, and that is NOT a failure to show as an error. The
 * money moved and Apple has the receipt; the only true statement is that it has
 * not reached us yet. Callers say that, and let the user proceed.
 */
export async function waitForEntitlement(
  token: string,
  { attempts = 6, delayMs = 1200 }: { attempts?: number; delayMs?: number } = {},
): Promise<boolean> {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const profile = await fetchMeProfile(token);
      if (profile?.entitlement?.isActive) return true;
    } catch {
      // A network blip mid-poll is not terminal — keep trying the remaining
      // attempts rather than reporting a purchase as unconfirmed.
    }
    // No delay after the final attempt: nothing follows it.
    if (i < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return false;
}
