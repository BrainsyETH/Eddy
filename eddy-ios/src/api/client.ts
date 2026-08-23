// eddy-ios/src/api/client.ts
// Thin client over the existing Next.js REST API, which the app consumes as a
// headless backend. No auth yet — every endpoint used by the shell is public.
//
// The User-Agent is deliberate: the backend runs an x402 layer that charges AI
// crawlers, and it matches on UA. Identifying as EddyiOS keeps our own app on
// the free path (see src/lib/x402/ in the web app).

import Constants from 'expo-constants';
// Types only — erased at compile time. The MODULE is required lazily in
// uploadCommunityPhoto, so a build without the native side still starts.
import type * as ExpoFileSystem from 'expo-file-system';
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
  PublicLandsResponse,
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
  EddyUpdateEntry,
  EddyUpdatesResponse,
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
  AlertRuleSeed,
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
import type { CampsiteSitesResponse } from '@eddy/types';
import type { ServerStar } from '@eddy/sync';
import type { StatewideReading, StatewideRiver } from '@/lib/statewideNetwork';
import {
  readMeta,
  writeCondition,
  writeIndex,
  writeMeta,
  writeNetwork,
  writePart,
  writeRiver,
} from '@/lib/riverCache';
import { CACHE_VERSION } from '@/lib/offline-cache';
import { report, warn } from '@/lib/monitoring';

const BASE_URL =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ?? 'https://eddy.guide';

export const USER_AGENT = 'EddyiOS/0.1';

export class ApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * How long any one request may hang before it counts as no connection.
 *
 * There was no deadline at all, which sounds harmless and is not: `fetch` on
 * iOS inherits NSURLSession's 60-second default, so a request that stalls
 * rather than fails leaves a spinner up for a full minute. That is the ordinary
 * state of one bar of LTE at a put-in — the exact conditions this app exists
 * for — and the screen already has good copy for it that it simply never got
 * to show.
 *
 * 15s is chosen against the slowest thing the app asks for on a cold start
 * (`/api/usgs/mo-dataset?slim=1`, ~260 KB and CDN-cached) with room to spare on
 * a bad connection, and it is short enough that a person still believes the
 * answer relates to the tap.
 */
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * The deadline for work nobody is waiting on.
 *
 * 15s is calibrated against a person holding a phone — short enough that the
 * answer still feels related to the tap. The offline bundle seed has no such
 * person: it runs at module scope on launch, nothing on screen depends on it,
 * and the only cost of it taking a while is that it takes a while.
 *
 * It is also the slowest thing the app asks for. The route assembles 25 rivers
 * on a cold edge cache, so a 15s deadline would abandon precisely the first
 * fetch — the one on a fresh install, with nothing yet on disk, which is the
 * install that most needs it to land.
 */
const BACKGROUND_TIMEOUT_MS = 60_000;

/**
 * A caller's signal and our deadline, as one signal.
 *
 * Hand-rolled on purpose. `AbortSignal.timeout()` and `AbortSignal.any()` are
 * the obvious way to write this and neither can be relied on here — Hermes is
 * not a browser and both are recent platform additions, so this has to work
 * with nothing but AbortController and setTimeout.
 *
 * The two reasons for aborting must stay distinguishable: a screen unmounting
 * is not a failure and must never surface, while a timeout is "no connection"
 * and must. `timedOut` carries that, because by the time the rejection arrives
 * the only thing either case says is `AbortError`.
 */
function withDeadline(caller?: AbortSignal, timeoutMs: number = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const state = { timedOut: false };

  if (caller?.aborted) controller.abort();
  const onCallerAbort = () => controller.abort();
  caller?.addEventListener('abort', onCallerAbort);

  const timer = setTimeout(() => {
    state.timedOut = true;
    controller.abort();
  }, timeoutMs);

  return {
    signal: controller.signal,
    get timedOut() {
      return state.timedOut;
    },
    /**
     * Must run on every path, including the successful one. A pending timer
     * holds a reference to its controller and would fire minutes later against
     * a request that finished — harmless to the response, but it keeps the
     * closure alive and, on a screen that polls, accumulates.
     */
    done() {
      clearTimeout(timer);
      caller?.removeEventListener('abort', onCallerAbort);
    },
  };
}

/**
 * One fetch under a deadline, for the handful of one-off calls that build their
 * request inline rather than going through get()/authed()/writeJson().
 *
 * Exists so the deadline cannot be half-applied. Attaching the signal and
 * forgetting done() leaves a live timer holding its controller for the full
 * timeout after the request already finished, which is exactly the mistake this
 * shape makes unavailable.
 */
