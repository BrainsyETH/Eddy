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
  FloatPlan,
  GaugesResponse,
  Hazard,
  HazardsResponse,
  MapAccessPoint,
  MapGauge,
  MapGaugesResponse,
  PlanResponse,
  RiverConditionDetail,
  RiverDetail,
  RiverDetailResponse,
  RiverOutlookResponse,
  RiverVisualsResponse,
  RiverService,
  RiversResponse,
  RiverListItem,
  SavePlanResponse,
  SearchResponse,
  SearchResult,
  ServicesResponse,
  StarredGaugesResponse,
  StarredRiversResponse,
  AlertSubscriptionEntry,
  AlertSubscriptionsResponse,
  MeProfileResponse,
  MeDeleteResponse,
} from '@eddy/types';
import type { ServerStar } from '@eddy/sync';
import type { StatewideReading, StatewideRiver } from '@/lib/statewideNetwork';

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

/**
 * The caller's starred rivers. Null when the session is not usable.
 *
 * Normalised into the wire-agnostic ServerStar here rather than in @eddy/sync,
 * which has no business knowing that one endpoint says `riverId` and the other
 * says `gaugeId`.
 */
export async function fetchStarredRivers(
  token: string,
  signal?: AbortSignal,
): Promise<ServerStar[] | null> {
  const data = await authed<StarredRiversResponse>('/api/me/starred-rivers', token, { signal });
  if (!data) return null;
  return data.starred.map((entry) => ({
    kind: 'river' as const,
    entityId: entry.riverId,
    name: entry.riverName,
    slug: entry.riverSlug,
    starredAt: entry.starredAt,
  }));
}

/**
 * The caller's starred gauges. Null when the session is not usable — OR when
 * the backend does not have this endpoint yet.
 *
 * That second case is not hypothetical: the app ships through App Store review
 * and the server does not, so a build that knows about gauge stars will meet a
 * deploy that does not. Returning null rather than [] is what keeps that safe —
 * @eddy/sync treats an empty array as "the server has nothing", which would
 * prune every gauge tombstone and re-push every gauge star as if it were new.
 * Same posture as searchEddy, which tolerates its endpoint being absent.
 */
