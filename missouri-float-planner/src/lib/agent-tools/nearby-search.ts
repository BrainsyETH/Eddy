import {
  approximateLocation,
  compareFloatChoices,
  durationRelation,
  geographicMiles,
  REGULATED_DURATION_MESSAGE,
  type FloatSearchInput,
  type FloatSearchOption,
  type FloatSearchResponse,
} from '@shared/float-search';
import {
  createDataContext,
  checked,
  accessView,
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
  } = {},
): Promise<FloatSearchResponse> {
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
  let failed = 0,
    evaluated = 0,
    partial = false;
  let unavailableReason: string | undefined;
  const pool: Array<{
    candidate: Candidate;
    river: River;
    riverId: string;
    nearbyMiles: number | null;
  }> = [];
  async function workers<T>(items: T[], run: (item: T) => Promise<void>) {
    let next = 0;
    await Promise.all(
      [0, 1].map(async () => {
        while (next < items.length && !budget.signal.aborted) {
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
    const rivers = catalog.filter(r => r.river_type !== 'dam_tailwater');
    if (input.river && !rivers.length) unavailableReason = REGULATED_DURATION_MESSAGE;
    // Page explicitly: Supabase's default row cap must not silently hide rivers.
    const distanceByRiver = new Map<string, number>();
    if (near && !input.river && rivers.length) {
      const riverById = new Map(rivers.map((r) => [r.id, r]));
      for (let offset = 0; offset < 10_000; offset += 500) {
        const rows =
          checked(
            await ctx.db
              .from('access_points')
              .select('id, river_id, location_orig, location_snap, is_public')
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
          if (!row.river_id || (input.publicOnly && row.is_public !== true))
            continue;
          const river = riverById.get(row.river_id);
          if (!river) continue;
          const point = accessView(
            row as Parameters<typeof accessView>[0],
            river,
          ).coordinates;
          if (!point) continue;
          const distance = geographicMiles(near, point);
          distanceByRiver.set(
            row.river_id,
            Math.min(distance, distanceByRiver.get(row.river_id) ?? Infinity),
          );
        }
        if (rows.length < 500) break;
        if (offset === 9500) partial = true;
      }
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
    if (nearby.length > 12) partial = true;
    await workers(nearby.slice(0, 12), async (river) => {
      const [points, screen, vessel] = await Promise.all([
        ctx.access(river.id),
        loadScreening(ctx, river),
        planning.vessels(input.vesselType),
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
        input.targetHours,
        Number(vessel.speed_normal),
        input.publicOnly,
        screen,
        (a, b) => (closePutIns.has(a.id) ? durationFor(a, b) : null),
      );
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
      compareFloatChoices(rank(a), rank(b), input.targetHours * 60),
    );
    const exact = pool.filter(
      (p) =>
        durationRelation(
          p.candidate.duration.timeRange,
          input.targetHours * 60,
        ) === 'match',
    );
    const other = pool.filter(
      (p) =>
        durationRelation(
          p.candidate.duration.timeRange,
          input.targetHours * 60,
        ) !== 'match',
    );
    const candidates = [
      ...diverseFloats(exact, MAX_ESTIMATES, Boolean(input.river)),
      ...diverseFloats(other, MAX_ESTIMATES, Boolean(input.river)),
    ].slice(0, MAX_ESTIMATES);
    await workers(candidates, async ({ candidate, river, nearbyMiles }) => {
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
      )
        return;
      const vessel = await planning.vessels(input.vesselType);
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
        relation: durationRelation(time.timeRange, input.targetHours * 60),
        url: p.url,
        description: candidate.putIn.description || river.float_tip || null,
      });
    });
    // Optional, verified photos at these exact launches, batched once. A missing
    // photo never removes an otherwise valid recommendation.
    if (output.length && !budget.signal.aborted) {
      try {
        const photos =
          checked(
            await ctx.db
              .from('community_reports')
              .select('access_point_id, image_url, captured_at')
              .in(
                'access_point_id',
                output.map((o) => o.putIn.id),
              )
              .eq('type', 'river_visual')
              .eq('status', 'verified')
              .not('image_url', 'is', null)
              .order('created_at', { ascending: false })
              .limit(100),
            'launch photos',
          ) ?? [];
        for (const option of output) {
          const photo = photos.find(
            (p) => p.access_point_id === option.putIn.id,
          );
          if (photo?.image_url && /^https:\/\//.test(photo.image_url))
            option.photo = {
              url: photo.image_url,
              caption: `${option.putIn.name}${photo.captured_at ? ` · Photo ${new Date(photo.captured_at).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })}` : ' · Community photo'}`,
            };
        }
      } catch {
        /* Photos do not affect trip estimates. */
      }
    }
  } catch {
    partial = true;
    if (!budget.signal.aborted) failed++;
  } finally {
    budget.dispose();
  }
  if (evaluated === 0 && (failed > 0 || budget.signal.aborted)) {
    throw new Error('The search could not finish. Please try again.');
  }
  output.sort((a, b) => compareFloatChoices(a, b, input.targetHours * 60));
  return {
    matches: diverseFloats(
      output.filter((p) => p.relation === 'match'),
      5,
      Boolean(input.river),
    ),
    alternatives: diverseFloats(
      output.filter((p) => p.relation !== 'match'),
      3,
      Boolean(input.river),
    ),
    partial: partial || budget.signal.aborted,
    failed,
    evaluated,
    estimatedAt: new Date(ctx.now).toISOString(),
    ...(unavailableReason ? { unavailableReason } : {}),
  };
}