async function fetchOnce(
  url: string,
  deadline: ReturnType<typeof withDeadline>,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: deadline.signal });
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    throw new ApiError(aborted && !deadline.timedOut ? 'Request cancelled' : 'No connection');
  } finally {
    deadline.done();
  }
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const deadline = withDeadline(signal);
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      signal: deadline.signal,
    });
  } catch (err) {
    // Offline is the expected case on a river, not an exceptional one — give
    // the UI something it can phrase kindly.
    //
    // A timeout is NOT a cancellation, even though both arrive as AbortError.
    // Screens drop 'Request cancelled' on the floor by design, so reporting a
    // stalled request that way would replace a minute-long spinner with a
    // silent one that never resolves.
    const aborted = err instanceof Error && err.name === 'AbortError';
    throw new ApiError(aborted && !deadline.timedOut ? 'Request cancelled' : 'No connection');
  } finally {
    deadline.done();
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
  const deadline = withDeadline(init?.signal);
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: deadline.signal,
    });
  } catch (err) {
    // Same shape as get(). This path used to let a raw TypeError out of a
    // module whose whole error surface is ApiError, so a caller narrowing on
    // ApiError — which several do, to tell 'Request cancelled' from a real
    // failure — saw a network drop as something unrecognised.
    const aborted = err instanceof Error && err.name === 'AbortError';
    throw new ApiError(aborted && !deadline.timedOut ? 'Request cancelled' : 'No connection');
  } finally {
    deadline.done();
  }

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
      provider: entry.provider ?? null,
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

/**
 * Eddy's written conditions prose, every river plus the statewide summary.
 *
 * ONE batched, CDN-cached, unauthenticated request — the same one the website
 * makes. Nothing here is the paywalled per-river read; that is the outlook
 * endpoint and a different artifact.
 *
 * The statewide entry is keyed "global" and is simply ABSENT when the server
 * has decided it can no longer stand behind it — a river has flooded since it
 * was written, or it has aged out. Callers must treat the missing key as "say
 * nothing" and never fall back to a previously fetched one; see
 * missouri-float-planner/src/lib/eddy/global-prose-gate.ts.
 */
export async function fetchEddyUpdates(
  signal?: AbortSignal,
): Promise<Record<string, EddyUpdateEntry>> {
  const data = await get<EddyUpdatesResponse>('/api/eddy-updates', signal);
  return data.updates ?? {};
}

/** All curated Eddy Rivers with their current condition. */
export async function fetchRivers(signal?: AbortSignal): Promise<RiverListItem[]> {
  const data = await get<RiversResponse>('/api/rivers', signal);
  const rivers = data.rivers ?? [];
  // WRITE-THROUGH, fire and forget. This module is deliberately write-only to
  // the cache: a fetcher that silently substituted stored data on failure would
  // take away the caller's ability to SAY it is stored, which is the whole
  // point of keeping it. Reading is the screen's job.
  writeIndex(rivers);
  return rivers;
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
  writePart(slug, 'river', data.river);
  return data.river;
}

/**
 * Approved access points, ordered from headwaters downstream.
 *
 * `include=non_endpoints` asks for the approved places that sit on the river
 * without being launches — Montauk State Park at the Current's headwaters is the
 * one this was added for. The route withholds them by default because every
 * build shipped before `isFloatEndpoint` existed would put them straight into
 * the put-in picker; asking for them is this client stating that it draws them
 * and filters them out of the pickers (useFloatPlan.putInOptions).
 *
 * Do not send this parameter from anything that cannot honour that.
 */