export async function fetchStarredGauges(
  token: string,
  signal?: AbortSignal,
): Promise<ServerStar[] | null> {
  try {
    const data = await authed<StarredGaugesResponse>('/api/me/starred-gauges', token, { signal });
    if (!data) return null;
    return data.starred.map((entry) => ({
      kind: 'gauge' as const,
      entityId: entry.gaugeId,
      name: entry.gaugeName,
      slug: entry.riverSlug ?? '',
      usgsSiteId: entry.usgsSiteId,
      starredAt: entry.starredAt,
    }));
  } catch {
    // ANY failure is null, not just a 404. The table behind this endpoint
    // arrives in a migration, and if the app is deployed first the route
    // answers 500 rather than 404 — which, thrown, would reject the Promise.all
    // in sync() and abort the RIVER reconciliation too. A feature that does not
    // exist yet must not be able to break one that does.
    return null;
  }
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

export async function starGauge(token: string, gaugeId: string): Promise<void> {
  await authed('/api/me/starred-gauges', token, { method: 'POST', body: { gaugeId } });
}

export async function unstarGauge(token: string, gaugeId: string): Promise<void> {
  await authed(
    `/api/me/starred-gauges?gaugeId=${encodeURIComponent(gaugeId)}`,
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
 * The statewide river network: geometry plus each gauge's editorial ladder.
 *
 * `?slim=1` drops the access points, POIs and campgrounds the Observatory
 * ships, leaving roughly 260 KB for all 24 rivers. This and the readings below
 * are the SAME endpoints the website's statewide map runs on, and both are
 * CDN-cached, so the app is not asking the database for anything new.
 *
 * NOT the per-river geometry from fetchRiverDetail: that one is full-resolution
 * and used to snap a float route, and still loads one river at a time. This is
 * coarser context for drawing the whole network at once.
 */
export async function fetchStatewideNetwork(signal?: AbortSignal): Promise<StatewideRiver[]> {
  const data = await get<{ rivers?: StatewideRiver[] }>('/api/usgs/mo-dataset?slim=1', signal);
  return data.rivers ?? [];
}

/**
 * Live readings for every gauge in the statewide dataset.
 *
 * Numbers, not verdicts — the phone grades them through the same ladder the
 * server uses, the way it already does for gauge pins.
 */
export async function fetchStatewideReadings(signal?: AbortSignal): Promise<StatewideReading[]> {
  const data = await get<{ gauges?: StatewideReading[] }>('/api/usgs/mo-statewide', signal);
  return data.gauges ?? [];
}

/**
 * Every active gauge station with its latest reading.
 *
 * One flat request for all of them — roughly forty rows — rather than a call
 * per river. That is what makes a gauge map layer and gauge search affordable:
 * the app fetches this once when the map opens and filters it locally.
 */
export async function fetchGauges(signal?: AbortSignal): Promise<MapGauge[]> {
  const data = await get<GaugesResponse>('/api/gauges', signal);
  return data.gauges ?? [];
}

/**
 * Gauges inside a viewport — the national "All Gauges" tier.
 *
 * A DIFFERENT endpoint from fetchGauges above, not a parameter on it. That one
 * returns the ~46 gauges Eddy has rated, with the full ladder each river grades
 * against, and it stays exactly as it is. This one returns up to a few hundred
 * of the ~14,000 USGS stream gauges in the country, with a reading and a
 * percentile and no ladder at all — because there isn't one.
 *
 * Callers must quantize and pad the bbox first (`quantizeBbox`/`padBbox` in
 * @eddy/geo). A raw camera bbox is a fresh URL on every pan, which is a CDN
 * miss every time; the grid is what makes this cacheable.
 *
 * `capped` comes back true when the server dropped lower-discharge gauges to
 * meet the limit — surface it rather than silently showing a third of the map.
 * Curated gauges are ordered first server-side, so the cap can never drop one.
 */
export async function fetchMapGauges(
  bbox: [number, number, number, number],
  options?: { limit?: number; curatedOnly?: boolean },
  signal?: AbortSignal,
): Promise<MapGaugesResponse> {
  const params = new URLSearchParams({ bbox: bbox.join(',') });
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.curatedOnly) params.set('curated', '1');

  const data = await get<MapGaugesResponse>(`/api/gauges/map?${params.toString()}`, signal);
  return {
    gauges: data.gauges ?? [],
    capped: data.capped ?? false,
    total: data.total ?? 0,
  };
}

/**
 * Outfitters, campgrounds and shuttles near a river.
 *
 * Not every service has been geocoded, so callers plotting these must drop the
 * ones with a null latitude rather than treating them as (0, 0).
 */
export async function fetchRiverServices(
  slug: string,
  signal?: AbortSignal,
): Promise<RiverService[]> {
  const data = await get<ServicesResponse>(
    `/api/rivers/${encodeURIComponent(slug)}/services`,
    signal,
  );
  return data.services ?? [];
}

/**
 * The float plan: distance, time, shuttle, condition, hazards and the route.
 *
 * The heaviest call in the app by wall-clock — it reaches USGS for a live
 * reading and Mapbox for the shuttle drive — so it runs once on an explicit
 * tap, never speculatively as the user moves between access points.
 *
 * NO vesselTypeId. The app stopped asking which boat you are in — the endpoint
 * defaults to a canoe, and the plan it returns names the vessel it used, which
 * is all the answer needs to say. See useFloatPlan for why that step is gone.
 */
export async function fetchFloatPlan(
  params: { riverId: string; startId: string; endId: string },
  signal?: AbortSignal,
): Promise<FloatPlan> {
  const query = new URLSearchParams({
    riverId: params.riverId,
    startId: params.startId,
    endId: params.endId,
  });
  const data = await get<PlanResponse>(`/api/plan?${query.toString()}`, signal);
  return data.plan;
}

/**
 * A previously saved plan, by its share code.
 *
 * RECALCULATED SERVER-SIDE, not replayed. The saved row holds the river and the
 * two access points; the endpoint re-runs the whole plan against today's gauge
 * before answering. That is the only correct behaviour for this: a float saved
 * in April and opened in July describes the same stretch and completely
 * different water, and handing back April's numbers would be a lie with a
 * timestamp on it.
 */
export async function fetchSavedPlan(
  shortCode: string,
  signal?: AbortSignal,
): Promise<FloatPlan> {
  const data = await get<PlanResponse>(
    `/api/plan/${encodeURIComponent(shortCode)}`,
    signal,
  );
  return data.plan;
}

/**
 * Persist a plan and get a short link back, for sharing.
 *
 * The snapshot is sent rather than left for the server to recompute. Without it
 * the save endpoint re-runs the whole plan calculation — USGS and Mapbox again —
 * just to write a row, which turns "Share" into a multi-second wait for numbers
 * the caller is already looking at.
 */
export async function saveFloatPlan(plan: FloatPlan): Promise<SavePlanResponse> {
  const response = await fetch(`${BASE_URL}/api/plan/save`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify({
      riverId: plan.river.id,
      startId: plan.putIn.id,
      endId: plan.takeOut.id,
      vesselTypeId: plan.vessel.id,
      snapshot: {
        distanceMiles: plan.distance.miles,
        estimatedFloatMinutes: plan.floatTime?.minutes ?? null,
        driveBackMinutes: plan.driveBack?.minutes ?? null,
        conditionCode: plan.condition?.code ?? null,
        gaugeHeightFt: plan.condition?.gaugeHeightFt ?? null,
        dischargeCfs: plan.condition?.dischargeCfs ?? null,
        gaugeName: plan.condition?.gaugeName ?? null,
      },
    }),
  });

  if (!response.ok) {
    throw new ApiError(
      response.status === 429
        ? 'Too many plans saved just now. Try again in a few minutes.'
        : 'Could not save this plan.',
      response.status,
    );
  }

  return (await response.json()) as SavePlanResponse;
}

/**
 * Search across rivers, gauges and access points.
 *
 * Returns an empty list rather than throwing on ANY failure, including a 404.
 * The endpoint is newer than some deployed builds of the website this app talks
 * to, and a search field that reports an error because the backend has not
 * caught up is worse than one that quietly finds nothing — callers fall back to
 * matching the rivers they already hold. See useSearch in src/hooks.
 */
export async function searchEddy(
  query: string,
  signal?: AbortSignal,
): Promise<{ results: SearchResult[]; available: boolean }> {
  try {
    const data = await get<SearchResponse>(
      `/api/search?q=${encodeURIComponent(query)}&limit=25`,
      signal,
    );
    return { results: data.results ?? [], available: true };
  } catch (err) {
    // A cancelled request must not be reported as "the server has no search" —
    // that would permanently disable it after one fast keystroke.
    if (err instanceof ApiError && err.message === 'Request cancelled') {
      return { results: [], available: true };
    }
    return { results: [], available: false };
  }
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
 * The 72-hour outlook and Eddy's take for one river.
 *
 * One request on purpose. The website assembles this client-side from weather,
 * the NWS hydrograph and gauge history; doing the same here would mean three
 * round trips at a put-in, where connectivity is worst and the answer matters
 * most. The server runs the same pure functions and sends the finished object.
 *
 * `gaugeId` — a gauge_stations id, which is what /api/gauges calls MapGauge.id
 * — asks for the outlook AT THAT STATION rather than at the river's rated one:
 * its weather, its hydrograph, its condition and its own written report. Omit
 * it for the river as a whole. An id the river does not rate falls back to the
 * primary server-side, and the response names the station it used, so a caller
 * that cares must compare `gaugeStationId` rather than assume.
 *
 * Returns null when the river has no primary gauge or the endpoint fails — the
 * caller hides the panel rather than showing an error, because a river without
 * a forecast is an ordinary state.
 */
export async function fetchRiverOutlook(
  slug: string,
  signal?: AbortSignal,
  gaugeId?: string | null,
): Promise<RiverOutlookResponse | null> {
  const query = gaugeId ? `?gaugeId=${encodeURIComponent(gaugeId)}` : '';
  const data = await get<RiverOutlookResponse>(
    `/api/rivers/${encodeURIComponent(slug)}/outlook${query}`,
    signal,
  );
  return data.available ? data : null;
}

/**
 * Photos of this river, banded by the condition each was taken at.
 *
 * Degrades to null like the outlook does: most rivers have no photos yet, and a
 * river with none is an ordinary state rather than a failure. The card simply
 * does not render.
 */
export async function fetchRiverVisuals(
  slug: string,
  signal?: AbortSignal,
): Promise<RiverVisualsResponse | null> {
  return get<RiverVisualsResponse>(
    `/api/rivers/${encodeURIComponent(slug)}/visuals`,
    signal,
  );
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

/**
 * Register this device for push. Requires a permanent (signed-in) account —
 * the backend and the RLS policy both enforce that independently.
 *
 * Returns a boolean rather than throwing: a device that cannot register is a
 * device that does not get alerts, which is a degraded state rather than an
 * error worth interrupting anyone over.
 */
export async function registerDeviceToken(
  token: string,
  device: {
    expoPushToken: string;
    platform: 'ios' | 'android';
    deviceName?: string;
    appVersion?: string;
  },
): Promise<boolean> {
  try {
    const result = await authed('/api/me/device-tokens', token, {
      method: 'POST',
      body: device,
    });
    return result !== null;
  } catch {
    return false;
  }
}

/** Stop this device receiving push. */
export async function unregisterDeviceToken(token: string, expoPushToken: string): Promise<void> {
  await authed(
    `/api/me/device-tokens?expoPushToken=${encodeURIComponent(expoPushToken)}`,
    token,
    { method: 'DELETE' },
  );
}
