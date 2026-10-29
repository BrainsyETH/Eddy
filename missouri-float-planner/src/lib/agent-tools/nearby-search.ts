import {
  approximateLocation,
  compareFloatChoices,
  durationRelation,
  geographicMiles,
  REGULATED_DURATION_MESSAGE,
  floatSearchEmptyReasonMessage,
  floatTargetMinutes,
  activeFloatFilters,
  type FloatSearchEmptyReason,
  type FloatSearchInput,
  type FloatSearchOption,
  type FloatSearchResponse,
} from '@shared/float-search';
import {
  createDataContext,
  checked,
  accessView,
  numeric,
  type Db,
  type River,
} from './data';
import { memoizeReads } from './read-cache';
import { loadScreening, screenCandidates, type Candidate } from './search';
import { loadCandidateDuration } from './candidate-duration';
import { createPlanning, MAX_ESTIMATES } from './planning';
import {
  createSources,
  sourceProviders,
  type SourceProviders,
} from './sources';
import { abortable, searchBudget } from './budget';
import { RiverNotFoundError } from './contracts';
import { assignRoutePhotos, loadRoutePhotos } from './route-photos';
import { pairPasses, portageMiles, riverPasses, routeHighlights, shuttleRivers } from './float-filters';
import { mapboxDriveFrom, type DriveFrom } from './drive-from';

/** Full route checks may replace rejected candidates up to this many attempts,
 * still returning at most MAX_ESTIMATES routes. */
export const MAX_ROUTE_ATTEMPTS = 9;

/** Prefer variety, then backfill: a river cap must never hide the only matches. */
export function diverseFloats<T extends { riverId: string }>(
  rows: T[],
  limit: number,
  singleRiver = false,
): T[] {
  if (singleRiver) return rows.slice(0, limit);
  const counts = new Map<string, number>();
  const first: T[] = [],
    rest: T[] = [];
  for (const row of rows) {
    const count = counts.get(row.riverId) ?? 0;
    if (count < 2) {
      first.push(row);
      counts.set(row.riverId, count + 1);
    } else rest.push(row);
  }
  const selected = new Set([...first, ...rest].slice(0, limit));
  // Variety chooses membership; the caller's duration/condition order still wins.
  return rows.filter(row => selected.has(row));
}

