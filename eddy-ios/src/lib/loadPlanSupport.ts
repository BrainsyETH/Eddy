// eddy-ios/src/lib/loadPlanSupport.ts
// The three requests behind the plan-support strip, and what survives failure.
//
// ── WHY THIS IS NOT IN planSupport.ts ─────────────────────────────────────
// That file is pure and testable because it is. "One of three requests failed"
// is not a question a pure function can be asked — it is orchestration, and
// putting it there would have meant either an untestable claim in a tested file
// or a component test the web suite has no renderer for. So the fetchers are
// injected and this is a plain async function the suite can drive with stubs.
//
// ── WHY allSettled AND NOT all ────────────────────────────────────────────
// `Promise.all` rejects on the first failure and discards the two results that
// arrived. Every one of these three is independently useful: a plan with a
// take-out group and no put-in group is still worth drawing, and the strip that
// preceded this one already treated a services failure as silence rather than
// as an error. So each lane fails to null on its own.
//
// No `@/` imports and no react-native, for the reason in planSupport.ts.

import type { AccessPointDetailResponse, FloatPlan, RiverService } from '@eddy/types';
import {
  groupEndpointServices,
  rankNearbyShuttles,
  type EndpointGroups,
  type RankedShuttle,
  type ServiceLike,
} from './planSupport';

export interface PlanSupportData {
  groups: EndpointGroups;
  nearest: RankedShuttle[];
}

export interface PlanSupportDeps {
  /** Resolves to null on any failure — including a route that cannot be built. */
  fetchDetail: (
    riverSlug: string,
    accessSlug: string,
    signal?: AbortSignal,
  ) => Promise<AccessPointDetailResponse>;
  fetchServices: (riverSlug: string, signal?: AbortSignal) => Promise<RiverService[]>;
  distance: (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => number;
  signal?: AbortSignal;
}

const EMPTY: PlanSupportData = {
  groups: { putIn: { camping: [], rentals: [] }, takeOut: { camping: [], rentals: [] } },
  nearest: [],
};

export function emptyPlanSupport(): PlanSupportData {
  return EMPTY;
}

/**
 * Everything the strip needs, fetched in parallel, degrading a lane at a time.
 *
 * The two detail requests are skipped rather than attempted when the plan
 * carries no slug for that end. `MapAccessPoint.slug` is optional and a shared
 * float arrives from the API without one, so this is a normal state and not an
 * error — the strip renders the ranked shuttles alone, which is exactly what it
 * did before endpoint groups existed.
 */
export async function loadPlanSupport(
  plan: FloatPlan,
  deps: PlanSupportDeps,
): Promise<PlanSupportData> {
  const riverSlug = plan.river?.slug ?? null;
  if (!riverSlug) return EMPTY;

  const detail = (accessSlug: string | undefined) =>
    accessSlug ? deps.fetchDetail(riverSlug, accessSlug, deps.signal) : Promise.resolve(null);

  const [putInResult, takeOutResult, servicesResult] = await Promise.allSettled([
    detail(plan.putIn?.slug),
    detail(plan.takeOut?.slug),
    deps.fetchServices(riverSlug, deps.signal),
  ]);

  const settled = <T,>(result: PromiseSettledResult<T>): T | null =>
    result.status === 'fulfilled' ? result.value : null;

  const groups = groupEndpointServices(settled(putInResult), settled(takeOutResult));

  // ── THE EXCLUSION LIST IS BOTH GROUPS, NOT JUST THE PUT-IN ──────────────
  // The ranking measures from the put-in, so it is tempting to exclude only what
  // is shown there. But an outfitter named against the TAKE-OUT is already on
  // screen, and listing it again underneath with "12.4 mi away" presents one
  // business as two options and quietly contradicts the heading it sits under.
  const shown: ServiceLike[] = [
    ...groups.putIn.rentals,
    ...groups.takeOut.rentals,
    ...groups.putIn.camping,
    ...groups.takeOut.camping,
  ];

  const nearest = rankNearbyShuttles(
    settled(servicesResult) ?? [],
    plan.putIn.coordinates,
    deps.distance,
    shown,
  );

  return { groups, nearest };
}
