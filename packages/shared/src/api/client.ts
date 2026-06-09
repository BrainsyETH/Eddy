// Typed client for the Eddy REST API (the Next.js route handlers in apps/web).
// Platform-agnostic: works in the browser, Node, and React Native — the caller
// supplies the base URL (web uses relative '', mobile uses https://eddy.guide).

import type {
  AccessPointsResponse,
  ConditionResponse,
  GaugeHistoryResponse,
  GaugesListResponse,
  MyPlansResponse,
  PlanResponse,
  RiverDetailResponse,
  RiversResponse,
  SavePlanRequest,
  SavePlanResponse,
  VesselTypesResponse,
} from '../types/api';

export class ApiError extends Error {
  constructor(
    public status: number,
    public url: string,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface EddyApiClientOptions {
  /** Origin of the API, e.g. 'https://eddy.guide'. Empty string for same-origin (web). */
  baseUrl: string;
  /** Extra headers sent with every request. */
  headers?: Record<string, string>;
  /**
   * Called before each request; when it returns a token, it is sent as
   * `Authorization: Bearer <token>`. Lets mobile attach the current Supabase
   * access token without recreating the client on auth changes.
   */
  getAccessToken?: () => Promise<string | null>;
  /** Custom fetch implementation; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export interface PlanQuery {
  riverId: string;
  startId: string;
  endId: string;
  vesselTypeId: string;
}

export function createEddyApiClient(options: EddyApiClientOptions) {
  const { baseUrl, headers = {}, getAccessToken, fetchImpl = fetch } = options;

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${baseUrl}${path}`;
    const token = getAccessToken ? await getAccessToken() : null;
    const res = await fetchImpl(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...headers,
        ...(init?.headers as Record<string, string> | undefined),
      },
    });
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const body = (await res.json()) as { error?: string };
        if (body.error) detail = body.error;
      } catch {
        // non-JSON error body; keep statusText
      }
      throw new ApiError(res.status, url, detail);
    }
    return (await res.json()) as T;
  }

  return {
    getRivers: () => request<RiversResponse>('/api/rivers'),

    getRiver: (slug: string) =>
      request<RiverDetailResponse>(`/api/rivers/${encodeURIComponent(slug)}`),

    getRiverAccessPoints: (slug: string) =>
      request<AccessPointsResponse>(
        `/api/rivers/${encodeURIComponent(slug)}/access-points`
      ),

    getGauges: () => request<GaugesListResponse>('/api/gauges'),

    getGaugeHistory: (siteId: string, days = 7) =>
      request<GaugeHistoryResponse>(
        `/api/gauges/${encodeURIComponent(siteId)}/history?days=${days}`
      ),

    getCondition: (riverId: string) =>
      request<ConditionResponse>(
        `/api/conditions/${encodeURIComponent(riverId)}`
      ),

    getVesselTypes: () => request<VesselTypesResponse>('/api/vessel-types'),

    getPlan: (query: PlanQuery) => {
      const params = new URLSearchParams(
        query as unknown as Record<string, string>
      );
      return request<PlanResponse>(`/api/plan?${params.toString()}`);
    },

    savePlan: (body: SavePlanRequest) =>
      request<SavePlanResponse>('/api/plan/save', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    getSavedPlan: (shortCode: string) =>
      request<PlanResponse>(`/api/plan/${encodeURIComponent(shortCode)}`),

    /** Saved plans for the signed-in user. Requires getAccessToken. */
    getMyPlans: () => request<MyPlansResponse>('/api/plan/mine'),
  };
}

export type EddyApiClient = ReturnType<typeof createEddyApiClient>;