export async function findNearbyFloats(
  db: Db,
  input: FloatSearchInput,
  options: {
    signal?: AbortSignal;
    budgetMs?: number;
    now?: number;
    sources?: SourceProviders;
    driveFrom?: DriveFrom;
  } = {},
): Promise<FloatSearchResponse> {
  const filters = activeFloatFilters(input.filters);
  const target = floatTargetMinutes(input);
  const budget = searchBudget(options.budgetMs ?? 20_000, options.signal);
  const ctx = createDataContext(memoizeReads(db, budget.signal), options.now);
  const sources = createSources(
    ctx,
    options.sources ?? sourceProviders,
    budget.signal,
  );
  const planning = createPlanning(ctx, sources, undefined, budget.signal);
  const near = input.near ? approximateLocation(input.near) : undefined;
  const output: FloatSearchOption[] = [];
  let routePhotos: Awaited<ReturnType<typeof loadRoutePhotos>> = new Map();
  let failed = 0,
    evaluated = 0,
    partial = false;
  let unavailableReason: string | undefined;
  let riverCount = 0, eligiblePairs = 0, screenedOutPairs = 0, unavailableDurationPairs = 0, filteredPairs = 0, filteredRivers = 0;
  let shuttles = new Set<string>();
  let otherAccessPair = false;
  const excludedConditions = new Set<string>();
  const blockedReasons = new Set<string>();
  const pool: Array<{
    candidate: Candidate;
    river: River;
    riverId: string;
    nearbyMiles: number | null;
  }> = [];
  async function workers<T>(items: T[], run: (item: T) => Promise<void>, enough = () => false) {
    let next = 0;
    await Promise.all(
      [0, 1].map(async () => {
        while (next < items.length && !budget.signal.aborted && !enough()) {
          const item = items[next++];
          try {
            await abortable(run(item), budget.signal);
          } catch {
            partial = true;
            if (!budget.signal.aborted) failed++;
          }
        }
      }),
    );
  }
  try {
    const catalog = input.river
      ? [await ctx.river(input.river)]
      : await ctx.rivers('all');
    const floatable = catalog.filter(r => r.river_type !== 'dam_tailwater');
    if (input.river && !floatable.length) unavailableReason = REGULATED_DURATION_MESSAGE;
    if (filters?.shuttle) shuttles = await shuttleRivers(ctx, floatable.map(r => r.id));
    const rivers = floatable.filter(r => riverPasses(r, filters, shuttles, r.id));
    filteredRivers = floatable.length - rivers.length;
    // Page explicitly: Supabase's default row cap must not silently hide rivers.
    const distanceByRiver = new Map<string, number>();
    if (near && !input.river && rivers.length) {
      const riverById = new Map(rivers.map((r) => [r.id, r]));
      const lastEndpointMile = new Map<string, number>();
      const otherPutInMile = new Map<string, number>();
      for (let offset = 0; offset < 10_000; offset += 500) {
        const rows =
          checked(
            await ctx.db
              .from('access_points')
              .select('id, river_id, location_orig, location_snap, is_public, river_mile_downstream')
              .eq('approved', true)
              .eq('is_float_endpoint', true)
              .in(
                'river_id',
                rivers.map((r) => r.id),
              )
              .order('id')
              .range(offset, offset + 499),
            'nearby launches',
          ) ?? [];
        for (const row of rows) {
          if (!row.river_id) continue;
          const river = riverById.get(row.river_id);
          if (!river) continue;
          const mile = numeric(row.river_mile_downstream);
          if (input.publicOnly && mile != null) {
            lastEndpointMile.set(row.river_id, Math.max(mile, lastEndpointMile.get(row.river_id) ?? -Infinity));
          }
          const point = accessView(
            row as Parameters<typeof accessView>[0],
            river,
          ).coordinates;
          if (!point) continue;
          const distance = geographicMiles(near, point);
          if (input.publicOnly && row.is_public !== true) {
            // Keep excluded launches for recovery without changing the public
            // shortlist, its proximity order, or its route-assessment budget.
            if (distance <= input.radiusMiles && mile != null) {
              otherPutInMile.set(row.river_id, Math.min(mile, otherPutInMile.get(row.river_id) ?? Infinity));
            }
            continue;
          }
          distanceByRiver.set(
            row.river_id,
            Math.min(distance, distanceByRiver.get(row.river_id) ?? Infinity),
          );
        }
        if (rows.length < 500) break;
        if (offset === 9500) partial = true;
      }
      otherAccessPair = [...otherPutInMile].some(([riverId, mile]) => mile < (lastEndpointMile.get(riverId) ?? -Infinity));
    }
    const nearby = rivers
      .filter(
        (r) =>
          input.river || !near || (distanceByRiver.get(r.id) ?? Infinity) <= input.radiusMiles,
      )
      .sort(
        (a, b) =>
          (distanceByRiver.get(a.id) ?? 0) - (distanceByRiver.get(b.id) ?? 0) ||
          a.id.localeCompare(b.id),
      );
    // Bounded catalog work, stated as partial if coverage exceeds the budget.
    riverCount = nearby.length;
    if (nearby.length > 12) partial = true;
    await workers(nearby.slice(0, 12), async (river) => {
      const [points, screen, vessel, portages] = await Promise.all([
        ctx.access(river.id),
        loadScreening(ctx, river),
        planning.vessels(input.vesselType),
        filters?.noPortages ? portageMiles(ctx, river.id) : Promise.resolve([]),
      ]);
      if (points.length > 500)
        throw new Error('Access catalog exceeds search limit');
      const { durationFor, partial: durationPartial } = await loadCandidateDuration(
        ctx,
        river,
        screen,
        input.vesselType,
        planning.primeStatistics,
      );
      partial ||= durationPartial;
      const closePutIns = new Set(
        points
          .filter((point) => {
            const coords = accessView(point, river).coordinates;
            return (
              input.river || !near ||
              Boolean(
                coords && geographicMiles(near, coords) <= input.radiusMiles,
              )
            );
          })
          .map((p) => p.id),
      );
      const screened = screenCandidates(
        points,
        target / 60,
        Number(vessel.speed_normal),
        input.publicOnly,
        screen,
        durationFor,
        point => closePutIns.has(point.id),
        {
          limit: MAX_ROUTE_ATTEMPTS,
          pairAllowed: filters ? (a, b) => pairPasses(a, b, filters, portages) : undefined,
          skipLow: filters?.goodConditions,
        },
      );
      eligiblePairs += screened.coverage.eligiblePairs;
      screenedOutPairs += screened.coverage.screenedOutPairs;
      filteredPairs += screened.coverage.filteredPairs;
      unavailableDurationPairs += screened.coverage.unavailableDurationPairs;
      for (const code of screened.coverage.excludedConditions) excludedConditions.add(code);
      if (input.publicOnly && screened.coverage.eligiblePairs === 0) {
        const launches = points.filter(p => p.approved && p.is_float_endpoint && numeric(p.river_mile_downstream) != null);
        const lastMile = Math.max(...launches.map(p => Number(p.river_mile_downstream)));
        otherAccessPair ||= launches.some(p => closePutIns.has(p.id) && Number(p.river_mile_downstream) < lastMile);
      }
      for (const candidate of screened.candidates) {
        const coords = accessView(candidate.putIn, river).coordinates;
        pool.push({
          candidate,
          river,
          riverId: river.id,
          nearbyMiles: near && coords ? geographicMiles(near, coords) : null,
        });
      }
    });
    const rank = (entry: (typeof pool)[number]) => ({
      id: `${entry.candidate.putIn.id}:${entry.candidate.takeOut.id}`,
      ...entry.candidate.duration,
      nearbyMiles: entry.nearbyMiles,
      conditionCode: entry.candidate.conditionCode,
      conditional: entry.candidate.unknown,
    });
    pool.sort((a, b) =>
      compareFloatChoices(rank(a), rank(b), target),
    );
    const exact = pool.filter(
      (p) =>
        durationRelation(
          p.candidate.duration.timeRange,
          target,
        ) === 'match',
    );
    const other = pool.filter(
      (p) =>
        durationRelation(
          p.candidate.duration.timeRange,
          target,
        ) !== 'match',
    );
    const candidates = [
      ...diverseFloats(exact, MAX_ROUTE_ATTEMPTS, Boolean(input.river)),
      ...diverseFloats(other, MAX_ROUTE_ATTEMPTS, Boolean(input.river)),
    ].slice(0, MAX_ROUTE_ATTEMPTS);
    // Rejected routes are replaced from the ranked list until six routes pass
    // or the attempt cap is reached; work in flight counts toward the six.
    let inFlight = 0;
    const driveTargets = new Map<string, { lat: number; lng: number }>();
    async function assess({ candidate, river, nearbyMiles }: (typeof candidates)[number]) {
      const plan = await planning.calculate({
        river: river.slug,
        putIn: candidate.putIn.id,
        takeOut: candidate.takeOut.id,
        vesselType: input.vesselType,
      });
      budget.signal.throwIfAborted();
      evaluated++;
      const p = plan.data,
        time = p.estimatedFloatTime;
      if (
        p.routeAssessment.recommendationStatus === 'not_recommended' ||
        !time?.timeRange
      ) {
        for (const reason of p.routeAssessment.blockingReasons) blockedReasons.add(reason.code);
        if (!time?.timeRange) blockedReasons.add('duration_unavailable');
        return;
      }
      if (filters?.goodConditions && p.routeAssessment.recommendationStatus === 'conditional') {
        filteredPairs++;
        return;
      }
      const vessel = await planning.vessels(input.vesselType);
      if (near) {
        // Parking-lot coordinates when recorded; the launch pin otherwise.
        const lat = numeric(candidate.putIn.driving_lat), lng = numeric(candidate.putIn.driving_lng);
        const point = lat != null && lng != null ? { lat, lng } : accessView(candidate.putIn, river).coordinates;
        if (point) driveTargets.set(candidate.putIn.id, point);
      }
      output.push({
        id: `${candidate.putIn.id}:${candidate.takeOut.id}`,
        riverId: river.id,
        riverSlug: river.slug,
        riverName: river.name,
        putIn: {
          id: p.putIn.id,
          name: p.putIn.name,
          isPublic: p.putIn.isPublic,
        },
        takeOut: {
          id: p.takeOut.id,
          name: p.takeOut.name,
          isPublic: p.takeOut.isPublic,
        },
        vesselTypeId: vessel.id,
        minutes: time.minutes,
        timeRange: time.timeRange,
        formattedTime: time.formatted,
        distanceMiles: p.distanceMiles,
        nearbyMiles: nearbyMiles == null ? null : Math.round(nearbyMiles),
        conditionCode: p.routeAssessment.conditionCode,
        conditionLabel: p.routeAssessment.label,
        conditional: p.routeAssessment.recommendationStatus === 'conditional',
        cautions: p.routeAssessment.cautionReasons.map((r) => r.message),
        estimateBasis:
          p.estimateBasis === 'current_conditions'
            ? 'current_conditions'
            : 'typical',
        observedAt: p.anchorGauge.observedAt,
        relation: durationRelation(time.timeRange, target),
        url: p.url,
        description: candidate.putIn.description || river.float_tip || null,
        highlights: routeHighlights(candidate.putIn, candidate.takeOut, shuttles.has(river.id), filters),
        driveMinutes: null,
      });
    }
    await workers(candidates, async (item) => {
      inFlight++;
      try {
        await assess(item);
      } finally {
        inFlight--;
      }
    }, () => output.length + inFlight >= MAX_ESTIMATES);
    const endpointIds = new Set(output.flatMap(option => [option.putIn.id, option.takeOut.id]));
    const [photos, minutes] = await Promise.all([
      loadRoutePhotos(
        ctx.db,
        candidates.flatMap(({ candidate }) => [candidate.putIn, candidate.takeOut])
          .filter(point => endpointIds.has(point.id)),
        budget.signal,
      ),
      near && driveTargets.size
        ? (options.driveFrom ?? mapboxDriveFrom)(near, [...driveTargets].map(([id, point]) => ({ id, ...point })), budget.signal)
            .catch(() => new Map<string, number>())
        : new Map<string, number>(),
    ]);
    routePhotos = photos;
    for (const option of output) option.driveMinutes = minutes.get(option.putIn.id) ?? null;
  } catch (error) {
    if (error instanceof RiverNotFoundError) throw error;
    partial = true;
    if (!budget.signal.aborted) failed++;
  } finally {
    budget.dispose();
  }
  if (evaluated === 0 && (failed > 0 || budget.signal.aborted)) {
    throw new Error('The search could not finish. Please try again.');
  }
  output.sort((a, b) => compareFloatChoices(a, b, target));
  const matches = diverseFloats(output.filter(p => p.relation === 'match'), 5, Boolean(input.river));
  const alternatives = diverseFloats(output.filter(p => p.relation !== 'match'), 3, Boolean(input.river));
  assignRoutePhotos([...matches, ...alternatives], routePhotos);
  let emptyReason: FloatSearchEmptyReason | undefined;
  // A time mismatch already returns assessed shorter/longer alternatives.
  // With no routes, explain the actual exclusion rather than blaming the time.
  if (!matches.length && !alternatives.length && !unavailableReason && !partial && !budget.signal.aborted) {
    if (!riverCount) emptyReason = filteredRivers ? 'filters' : otherAccessPair ? 'public_access' : 'no_nearby_rivers';
    else if (!eligiblePairs) emptyReason = otherAccessPair ? 'public_access' : 'access_points';
    else if (filteredPairs && screenedOutPairs + filteredPairs >= eligiblePairs) emptyReason = 'filters';
    else if (screenedOutPairs === eligiblePairs) {
      emptyReason = excludedConditions.size === 1 && excludedConditions.has('too_low') ? 'too_low'
        : !excludedConditions.has('too_low') ? 'high_water' : 'water_conditions';
    } else if (blockedReasons.has('official_closure')) emptyReason = 'closures';
    else if (blockedReasons.has('danger_on_route') || blockedReasons.has('danger_location_unknown')) emptyReason = 'hazards';
    else if (blockedReasons.has('gauge_coverage_incomplete')) emptyReason = 'conditions_unavailable';
    else if (blockedReasons.has('water_conditions_unsuitable') || blockedReasons.has('low_water_in_route')) emptyReason = 'water_conditions';
    else if (unavailableDurationPairs || blockedReasons.has('duration_unavailable')) emptyReason = 'duration_unavailable';
    else if (filteredPairs) emptyReason = 'filters';
    else emptyReason = 'route_checks';
    // Older app builds already display unavailableReason, so they get the fix too.
    unavailableReason = floatSearchEmptyReasonMessage(emptyReason);
  }
  return {
    matches,
    alternatives,
    partial: partial || budget.signal.aborted,
    failed,
    evaluated,
    estimatedAt: new Date(ctx.now).toISOString(),
    ...(unavailableReason ? { unavailableReason } : {}),
    ...(emptyReason ? { emptyReason } : {}),
  };
}