export async function fetchRiverAccessPoints(
  slug: string,
  signal?: AbortSignal,
): Promise<MapAccessPoint[]> {
  const data = await get<AccessPointsResponse>(
    `/api/rivers/${encodeURIComponent(slug)}/access-points?include=non_endpoints`,
    signal,
  );
  const accessPoints = data.accessPoints ?? [];
  writePart(slug, 'accessPoints', accessPoints);
  return accessPoints;
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
/**
 * Every individual campsite at one campground, with its fortnight.
 *
 * Asked for only when the map sheet's Camping tab becomes the active one — a
 * busy state park is nearly two hundred sites, and nobody who tapped a put-in
 * to check the water should pay for them.
 *
 * Answers null on failure rather than throwing, unlike fetchAccessPointDetail.
 * The distinction is the same one that file draws: a missing access point is a
 * bad route and a real failure, while a campground with no site list is an
 * ordinary state — most campgrounds are not linked to a booking system Eddy can
 * read — and the tab above it is useful without this.
 */
export async function fetchCampsiteSites(
  facilityId: string,
  signal?: AbortSignal,
): Promise<CampsiteSitesResponse | null> {
  try {
    return await get<CampsiteSitesResponse>(
      `/api/campsites?facility=${encodeURIComponent(facilityId)}`,
      signal,
    );
  } catch (err) {
    // ── A 404 is an answer; everything else is a failure ──────────────────
    // The route answers 404 for a campground Eddy does not track sites for,
    // which is most of them and is an ordinary state — the tab renders nothing,
    // the same way the availability line does when it has nothing to say.
    //
    // EVERY OTHER ERROR RETHROWS. Swallowing them into the same null made a
    // dead network indistinguishable from an untracked campground, and the hook
    // read that null as a successful empty answer — so a reader with no signal
    // sat on "Loading sites…" forever, with nothing left to resolve it.
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

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
 * The geometry here is NOT coarser than fetchRiverDetail's, which this comment
 * claimed for a long time and which shaped the offline plan until it was
 * checked. Both are a bare ST_AsGeoJSON over the same rivers.geom column with
 * no ST_Simplify anywhere (00122 line 36, and 00003's
 * get_river_geometry_json). The difference is scope, not resolution: that one
 * loads a river at a time, this one loads all of them.
 *
 * Which is why the write-through below is free. Every river's full line lands
 * on disk from a request the Map tab already makes on every open.
 */
export async function fetchStatewideNetwork(signal?: AbortSignal): Promise<StatewideRiver[]> {
  const data = await get<{ rivers?: StatewideRiver[] }>('/api/usgs/mo-dataset?slim=1', signal);
  const rivers = data.rivers ?? [];
  writeNetwork(rivers);
  return rivers;
}

/**
 * Seed the on-disk cache for EVERY river from one request.
 *
 * The write-throughs above only ever cache a river somebody opened, which
 * leaves the common case broken: a person who installs Eddy at home, drives to
 * a put-in and opens a river for the first time with no signal. This closes
 * that — after one online launch, all 25 rivers have their line, put-ins and
 * hazards on the phone.
 *
 * Runs on launch, never blocks a render, and is silent on failure: the cache is
 * an optimisation on the good path and a courtesy on the bad one, and whatever
 * is already stored stays stored.
 *
 * ── Why this is a hand-rolled fetch and not get() ──────────────────────────
 *
 * get() returns a parsed body, and this needs the RESPONSE — specifically the
 * ETag header and the 304 status. That 304 is the whole point: the payload
 * changes about monthly, so almost every launch should be a conditional
 * request that transfers nothing.
 */
export async function seedOfflineBundle(): Promise<void> {
  const deadline = withDeadline(undefined, BACKGROUND_TIMEOUT_MS);
  try {
    const { bundleEtag } = await readMeta();

    const response = await fetch(`${BASE_URL}/api/offline/bundle`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
        ...(bundleEtag ? { 'If-None-Match': bundleEtag } : {}),
      },
      signal: deadline.signal,
    });

    // Nothing changed since the copy on disk. The overwhelmingly common case.
    if (response.status === 304) return;
    if (!response.ok) return;

    const body = (await response.json()) as {
      v?: number;
      rivers?: {
        slug?: string;
        river?: RiverDetail;
        accessPoints?: MapAccessPoint[];
        hazards?: Hazard[];
        reaches?: RiverReach[];
      }[];
    };

    // A version we do not know how to read is treated as absent rather than
    // partially applied — the same rule parseEnvelope follows, and for the same
    // reason: half-understood data on disk is worse than none.
    if (body.v !== CACHE_VERSION) return;

    const rivers = body.rivers ?? [];
    if (rivers.length === 0) return;

    const etag = response.headers.get('etag');
    const fetchedAt = new Date().toISOString();

    for (const entry of rivers) {
      if (!entry.slug) continue;
      // Services are absent from the bundle by design and must not be written
      // as an empty array here — that would tell the river screen this river
      // has no outfitters, which is the failure-as-absence bug again.
      writeRiver(
        entry.slug,
        {
          river: entry.river,
          accessPoints: entry.accessPoints,
          hazards: entry.hazards,
          reaches: entry.reaches,
        },
        fetchedAt,
        etag,
      );
    }

    writeMeta({ bundleEtag: etag, bundleFetchedAt: fetchedAt });
    // The access points ride out to whoever is drawing them — see the note on
    // the listener set below. Straight from the payload, not re-read from disk:
    // writeRiver enqueues, so the disk is behind us by a frame or two here.
    notifyBundleSeeded(
      rivers.flatMap((entry) =>
        entry.slug
          ? [
              {
                riverSlug: entry.slug,
                accessPoints: entry.accessPoints ?? [],
                hazards: entry.hazards ?? [],
              },
            ]
          : [],
      ),
    );
  } catch (err) {
    warn('cache', 'could not seed the offline bundle', err);
  } finally {
    deadline.done();
  }
}

/**
 * Told when the launch bundle brings in a river's static data.
 *
 * ── The one case this exists for ───────────────────────────────────────────
 *
 * The Map tab draws every river's put-ins and hazards out of the on-disk cache,
 * which is instant on the second launch and EMPTY on the first — the bundle is
 * still in flight while the map paints. Without a signal the map would sit with
 * no put-ins and no hazards on it until something else happened to re-render
 * it, which on the opening screen is nothing at all.
 *
 * A listener set rather than a state library because this app has no state
 * library, and one module-scope Set is a smaller thing to own than a
 * subscription abstraction with one publisher and one subscriber.
 */
type BundleSeededPayload = {
  riverSlug: string;
  accessPoints: MapAccessPoint[];
  hazards: Hazard[];
}[];
const bundleListeners = new Set<(payload: BundleSeededPayload) => void>();

function notifyBundleSeeded(payload: BundleSeededPayload): void {
  if (payload.length === 0) return;
  for (const listener of bundleListeners) {
    // One bad listener must not stop the rest, and must never take down a
    // background seed that has already done its real work.
    try {
      listener(payload);
    } catch (err) {
      warn('cache', 'a bundle listener threw', err);
    }
  }
}

/** Subscribe. Returns the unsubscribe, for an effect cleanup. */
export function onOfflineBundleSeeded(
  listener: (payload: BundleSeededPayload) => void,
): () => void {
  bundleListeners.add(listener);
  return () => bundleListeners.delete(listener);
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

export async function fetchGaugeCount(signal?: AbortSignal): Promise<number | null> {
  const data = await get<{ count: number | null }>('/api/gauges/count', signal);
  return typeof data.count === 'number' && Number.isFinite(data.count) ? data.count : null;
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
 * Public land boundaries inside a viewport, from USGS PAD-US.
 *
 * OWNERSHIP, NOT PERMISSION. A polygon this returns says a public agency owns
 * the ground and says nothing about whether anyone may camp on it, portage
 * across it or step out of the boat onto it. Every consumer has to carry that —
 * see PUBLIC_LAND_OWNERSHIP_NOTE, which is the sentence to put on screen.
 *
 * The geometry comes back CLIPPED to the bbox and simplified for the zoom, which
 * is why `zoom` is a parameter and not an optimisation: Mark Twain National
 * Forest is 59,080 vertices statewide, and a phone looking at eight miles of
 * river needs the handful of them that are on screen. The server picks the
 * tolerance so the two clients cannot disagree about it.
 *
 * Callers must quantize and pad the bbox first (`quantizeBbox`/`padBbox` in
 * @eddy/geo), for the same reason fetchMapGauges says so: a raw camera bbox is a
 * fresh URL on every pan, and this response is otherwise the most cacheable
 * thing the API serves.
 */
export async function fetchPublicLands(
  bbox: [number, number, number, number],
  zoom: number,
  signal?: AbortSignal,
): Promise<PublicLandsResponse> {
  const params = new URLSearchParams({ bbox: bbox.join(','), zoom: String(Math.round(zoom)) });
  const data = await get<PublicLandsResponse>(`/api/public-lands?${params.toString()}`, signal);
  return {
    type: 'FeatureCollection',
    features: data.features ?? [],
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
 * NULL MEANS "THERE IS NO SUCH STATION", AND NOTHING ELSE.
 *
 * A 404 is an answer: the route says it has no record, and a website deployed
 * before this endpoint existed says the same thing about every station. Both
 * are honest nulls, and callers keep whatever the tapping surface already held
 * — a MapGauge from the curated list, a MapGaugeLite from the viewport — so a
 * screen with a reading on it never blanks.
 *
 * EVERY OTHER FAILURE THROWS, and that is the correction. This used to swallow
 * all of them into the same null, which handed useGaugeDetail a settled,
 * successful, empty answer — so its `failed` branch was unreachable and the
 * Levels tab read `thresholds: null` and said "Eddy has not rated this station
 * against a river yet" about a station whose ladder had just graded the pin the
 * reader tapped. A 500 has to look like a 500 by the time it reaches a tab that
 * words the difference.
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
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
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
 * THREE-VALUED, and the distinction is load-bearing rather than tidy:
 *
 *   response — readings, possibly an empty array. The station answered.
 *   null     — 404. The endpoint's own "nothing here": no such station, or a
 *              deploy without this route. An answer, and cacheable as one.
 *   undefined — the request FAILED. Network, timeout, 5xx, or cancellation.
 *              Says nothing about the station and must never be cached.
 *
 * It used to collapse all three into null, which let one timeout at a put-in
 * print "no history for this gauge" under a station with ten years of it — and
 * cache that verdict for the life of the screen. This function is the only
 * place that can tell the difference, because it is the only one holding the
 * status code, so it is where the difference has to be drawn.
 */
export async function fetchGaugeHistory(
  siteId: string,
  days: number,
  signal?: AbortSignal,
): Promise<GaugeHistoryResponse | null | undefined> {
  try {
    return await get<GaugeHistoryResponse>(
      `/api/gauges/${encodeURIComponent(siteId)}/history?days=${days}`,
      signal,
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    return undefined;
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
  const reaches = data.reaches ?? [];
  writePart(slug, 'reaches', reaches);
  return reaches;
}

/**
 * Every service that can be drawn on a map, statewide.
 *
 * The map's campground and outfitter layers used to be built from the per-river
 * directory, which meant they held nothing until a river was chosen and then
 * held that river's two or three. This is one request for all of them.
 *
 * NOT a replacement for fetchRiverServices — the river screen wants the full
 * directory record for one river, including services with no geocode, which a
 * map layer has no way to draw and no reason to hold.
 *
 * ── NULL ON FAILURE, NEVER [] ─────────────────────────────────────────────
 *
 * This used to answer `[]`, on the argument that "an outfitter layer that draws
 * nothing is a fair outcome of a request that did not come back". Drawing
 * nothing is fair. SAYING nothing is not, and an empty array says something: it
 * is indistinguishable from a directory that genuinely holds no services, so
 * the layers sheet printed a confident `0` beside three rows for a question it
 * had never got an answer to. That is the exact distinction that sheet's own
 * header is emphatic about — "a layer that has never been fetched must not
 * claim zero of anything" — and this function was quietly defeating it.
 *
 * It matters more now than it did: this one response drives the campground,
 * rentals and lodging layers, their counts, and the coverage sentence under
 * each. A failure that reads as emptiness makes all five wrong at once.
 *
 * Still does not throw. The map must survive this, and a null the caller can
 * leave in place is how it does — every count stays `undefined`, which those
 * components already render as absent rather than as zero.
 */
export async function fetchServices(signal?: AbortSignal): Promise<RiverService[] | null> {
  try {
    const data = await get<ServicesResponse>('/api/services', signal);
    return data.services ?? [];
  } catch {
    return null;
  }
}

export async function fetchRiverServices(
  slug: string,
  signal?: AbortSignal,
): Promise<RiverService[]> {
  const data = await get<ServicesResponse>(
    `/api/rivers/${encodeURIComponent(slug)}/services`,
    signal,
  );
  const services = data.services ?? [];
  writePart(slug, 'services', services);
  return services;
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
  const deadline = withDeadline();
  const response = await fetchOnce(`${BASE_URL}/api/plan/save`, deadline, {
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
  page?: { limit?: number; offset?: number; offsets?: Partial<Record<SearchResultKind, number>> },
): Promise<{ results: SearchResult[]; available: boolean; hasMore: boolean }> {
  try {
    const scope = kinds?.length ? `&kinds=${kinds.join(',')}` : '';
    const limit = page?.limit ?? SEARCH_PAGE_SIZE;
    const offset = page?.offset ?? 0;
    // Where each kind has got to, for a caller asking for more than one. There
    // is no single `offset` that describes three kinds paging at their own
    // rates, so a multi-kind caller states them and the server reads them per
    // kind. Sent ALONGSIDE `offset`, never instead of it: a deployment older
    // than this parameter ignores it and still gets a usable — if flatter —
    // answer from the number it does understand.
    const perKind = page?.offsets
      ? Object.entries(page.offsets)
          .filter(([, v]) => typeof v === 'number' && v > 0)
          .map(([k, v]) => `${k}:${v}`)
          .join(',')
      : '';
    const offsets = perKind ? `&offsets=${encodeURIComponent(perKind)}` : '';
    const data = await get<SearchResponse>(
      `/api/search?q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}${offsets}${scope}`,
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
  const condition = data.available ? (data.condition ?? null) : null;
  // The one piece of live water state kept on disk, and kept ONLY so it can be
  // aged and labelled — never re-shown as current. See readingBand.
  if (condition) writeCondition(riverId, condition);
  return condition;
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
  const hazards = data.hazards ?? [];
  writePart(slug, 'hazards', hazards);
  return hazards;
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
  const deadline = withDeadline();
  const response = await fetchOnce(`${BASE_URL}/api/me/alert-subscriptions`, deadline, {
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
  /**
   * The river alert this rule is part of.
   *
   * Sent ONLY by RiverGaugeAlerts, which lives inside a river alert's edit
   * screen. It makes the new rule a child: the parent's switch gates it, and
   * deleting the parent deletes it. A rule created anywhere else omits this and
   * stands on its own, which is what keeps a custom level set from the gauge
   * screen from being silenced by a river alert it has nothing to do with.
   */
  parentSubscriptionId?: string;
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
  const deadline = withDeadline();
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
      signal: deadline.signal,
    });
  } catch {
    // No caller signal to distinguish here — every abort on this path is our
    // own deadline, and these are taps with a spinner attached.
    throw new ApiError('No connection');
  } finally {
    deadline.done();
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

export interface UpdateAlertRuleResult {
  /**
   * The rule as the server now holds it, for the caller to replace its copy
   * with. Null for a river subscription, whose PATCH answers with a
   * subscription shape rather than an AlertRule — there is nothing to
   * reconcile there anyway, since the fields that can drift are the threshold
   * ones and a river subscription has none.
   */
  rule: AlertRule | null;
  seed: AlertRuleSeed | null;
}

/**
 * Edit one rule, whichever table it lives in.
 *
 * The two are addressed differently and that is not incidental: a gauge rule is
 * keyed by its own id, while a river subscription is keyed by riverId, because
 * the bell that edits one knows the river and nothing else. `rule.source` picks
 * the shape, so no caller has to.
 *
 * Returns the SAVED rule as well as the seed. The route has always sent it and
 * this function used to drop it, leaving every caller to guess at the result
 * from its own patch — which is a guess that goes wrong wherever the server
 * derives one field from another. Switching a rule off `between` is the case
 * that shipped: the route nulls threshold_value_max, the optimistic patch has
 * no way to know that, and the stale upper bound sat in the list until the next
 * refetch.
 */
export async function updateAlertRule(
  token: string,
  rule: Pick<AlertRule, 'id' | 'source' | 'riverId'>,
  patch: UpdateAlertRuleInput,
): Promise<UpdateAlertRuleResult> {
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
    // A river condition subscription has no user-set level, so it has no
    // crossing state to re-seed and nothing to report.
    return { rule: null, seed: null };
  }
  // The seed comes back whenever the threshold moved. Moving it re-arms the
  // rule from the CURRENT reading, and if the river is already past the new
  // number the rule will sit silent until it comes back — which the caller has
  // to be able to say out loud.
  const response = await writeJson<AlertRuleResponse>(
    `/api/me/gauge-alerts/${encodeURIComponent(rule.id)}`,
    token,
    'PATCH',
    patch,
  );
  return { rule: response.rule ?? null, seed: response.seed };
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
 * Hand Apple's authorization code to the server, which exchanges it for a
 * refresh token and keeps it against account deletion.
 *
 * Guideline 5.1.1(v) — see the call site in useSession. The code is single-use
 * and expires in about five minutes, so this is called immediately after
 * sign-in and never retried later; there would be nothing left to redeem.
 */
export async function storeAppleAuthorizationCode(
  token: string,
  authorizationCode: string,
): Promise<void> {
  await authed('/api/me/apple-token', token, {
    method: 'POST',
    body: { authorizationCode },
  });
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
  const deadline = withDeadline();
  const response = await fetchOnce(`${BASE_URL}/api/me`, deadline, {
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
 * ── IT THROWS NOW, AND THAT IS THE FIX ───────────────────────────────────
 *
 * It used to answer `[]` on failure, reasoning that a layer which does not draw
 * is an acceptable degradation. Two things made that wrong. The route reads
 * through to CWMS and SWPA live, so a cold CDN entry costs five to fifty
 * seconds against this client's fifteen-second deadline — a timeout is the
 * ORDINARY outcome, not an exceptional one. And the caller's request latch was
 * set before the fetch and never reset, so that one timeout emptied the Lakes &
 * dams layer for the rest of the screen's life, with `[]` meaning both "the
 * Corps publishes no dams" and "we gave up waiting".
 *
 * Those are different facts and the caller now has to tell them apart: the map
 * draws its pins from the shipped catalog either way (src/lib/damCatalog.ts) and
 * retries a failure rather than adopting it as an answer.
 *
 * Two dozen dams, one request. Callers that need a specific dam's tailwater link
 * can filter this rather than asking per dam.
 */
export async function fetchDams(signal?: AbortSignal): Promise<DamSnapshot[]> {
  const data = await get<DamsResponse>('/api/dams', signal);
  return data.dams ?? [];
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
 * Every client uses /api/feedback so its contact validation, feedback-type
 * allowlist and IP rate limit run before the report is written.
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

// ── Community photos ────────────────────────────────────────────────────────
// Two calls, in this order, matching what the website's submit form does:
//   1. POST /api/upload  → the bytes go to a PRIVATE quarantine bucket and come
//      back as a storage path, never a URL. Nothing is publicly reachable until
//      a moderator verifies the report it belongs to.
//   2. POST /api/reports → the report itself, carrying that path.
//
// Both are rate-limited by IP (10 uploads and 5 reports per quarter hour).

/** What the quarantine upload answers with. A path, deliberately not a URL. */
interface UploadResponse {
  success?: boolean;
  path?: string;
  error?: string;
}

/**
 * Send one photo to the quarantine bucket.
 *
 * Takes a local file URI from the picker and posts it as multipart. The
 * Content-Type header is NOT set here on purpose — fetch has to generate it
 * itself to include the multipart boundary, and setting it by hand produces a
 * body the server cannot parse.
 *
 * The route allows JPEG, PNG and WebP up to 3.5 MB and checks magic bytes rather
 * than trusting the declared type, so a mislabelled file is rejected there
 * rather than stored.
 */
/**
 * expo-file-system, lazily. Same posture as every other native module in this
 * app: a module that cannot load must cost you ITS feature, never the app. The
 * photo sheet's own photoCaptureAvailable() already gates on this, so reaching
 * here without it means the sheet opened when it should not have.
 */
function loadFileSystem(): typeof ExpoFileSystem | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-file-system') as typeof ExpoFileSystem;
  } catch {
    return null;
  }
}

export async function uploadCommunityPhoto(
  file: { uri: string; name: string; type: string },
  signal?: AbortSignal,
): Promise<string> {
  // ── WHY THIS IS NOT fetch + FormData ANY MORE ────────────────────────────
  //
  // It was, and it threw `Unsupported FormDataPart implementation` on every
  // attempt — which is why no photo submitted from the app has ever reached
  // the server, while the same multipart payload from curl answers 200.
  //
  // The old code appended React Native's `{uri, name, type}` file shape and
  // cast it to Blob, with a comment explaining that RN's FormData accepts that
  // object even though the DOM types do not. That WAS true. It stopped being
  // true in this RN version, whose networking layer rejects any part that is
  // not a string or a Blob it recognises — and it rejects it inside fetch, so
  // the failure surfaced as a thrown TypeError indistinguishable from being
  // offline. Hence "No connection", on a working connection.
  //
  // expo-file-system's upload task builds the multipart body natively from the
  // file URI, so there is no FormData part to be unsupported. It is also the
  // module the size check already depends on, so this adds no new dependency.
  const fs = loadFileSystem();
  if (!fs) throw new ApiError('Photo upload is unavailable in this build.');

  const task = new fs.File(file.uri).createUploadTask(`${BASE_URL}/api/upload`, {
    httpMethod: 'POST',
    uploadType: fs.UploadType.MULTIPART,
    // The route reads formData.get('file') and validates the part's own
    // content-type against JPEG/PNG/WebP before checking magic bytes. It never
    // reads the filename, so mimeType is the field that has to be right.
    fieldName: 'file',
    mimeType: file.type,
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
  });

  // withDeadline cannot be used here — it works by aborting a fetch signal, and
  // there is no fetch. The task has its own cancel(), so the deadline is a timer
  // that calls it, and the two abort reasons stay distinguishable the same way.
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    task.cancel();
  }, BACKGROUND_TIMEOUT_MS);
  const onCallerAbort = () => task.cancel();
  signal?.addEventListener('abort', onCallerAbort);

  let result: ExpoFileSystem.UploadResult;
  try {
    result = await task.uploadAsync();
  } catch (err) {
    // The task rejects on cancel too, so which cancel it was decides the copy.
    if (timedOut) throw new ApiError('Upload timed out. Try again on a stronger connection.');
    if (signal?.aborted) throw new ApiError('Request cancelled');
    // REPORT BEFORE REPLACING. Everything that is not an abort lands here, and
    // "No connection" is a guess about which of them happened — a genuinely
    // unreachable network looks identical to a file URI fetch cannot read, a
    // body the platform rejected before the function ran, or a multipart shape
    // the runtime would not build. Swallowing the original left the one string
    // that names the cause nowhere at all: the route answers 200 to the same
    // payload from curl, so the interesting failures are all on this side.
    //
    // warn() AS WELL AS report(), and the order matters. report() returns early
    // when monitoring is disabled — which is Expo Go, dev, and any build
    // without a DSN, i.e. exactly where someone is standing when they try to
    // reproduce this. warn() console.warns first and unconditionally, so the
    // underlying error reaches the Metro log of the session that hit it.
    warn('photo', 'upload failed before a response', {
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      uriScheme: file.uri.split(':')[0] ?? 'unknown',
      declaredType: file.type,
    });
    report(err, {
      operation: 'upload.communityPhoto',
      uriScheme: file.uri.split(':')[0] ?? 'unknown',
      declaredType: file.type,
    });
    throw new ApiError('No connection. Check your signal and try again.');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onCallerAbort);
  }

  // UploadResult.body is the raw response string, not a parsed object — the
  // native task has no idea the endpoint speaks JSON.
  let data: UploadResponse | null = null;
  try {
    data = JSON.parse(result.body) as UploadResponse;
  } catch {
    // Left null: a non-JSON body is a platform error page, not an answer, and
    // the status below says more about it than a parse failure would.
  }

  if (result.status < 200 || result.status >= 300 || !data?.path) {
    throw new ApiError(
      result.status === 413 ? 'That photo is too large.' : (data?.error ?? `Upload failed (${result.status})`),
      result.status,
    );
  }
  return data.path;
}

/**
 * What a river-visual report carries.
 *
 * Mirrors the website's payload field for field. `latitude`/`longitude` are
 * REQUIRED by the route and validated against a corridor around the river —
 * a photo pinned in the next county is rejected server-side — which is why the
 * submit sheet requires an access point rather than letting them default.
 */
export interface RiverVisualSubmission {
  riverId: string;
  latitude: number;
  longitude: number;
  imagePath: string;
  accessPointId?: string;
  gaugeStationId?: string;
  description?: string;
  gaugeHeightFt?: number;
  dischargeCfs?: number;
  submitterName?: string;
  /** ISO date the photo was taken, from EXIF where the picker supplied it. */
  capturedAt?: string;
  /**
   * Where the reading came from, so a moderator can weigh it.
   *
   * Send 'manual' or send nothing. The other two describe work the SERVER does
   * (it resolves the reach gauge and reads USGS at `capturedAt`), so only the
   * server can label them honestly — omitting this lets it say which branch ran.
   */
  readingSource?: 'live' | 'historical' | 'manual';
}

/**
 * File the report that makes an uploaded photo real.
 *
 * Lands as `status: 'pending'`. Nothing appears in the gallery until a
 * moderator verifies it, at which point the image is copied out of quarantine
 * into the public bucket — see applyMediaTransitions on the server.
 */
export async function submitRiverVisual(
  input: RiverVisualSubmission,
  signal?: AbortSignal,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/api/reports`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify({ ...input, type: 'river_visual' }),
      signal,
    });
  } catch (err) {
    throw new ApiError(
      err instanceof Error && err.name === 'AbortError' ? 'Request cancelled' : 'No connection',
    );
  }

  if (!response.ok) {
    // The route rejects a photo outside the river's corridor with a sentence
    // written for a person. Carry it through rather than inventing one.
    const detail = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(detail?.error ?? `Submit failed (${response.status})`, response.status);
  }
}
