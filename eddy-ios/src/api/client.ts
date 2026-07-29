// eddy-ios/src/api/client.ts
// Thin client over the existing Next.js REST API, which the app consumes as a
// headless backend. No auth yet — every endpoint used by the shell is public.
//
// The User-Agent is deliberate: the backend runs an x402 layer that charges AI
// crawlers, and it matches on UA. Identifying as EddyiOS keeps our own app on
// the free path (see src/lib/x402/ in the web app).

import Constants from 'expo-constants';
import type {
  AccessPointDetailResponse,
  AccessPointsResponse,
  AlertFeedEntry,
  AlertsResponse,
  HighWaterEntry,
  HighWaterResponse,
  AppConfigResponse,
  ConditionResponse,
  DamSnapshot,
  DamsResponse,
  FloatPlan,
  GaugeDetail,
  GaugeDetailResponse,
  GaugeHistoryResponse,
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
  RiverReach,
  RiverReachesResponse,
  RiverVisualsResponse,
  RiverService,
  RiversResponse,
  RiverListItem,
  SavePlanResponse,
  SearchResponse,
  SearchResult,
  SearchResultKind,
  ServicesResponse,
  StarredDamsResponse,
  StarredGaugesResponse,
  StarredRiversResponse,
  AlertSubscriptionEntry,
  AlertSubscriptionKind,
  AlertSubscriptionsResponse,
  AlertComparator,
  AlertMetric,
  AlertRule,
  AlertRuleMode,
  AlertRuleResponse,
  AlertRuleScope,
  AlertRulesResponse,
  NotificationPreferences,
  NotificationPreferencesResponse,
  MeProfileResponse,
  MeDeleteResponse,
  CreateFeedbackRequest,
  FeedbackResponse,
  RiverAlert,
  RiverAlertsResponse,
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

/**
 * The caller's starred dams. Null when the session is not usable — OR when the
 * backend does not have this endpoint yet.
 *
 * Same posture as fetchStarredGauges, for the same reason: the app ships
 * through App Store review and the server does not, so a build that knows about
 * dam stars will meet a deploy that does not. Returning null rather than []
 * matters — @eddy/sync reads an empty array as "the server has nothing", which
 * would prune every dam tombstone and re-push every dam star as if it were new.
 */
export async function fetchStarredDams(
  token: string,
  signal?: AbortSignal,
): Promise<ServerStar[] | null> {
  try {
    const data = await authed<StarredDamsResponse>('/api/me/starred-dams', token, { signal });
    if (!data) return null;
    return data.starred.map((entry) => ({
      kind: 'dam' as const,
      entityId: entry.damId,
      name: entry.damName,
      // The tailwater river, when there is one. A dam opens its OWN screen —
      // this is context, not a route.
      slug: entry.riverSlug ?? '',
      starredAt: entry.starredAt,
    }));
  } catch {
    // ANY failure is null, not just a 404: the table arrives in a migration,
    // and if the app deploys first the route answers 500 rather than 404 —
    // which, thrown, would reject the Promise.all in sync() and abort the river
    // and gauge reconciliations too.
    return null;
  }
}

export async function starDam(token: string, damId: string): Promise<void> {
  await authed('/api/me/starred-dams', token, { method: 'POST', body: { damId } });
}

export async function unstarDam(token: string, damId: string): Promise<void> {
  await authed(`/api/me/starred-dams?damId=${encodeURIComponent(damId)}`, token, {
    method: 'DELETE',
  });
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
 * One access point, with everything the list endpoint leaves out.
 *
 * The road surface, the parking, the facilities, the outfitters who serve it
 * and what the next take-out downstream is — none of which fits in a row and
 * all of which is the reason somebody tapped one.
 *
 * THROWS on 404 rather than returning null, unlike most of this file. A missing
 * access point here is a bad route param, not an ordinary empty state: the
 * screen was opened from a row that named it, so "this place does not exist" is
 * a real failure and the screen says so.
 */
export async function fetchAccessPointDetail(
  riverSlug: string,
  accessSlug: string,
  signal?: AbortSignal,
): Promise<AccessPointDetailResponse> {
  return get<AccessPointDetailResponse>(
    `/api/rivers/${encodeURIComponent(riverSlug)}/access/${encodeURIComponent(accessSlug)}`,
    signal,
  );
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
export async function fetchStatewideReadings(
  signal?: AbortSignal,
): Promise<{ readings: StatewideReading[]; available: boolean }> {
  const data = await get<{ gauges?: StatewideReading[]; readingsAvailable?: boolean }>(
    '/api/usgs/mo-statewide',
    signal,
  );
  return {
    readings: data.gauges ?? [],
    // `!== false`, not truthiness: the field is newer than some deployed builds
    // of the website this app talks to, and a missing one means "this server
    // does not report that", which must not read as "the readings failed".
    available: data.readingsAvailable !== false,
  };
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
 * ONE gauge, by site id, from either tier.
 *
 * The third gauge endpoint, and the only one that can answer for a station the
 * app has not already fetched a list containing. fetchGauges is curated-only and
 * fetchMapGauges is bounded by a viewport; the gauge screen is reachable from a
 * starred row, a search result and a deep link, where neither list has been paid
 * for and the station is usually a national one that /api/gauges never returns.
 *
 * Returns NULL on 404, and on any failure, rather than throwing. The gauge
 * screen opens with whatever the tapping surface already held — a MapGauge from
 * the curated list, a MapGaugeLite from the viewport — and this call refines it.
 * A screen that has a reading on it must not blank because the refinement
 * failed, and a website deployed before this route existed answers 404 to every
 * call. Same posture as searchEddy, for the same reason.
 */
export async function fetchGaugeDetail(
  siteId: string,
  signal?: AbortSignal,
): Promise<GaugeDetail | null> {
  try {
    const data = await get<GaugeDetailResponse>(
      `/api/gauges/${encodeURIComponent(siteId)}`,
      signal,
    );
    return data.gauge ?? null;
  } catch {
    return null;
  }
}

/**
 * A gauge's recent hydrograph, for the chart.
 *
 * Works for BOTH tiers: the endpoint serves stored readings and falls back to
 * the live provider when what it holds is sparse or stale, which is the
 * ordinary case for every station the cron stopped polling — i.e. all ~14,000
 * national ones. So a reference gauge gets a real chart, not an empty one.
 *
 * Already downsampled server-side to roughly one point an hour. Do not thin it
 * again on the client: at 30 days that is ~720 points, which is a line, not a
 * performance problem.
 *
 * Returns null rather than throwing when the station has no history at all —
 * an ordinary state for a new or seasonal site, and the chart simply does not
 * render. A cancelled request also returns null; the caller has already moved on.
 */
export async function fetchGaugeHistory(
  siteId: string,
  days: number,
  signal?: AbortSignal,
): Promise<GaugeHistoryResponse | null> {
  try {
    return await get<GaugeHistoryResponse>(
      `/api/gauges/${encodeURIComponent(siteId)}/history?days=${days}`,
      signal,
    );
  } catch {
    return null;
  }
}

/**
 * Outfitters, campgrounds and shuttles near a river.
 *
 * Not every service has been geocoded, so callers plotting these must drop the
 * ones with a null latitude rather than treating them as (0, 0).
 */
/**
 * The river's hydrologically distinct reaches, or [] for the rivers that have
 * none — which is all of them but the Black today.
 *
 * Its own endpoint rather than a field on an existing one: no other route
 * carries a reach's gauge, type or report, so unlike the dam panel (which rides
 * the ten-item /api/dams) there was nothing to piggyback on. Degrades to [] like
 * every other optional panel on the river screen.
 */
export async function fetchRiverReaches(
  slug: string,
  signal?: AbortSignal,
): Promise<RiverReach[]> {
  const data = await get<RiverReachesResponse>(
    `/api/rivers/${encodeURIComponent(slug)}/reaches`,
    signal,
  );
  return data.reaches ?? [];
}

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
  /**
   * Which kinds to ask for. Omit for all three.
   *
   * The Search tab is SCOPED — one kind at a time — and asking for all three
   * meant the server spent a 25-row budget on rows that screen would throw
   * away. Worse, it allocated them in a fixed order, so the Gauges scope got
   * whatever rivers and access points had not already claimed, which for a
   * query like "river" was nothing at all. Naming the scope is what lets a
   * single kind have the whole page.
   *
   * Older deployments ignore the parameter and answer with everything, which
   * the client already filters by kind — so this degrades to the old behaviour
   * rather than breaking against a backend that has not caught up.
   */
  kinds?: readonly SearchResultKind[],
  /**
   * Which page to ask for, and how big.
   *
   * `offset` is applied PER KIND server-side, which is the only definition that
   * works for a scoped caller: this screen pages one kind at a time, and an
   * offset over the flat allocated list would skip rows in whichever kind was
   * under-represented on the page before.
   *
   * An EMPTY `query` with exactly one kind is a browse rather than a search —
   * the server lists that kind instead of matching it. That is what lets the
   * Gauges scope scroll all 14,264 stations instead of opening on the 45
   * curated ones, and the Access scope open with rows at all.
   */
  page?: { limit?: number; offset?: number },
): Promise<{ results: SearchResult[]; available: boolean; hasMore: boolean }> {
  try {
    const scope = kinds?.length ? `&kinds=${kinds.join(',')}` : '';
    const limit = page?.limit ?? SEARCH_PAGE_SIZE;
    const offset = page?.offset ?? 0;
    const data = await get<SearchResponse>(
      `/api/search?q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}${scope}`,
      signal,
    );
    const results = data.results ?? [];
    return {
      results,
      available: true,
      // A website older than the paging change sends no `hasMore`. Falling back
      // to "a full page probably has more" keeps infinite scroll working there
      // — the worst case is one extra request that comes back empty, which the
      // caller already handles — while an exact flag from a current deploy is
      // always preferred.
      hasMore: data.hasMore ?? results.length >= limit,
    };
  } catch (err) {
    // A cancelled request must not be reported as "the server has no search" —
    // that would permanently disable it after one fast keystroke.
    if (err instanceof ApiError && err.message === 'Request cancelled') {
      return { results: [], available: true, hasMore: false };
    }
    return { results: [], available: false, hasMore: false };
  }
}

/**
 * Rows per page.
 *
 * 50, up from a hardcoded 25 that was also the whole result set. Two screenfuls
 * on a phone: enough that most searches never page at all, small enough that
 * the first one lands fast on a put-in's cell signal.
 */
export const SEARCH_PAGE_SIZE = 50;

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

/**
 * Subscribe to condition alerts for a river.
 *
 * There is no 402 branch any more — alerting is free, so the route cannot
 * answer payment-required. 403 (an anonymous session where a permanent one is
 * needed) throws like any other failure and the caller opens the sign-in sheet
 * on it; the status is preserved on ApiError precisely so that check is possible
 * without re-reading the body.
 */
export async function subscribeToRiver(
  token: string,
  riverId: string,
  kind: 'floatable' | 'safety' | 'all',
): Promise<void> {
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

  if (!response.ok) throw new ApiError(`Request failed (${response.status})`, response.status);
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

// ── Alert rules ────────────────────────────────────────────────────────────
//
// Two tables stand behind these — river condition subscriptions are fanned out
// from a global outbox, per-gauge rules are evaluated one by one — and the
// server merges them. `AlertRule.source` is the only trace of the split that
// reaches the app, and its one job is being echoed back on writes.

/**
 * Every rule the caller has, river and gauge alike.
 *
 * Null when the session is unusable, following fetchSubscriptions: the manage
 * list shows its signed-out state rather than an empty list, because "you have
 * no alerts" and "we could not ask" must not look the same on a screen whose
 * next control is "create one".
 */
export async function fetchAlertRules(
  token: string,
  signal?: AbortSignal,
): Promise<AlertRule[] | null> {
  const data = await authed<AlertRulesResponse>('/api/me/alerts', token, { signal });
  return data ? (data.rules ?? []) : null;
}

export interface CreateGaugeAlertInput {
  gaugeStationId?: string;
  usgsSiteId?: string;
  riverId?: string;
  riverSlug?: string;
  scope: AlertRuleScope;
  mode: AlertRuleMode;
  conditionKind?: AlertSubscriptionKind;
  metric?: AlertMetric;
  comparator?: AlertComparator;
  thresholdValue?: number;
  thresholdValueMax?: number;
  oneShot?: boolean;
}

/**
 * Raw fetch rather than authed(), exactly as subscribeToRiver does.
 *
 * authed() turns 401 and 403 into null, which is right for a read that can fall
 * back to local data and wrong here: 403 means "anonymous session, sign in" and
 * is the difference between showing the sign-in sheet and showing a generic
 * failure. The status has to survive.
 */
async function writeJson<T>(
  path: string,
  token: string,
  method: 'POST' | 'PATCH' | 'PUT',
  body: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError('No connection');
  }

  if (!response.ok) {
    // The route answers 409 and 422 with a `code` and a sentence written for a
    // person — "You already have this alert", "This gauge does not report
    // discharge". Carried through so the screen can show that instead of
    // inventing its own wording for a rule it cannot see.
    const detail = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(detail?.error ?? `Request failed (${response.status})`, response.status);
  }
  return (await response.json()) as T;
}

export async function createGaugeAlert(
  token: string,
  input: CreateGaugeAlertInput,
): Promise<AlertRuleResponse> {
  return writeJson<AlertRuleResponse>('/api/me/gauge-alerts', token, 'POST', input);
}

export interface UpdateAlertRuleInput {
  enabled?: boolean;
  oneShot?: boolean;
  conditionKind?: AlertSubscriptionKind;
  metric?: AlertMetric;
  comparator?: AlertComparator;
  thresholdValue?: number;
  thresholdValueMax?: number;
  /** Clear a spent one-shot so it can fire again. */
  rearm?: boolean;
}

/**
 * Edit one rule, whichever table it lives in.
 *
 * The two are addressed differently and that is not incidental: a gauge rule is
 * keyed by its own id, while a river subscription is keyed by riverId, because
 * the bell that edits one knows the river and nothing else. `rule.source` picks
 * the shape, so no caller has to.
 */
export async function updateAlertRule(
  token: string,
  rule: Pick<AlertRule, 'id' | 'source' | 'riverId'>,
  patch: UpdateAlertRuleInput,
): Promise<void> {
  if (rule.source === 'river_condition') {
    if (!rule.riverId) throw new ApiError('Alert is missing its river', 400);
    // `conditionKind` here, `kind` there. The two tables named the same column
    // differently before they were ever merged into one client-facing rule, and
    // passing the patch through untranslated is silent: the route ignores the
    // key it does not know and answers "Nothing to update" — so switching a
    // river alert from Everything to Safety would appear to save and change
    // nothing at all.
    const { conditionKind, ...rest } = patch;
    await writeJson('/api/me/alert-subscriptions', token, 'PATCH', {
      riverId: rule.riverId,
      ...rest,
      ...(conditionKind ? { kind: conditionKind } : {}),
    });
    return;
  }
  await writeJson(`/api/me/gauge-alerts/${encodeURIComponent(rule.id)}`, token, 'PATCH', patch);
}

/** Delete one rule. Turning an alert off never demands a fresh sign-in. */
export async function deleteAlertRule(
  token: string,
  rule: Pick<AlertRule, 'id' | 'source' | 'riverId'>,
): Promise<void> {
  if (rule.source === 'river_condition') {
    if (!rule.riverId) throw new ApiError('Alert is missing its river', 400);
    await unsubscribeFromRiver(token, rule.riverId);
    return;
  }
  await authed(`/api/me/gauge-alerts/${encodeURIComponent(rule.id)}`, token, {
    method: 'DELETE',
  });
}

/** Quiet hours. Null when the session is unusable — never assume "none set". */
export async function fetchNotificationPreferences(
  token: string,
  signal?: AbortSignal,
): Promise<NotificationPreferences | null> {
  const data = await authed<NotificationPreferencesResponse>(
    '/api/me/notification-preferences',
    token,
    { signal },
  );
  return data?.preferences ?? null;
}

export async function updateNotificationPreferences(
  token: string,
  preferences: NotificationPreferences,
): Promise<NotificationPreferences> {
  const data = await writeJson<NotificationPreferencesResponse>(
    '/api/me/notification-preferences',
    token,
    'PUT',
    preferences,
  );
  return data.preferences;
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
 * Everything Eddy grades that is running high or in flood right now.
 *
 * A SNAPSHOT, not the change log /api/alerts serves. The two answer different
 * questions and the log answers this one badly: a river that crossed into high
 * nine days ago is absent from a seven-day window and very much present in the
 * water.
 *
 * Free and account-free, like the feed it replaced on that screen. High water
 * is safety information; it is never behind an account or a paywall.
 *
 * Throws on failure rather than returning an empty list — "nothing is high" is
 * good news somebody may act on, and a failed request must never be able to say
 * it. The screen catches and shows the error.
 */
export async function fetchHighWater(signal?: AbortSignal): Promise<HighWaterEntry[]> {
  const data = await get<HighWaterResponse>('/api/high-water', signal);
  return data.entries ?? [];
}

/**
 * Closures and weather warnings for Eddy's rivers, from the NPS and the NWS.
 *
 * NOT a sibling of fetchHighWater despite sitting next to it on screen. That
 * one carries Eddy's own verdicts, every row the output of a threshold ladder a
 * human set. Everything here is somebody else's — the Park Service's, the
 * Weather Service's — quoted rather than computed. See the note on RiverAlert
 * in @eddy/types for why the two are different types.
 *
 * Pass `riverSlug` to narrow it to one river; the server does the narrowing
 * before it fans out upstream, so a river screen does not pay for parks it has
 * nothing to do with.
 *
 * THROWS, for the same reason fetchHighWater does: an empty list means "the
 * agencies have published nothing", which a failed request must never be able
 * to claim on their behalf.
 */
export async function fetchRiverAlerts(
  riverSlug?: string,
  signal?: AbortSignal,
): Promise<RiverAlert[]> {
  const path = riverSlug
    ? `/api/river-alerts?riverSlug=${encodeURIComponent(riverSlug)}`
    : '/api/river-alerts';
  const data = await get<RiverAlertsResponse>(path, signal);
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

// ── Dams ─────────────────────────────────────────────────────────────────────
// Both routes are read-through to USACE CWMS and SWPA rather than served from a
// table, and both cache at the CDN for 15 minutes. Neither is paywalled for
// this app: withX402Route gates on isAiAgent(user-agent), and 'EddyiOS' is not
// one — so no 402 branch is needed here, unlike the metered routes above.

/**
 * Every USACE project Eddy tracks, with its current state and today's schedule.
 *
 * Returns [] on failure rather than throwing, matching fetchHazards. A map
 * layer that does not draw is an acceptable degradation; a thrown error here
 * would take down the map for a layer the user may not even have enabled.
 *
 * Ten dams, one request. Callers that need a specific dam's tailwater link or
 * its pin can filter this rather than asking per dam.
 */
export async function fetchDams(signal?: AbortSignal): Promise<DamSnapshot[]> {
  try {
    const data = await get<DamsResponse>('/api/dams', signal);
    return data.dams ?? [];
  } catch {
    return [];
  }
}

/**
 * One dam, with the multi-day hourly generation schedule the index omits.
 *
 * SHAPE WARNING: this route answers with the snapshot BARE, not wrapped under a
 * key. Every other detail fetch in this file unwraps one — `data.river`,
 * `data.gauge`, `data.plan` — so the reflexive `data.dam` here silently yields
 * undefined. The server is public and priced to agents; the asymmetry is its
 * contract, not a bug to fix from this side.
 *
 * THROWS rather than returning null, for the same reason fetchAccessPointDetail
 * does: the screen was opened from a row that named this dam, so "it does not
 * exist" is a real failure the screen should state rather than absorb.
 */
export async function fetchDam(damId: string, signal?: AbortSignal): Promise<DamSnapshot> {
  return get<DamSnapshot>(`/api/dams/${encodeURIComponent(damId)}`, signal);
}

/**
 * Send a feedback / report-issue submission.
 *
 * UNAUTHENTICATED, and that is the route's design rather than an oversight on
 * this side: /api/feedback is public and rate-limited by IP so an accountless
 * visitor can report a wrong river mile. The app inherits that, which means
 * nobody has to sign in to say a gauge is off — and the people best placed to
 * say it are the ones who have not bothered making an account.
 *
 * THROWS with the server's own sentence on failure. The route validates the
 * email and the message and answers with wording written for a person; a form
 * that swallowed that and printed "something went wrong" would be hiding the
 * one thing the user can act on.
 */
export async function submitFeedback(input: CreateFeedbackRequest): Promise<FeedbackResponse> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/api/feedback`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify(input),
    });
  } catch {
    throw new ApiError('No connection');
  }

  const data = (await response.json().catch(() => null)) as FeedbackResponse | null;
  if (!response.ok || !data?.success) {
    throw new ApiError(data?.error ?? `Request failed (${response.status})`, response.status);
  }
  return data;
}
