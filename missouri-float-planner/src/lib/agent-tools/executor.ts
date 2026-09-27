import type { Json } from '@/types/database';
import { AGENT_TOOLS } from './catalog';
import {
  AgentError,
  combineStatus,
  result,
  memoizeAsync,
  tripDate,
  type AgentResult,
  type Status,
} from './contracts';
import {
  accessView,
  checked,
  createDataContext,
  numeric,
  riverUrl,
  station,
  type Db,
  type River,
} from './data';
import {
  createSources,
  sourceProviders,
  type SourceProviders,
} from './sources';
import { createPlanning, MAX_ESTIMATES, type PlanInput } from './planning';
import { memoizeReads } from './read-cache';
import { abortable, searchBudget } from './budget';
import { loadScreening, screenCandidates } from './search';
import { summarizePlan, summarizeAlerts } from './search-output';

function distanceMiles(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const r = Math.PI / 180,
    dLat = (b.lat - a.lat) * r,
    dLng = (b.lng - a.lng) * r;
  const v =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.min(1, Math.sqrt(v)));
}

interface ServiceLink {
  services_offered: string[] | null;
  routes: Json | null;
  seasonal_notes: string | null;
  section_description: string | null;
  nearby_services: {
    id: string;
    name: string;
    slug: string;
    type: string;
    phone: string | null;
    website: string | null;
    latitude: number | null;
    longitude: number | null;
    geocode_precision: string | null;
    services_offered: string[] | null;
    seasonal_notes: string | null;
    status: string;
  } | null;
}

interface ExecutorOptions {
  now?: number;
  sources?: SourceProviders;
  routeProviders?: Parameters<typeof createPlanning>[2];
  signal?: AbortSignal;
  searchBudgetMs?: number;
  logPhase?: (event: {
    tool: string;
    phase: string;
    durationMs: number;
  }) => void;
}

export function createAgentExecutor(db: Db, options: ExecutorOptions = {}) {
  return async (name: string, input: unknown): Promise<AgentResult> => {
    const budget =
      name === 'find_floats'
        ? searchBudget(options.searchBudgetMs ?? 20_000, options.signal)
        : null;
    try {
      return await createScopedExecutor(db, {
        ...options,
        signal: budget?.signal ?? options.signal,
      })(name, input);
    } finally {
      budget?.dispose();
    }
  };
}

function createScopedExecutor(db: Db, options: ExecutorOptions) {
  const ctx = createDataContext(memoizeReads(db, options.signal), options.now);
  const sources = createSources(
    ctx,
    options.sources ?? sourceProviders,
    options.signal,
  );
  const planning = createPlanning(
    ctx,
    sources,
    options.routeProviders,
    options.signal,
  );
  async function phase<T>(name: string, run: () => Promise<T>) {
    const started = performance.now();
    try {
      return await abortable(run(), options.signal);
    } finally {
      try {
        options.logPhase?.({
          tool: 'find_floats',
          phase: name,
          durationMs: Math.round(performance.now() - started),
        });
      } catch {
        /* Logging must not change a result. */
      }
    }
  }
  const serviceRows = memoizeAsync(async (riverId: string) => {
    const rows = checked(
      await ctx.db
        .from('service_rivers')
        .select(
          'services_offered, routes, seasonal_notes, section_description, nearby_services(id, name, slug, type, phone, website, latitude, longitude, geocode_precision, services_offered, seasonal_notes, status)',
        )
        .eq('river_id', riverId)
        .limit(201),
      'river services',
    ) as unknown as ServiceLink[];
    if (rows.length > 200)
      throw new AgentError(
        'Services exceed this tool’s supported directory size.',
        'unavailable',
      );
    return rows.flatMap((link) => {
      const s = link.nearby_services;
      if (!s || s.status === 'permanently_closed') return [];
      return [
        {
          id: s.id,
          name: s.name,
          slug: s.slug,
          type: s.type,
          phone: s.phone,
          website: s.website,
          latitude: s.latitude,
          longitude: s.longitude,
          coordinatePrecision: s.geocode_precision,
          servicesOffered: link.services_offered?.length
            ? link.services_offered
            : (s.services_offered ?? []),
          routes: link.routes ?? [],
          seasonalNotes: link.seasonal_notes ?? s.seasonal_notes,
          sectionDescription: link.section_description,
        },
      ];
    });
  });
  async function services(
    river: River,
    input: { near?: string; category?: string; limit?: number },
  ) {
    const ap = input.near ? await ctx.point(river, input.near) : null;
    const point = ap ? accessView(ap, river).coordinates : null;
    const category = {
      outfitter: 'outfitter',
      camping: 'campground',
      lodging: 'cabin_lodge',
    }[input.category ?? ''];
    const directory = [...(await serviceRows(river.id))];
    // Use the same approved-access links as the river services route. No live
    // reservation lookup: this is a directory, not booking availability.
    if (!category || category === 'campground') {
      const points = await ctx.access(river.id);
      if (points.length > 500)
        throw new AgentError(
          'Campground links exceed this directory’s supported size.',
          'unavailable',
        );
      const ids = [
        ...new Set(
          points.flatMap((ap) =>
            ap.nps_campground_id ? [ap.nps_campground_id] : [],
          ),
        ),
      ];
      if (ids.length) {
        const campgrounds =
          checked(
            await ctx.db
              .from('nps_campgrounds')
              .select('id, name, nps_url, reservation_url, latitude, longitude')
              .in('id', ids),
            'NPS campgrounds',
          ) ?? [];
        for (const cg of campgrounds) {
          if (
            directory.some(
              (s) =>
                s.name.trim().toLowerCase() === cg.name.trim().toLowerCase(),
            )
          )
            continue;
          directory.push({
            id: cg.id,
            name: cg.name,
            slug: cg.name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, ''),
            type: 'campground',
            phone: null,
            website: cg.reservation_url || cg.nps_url || null,
            latitude: numeric(cg.latitude),
            longitude: numeric(cg.longitude),
            coordinatePrecision: null,
            servicesOffered: ['camping'],
            routes: [],
            seasonalNotes: null,
            sectionDescription:
              'Recorded NPS campground; check the official site for access and reservations.',
          });
        }
      }
    }
    let rows = directory
      .filter((s) => !category || s.type === category)
      .map((s) => ({
        ...s,
        distanceMiles:
          point && numeric(s.latitude) != null && numeric(s.longitude) != null
            ? Math.round(
                distanceMiles(point, {
                  lat: Number(s.latitude),
                  lng: Number(s.longitude),
                }) * 10,
              ) / 10
            : null,
      }));
    rows = rows.sort(
      (a, b) =>
        (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity) ||
        a.name.localeCompare(b.name),
    );
    return {
      status: (rows.length ? 'ok' : 'none_recorded') as Status,
      items: rows.slice(0, input.limit ?? 20),
      truncated: rows.length > (input.limit ?? 20),
      near: ap?.name ?? null,
      distanceBasis: 'straight_line_not_road',
      source: riverUrl(river),
      note: 'Recorded business directory; hours, shuttle operation and booking availability are unverified. Distances may use approximate property pins. Includes NPS campgrounds linked to approved access points.',
    };
  }
  async function enrich(plan: Awaited<ReturnType<typeof planning.calculate>>) {
    const [weather, outfitters] = await Promise.allSettled([
      sources.weather(plan.river, plan.putIn),
      services(plan.river, {
        near: plan.putIn.id,
        category: 'outfitter',
        limit: 3,
      }),
    ]);
    const weatherData =
      weather.status === 'fulfilled'
        ? weather.value
        : {
            status: 'lookup_failed' as Status,
            reason: 'Weather could not be checked.',
          };
    const serviceData =
      outfitters.status === 'fulfilled'
        ? outfitters.value
        : {
            status: 'lookup_failed' as Status,
            reason: 'Outfitters could not be checked.',
          };
    return result(
      { ...plan.data, weather: weatherData, outfitters: serviceData },
      combineStatus([plan.status, weatherData.status, serviceData.status]),
      plan.warnings,
    );
  }
  async function run(
    name: string,
    args: Record<string, unknown>,
  ): Promise<AgentResult> {
    const slug = args.slug as string;
    switch (name) {
      case 'list_rivers': {
        const rows = await ctx.rivers('active');
        return result(
          {
            rivers: rows.map((r) => ({
              id: r.id,
              name: r.name,
              slug: r.slug,
              state: r.state,
              region: r.region,
              url: riverUrl(r),
            })),
            states: [...new Set(rows.map((r) => r.state))].sort(),
            coverageUrl: 'https://eddy.guide/coverage',
          },
          rows.length ? 'ok' : 'none_recorded',
        );
      }
      case 'get_river': {
        const r = await ctx.river(slug);
        return result({
          id: r.id,
          name: r.name,
          slug: r.slug,
          state: r.state,
          lengthMiles: numeric(r.length_miles),
          difficultyRating: r.difficulty_rating,
          description: r.description,
          floatSummary: r.float_summary,
          floatTip: r.float_tip,
          url: riverUrl(r),
        });
      }
      case 'get_access_points': {
        const r = await ctx.river(slug),
          all = await ctx.access(r.id);
        if (all.length > 500)
          throw new AgentError(
            'Access catalog exceeds this tool’s supported size.',
            'unavailable',
          );
        const rows = all.filter(
          (ap) => !args.publicOnly || ap.is_public === true,
        );
        return result(
          {
            river: r.name,
            url: riverUrl(r),
            accessPoints: rows.map((ap) => accessView(ap, r)),
          },
          rows.length ? 'ok' : 'none_recorded',
        );
      }
      case 'get_hazards': {
        const r = await ctx.river(slug),
          hazards = await ctx.hazards(r.id);
        return result(
          {
            river: r.name,
            hazards: hazards.slice(0, 500),
            truncated: hazards.length > 500,
            source: riverUrl(r),
          },
          hazards.length > 500
            ? 'partial'
            : hazards.length
              ? 'ok'
              : 'none_recorded',
        );
      }
      case 'get_conditions': {
        const r = await ctx.river(slug),
          ap = args.putIn
            ? await ctx.point(r, String(args.putIn), true)
            : undefined;
        const selection = await ctx.chooseGauge(r, ap);
        if (!selection.link)
          return result(
            {
              river: r.name,
              gauge: null,
              reason: selection.reason,
              url: riverUrl(r),
            },
            'unavailable',
          );
        const gauge = await ctx.gaugeView(r, selection.link);
        return result(
          {
            river: r.name,
            gauge,
            gaugeSelectionReason: selection.reason,
            scope: ap
              ? 'put_in_reference_use_plan_float_for_entire_route'
              : 'river_reference',
            url: riverUrl(r),
          },
          gauge.conditionCode === 'unknown' ? 'unavailable' : 'ok',
        );
      }
      case 'get_gauges': {
        const rivers = args.slug
          ? [await ctx.river(slug)]
          : await ctx.rivers('active');
        const all = (
          await Promise.all(
            rivers.map(async (r) =>
              (await ctx.gauges(r.id)).flatMap((link) => {
                const g = station(link);
                return g?.active &&
                  (!args.siteId || g.usgs_site_id === args.siteId)
                  ? [{ river: r, link }]
                  : [];
              }),
            ),
          )
        )
          .flat()
          .sort(
            (a, b) =>
              station(a.link)!.name.localeCompare(station(b.link)!.name) ||
              a.river.slug.localeCompare(b.river.slug),
          );
        const start = Number(args.offset),
          count = Number(args.limit),
          selected = all.slice(start, start + count);
        const gauges = await Promise.all(
          selected.map(({ river, link }) => ctx.gaugeView(river, link)),
        );
        return result(
          {
            gauges,
            nextOffset: start + count < all.length ? start + count : null,
            totalRatings: all.length,
            note: 'A shared station can have a different rating for each river.',
          },
          !gauges.length
            ? 'none_recorded'
            : gauges.some((g) => g.conditionCode === 'unknown')
              ? 'partial'
              : 'ok',
        );
      }
      case 'get_weather': {
        const r = await ctx.river(slug),
          ap = args.putIn
            ? await ctx.point(r, String(args.putIn), true)
            : undefined;
        const weather = await sources.weather(r, ap);
        return result(weather, weather.status);
      }
      case 'get_outlook': {
        const r = await ctx.river(slug);
        if (args.date)
          tripDate(String(args.date), r.timezone || 'America/Chicago', ctx.now);
        const selected = await ctx.chooseGauge(
          r,
          undefined,
          args.gaugeId as string | undefined,
        );
        const outlook = await sources.outlook(
          r,
          selected.link,
          args.date as string | undefined,
        );
        return result(
          { ...outlook, gaugeSelectionReason: selected.reason },
          outlook.status,
        );
      }
      case 'get_river_alerts': {
        const alerts = await sources.alerts(await ctx.river(slug));
        return result(alerts, alerts.status);
      }
      case 'get_services': {
        const data = await services(await ctx.river(slug), args);
        return result(data, data.status);
      }
      case 'get_drive_estimate': {
        const data = await planning.drive(args as PlanInput);
        return result(data, data.status);
      }
      case 'plan_float':
        return enrich(await planning.calculate(args as PlanInput));
      case 'find_floats': {
        const completed: Awaited<ReturnType<typeof planning.calculate>>[] = [];
        let candidates: ReturnType<typeof screenCandidates>['candidates'] = [];
        let coverage: ReturnType<typeof screenCandidates>['coverage'] | null =
          null;
        let alertChecks: ReturnType<typeof summarizeAlerts> | null = null;
        let failed = 0,
          started = 0,
          finished = 0;
        try {
          const r = await phase('coverage', () =>
            ctx.river(String(args.river)),
          );
          tripDate(
            args.date as string | undefined,
            r.timezone || 'America/Chicago',
            ctx.now,
          );
          const alertsWork = phase('alerts', () => sources.alerts(r)).then(
            (a) => {
              alertChecks = summarizeAlerts(a);
            },
          );
          void alertsWork.catch(() => {});
          // Independent catalog and observation reads start together.
          const [[points, vessel], screening] = await Promise.all([
            phase('catalog', () =>
              Promise.all([
                ctx.access(r.id),
                planning.vessels(String(args.vesselType)),
              ]),
            ),
            phase('screening', async () => {
              try {
                return await loadScreening(ctx, r);
              } catch {
                options.signal?.throwIfAborted();
                return undefined;
              }
            }),
          ]);
          if (points.length > 500)
            throw new AgentError(
              'Access catalog exceeds this search’s supported size.',
              'unavailable',
            );
          const speed = numeric(vessel.speed_normal);
          if (!speed || speed <= 0)
            throw new AgentError(
              'No calibrated speed for this vessel.',
              'unavailable',
            );
          const screened = screenCandidates(
            points,
            Number(args.targetHours),
            speed,
            args.publicOnly === true,
            screening,
          );
          candidates = screened.candidates;
          coverage = screened.coverage;
          await phase('estimates', async () => {
            // Bounded workers avoid batch barriers while keeping backend load
            // at two estimates per request. Never schedule work after expiry.
            let next = 0;
            async function worker() {
              while (next < candidates.length && !options.signal?.aborted) {
                const c = candidates[next++];
                started++;
                try {
                  const value = await abortable(
                    planning.calculate({
                      river: r.slug,
                      putIn: c.putIn.id,
                      takeOut: c.takeOut.id,
                      vesselType: String(args.vesselType),
                      date: args.date as string | undefined,
                    }),
                    options.signal,
                  );
                  if (!options.signal?.aborted) {
                    completed.push(value);
                    finished++;
                  }
                } catch {
                  if (options.signal?.aborted) return;
                  failed++;
                  finished++;
                }
              }
            }
            await Promise.all([worker(), worker()]);
          });
          await alertsWork;
        } catch (error) {
          if (!options.signal?.aborted) throw error;
        }
        const timedOut = options.signal?.aborted === true;
        const durationFit = (p: (typeof completed)[number]) => {
          const range = p.data.estimatedFloatTime?.timeRange;
          const minutes = Number(args.targetHours) * 60;
          return range
            ? Math.max(range.min - minutes, minutes - range.max, 0)
            : Infinity;
        };
        const eligible = completed.filter(
          (p) =>
            p.data.routeAssessment.recommendationStatus !== 'not_recommended',
        );
        eligible.sort(
          (a, b) =>
            Number(
              a.data.routeAssessment.recommendationStatus === 'conditional',
            ) -
              Number(
                b.data.routeAssessment.recommendationStatus === 'conditional',
              ) ||
            Number(a.data.routeAssessment.conditionCode === 'low') -
              Number(b.data.routeAssessment.conditionCode === 'low') ||
            durationFit(a) - durationFit(b) ||
            (b.putIn.amenities?.length ?? 0) - (a.putIn.amenities?.length ?? 0),
        );
        const picks = eligible.slice(0, Number(args.limit)).map((p) => ({
          ...summarizePlan(p),
          reasons: [
            durationFit(p) === 0
              ? 'Requested duration falls inside the estimated range.'
              : 'Closest duration among the bounded candidates checked.',
            ...(args.publicOnly
              ? ['Both endpoints are recorded as public.']
              : []),
          ],
        }));
        const excluded = completed.filter(
          (p) =>
            p.data.routeAssessment.recommendationStatus === 'not_recommended',
        );
        const exclusionReasons = new Map<
          string,
          { code: string; message: string; count: number }
        >();
        for (const plan of excluded) {
          for (const reason of new Map(
            plan.data.routeAssessment.blockingReasons.map((r) => [r.code, r]),
          ).values()) {
            const existing = exclusionReasons.get(reason.code);
            if (existing) existing.count++;
            else
              exclusionReasons.set(reason.code, {
                code: reason.code,
                message: reason.message.slice(0, 240),
                count: 1,
              });
          }
        }
        return result(
          {
            recommendations: picks,
            excludedCandidates: excluded.length,
            exclusionReasons: [...exclusionReasons.values()],
            alertChecks,
            screening: coverage,
            evaluated: completed.length,
            attempted: started,
            maxEstimates: MAX_ESTIMATES,
            failedCandidates: failed,
            timedOutCandidates: timedOut ? started - finished : 0,
            notEvaluatedCandidates: candidates.length - started,
            deadlineReached: timedOut,
            searchScope:
              'Condition-screened, diversified shortlist; not an exhaustive best-of-river ranking. Screening describes current stored observations, not a forecast.',
            reason: timedOut
              ? 'Search deadline reached; only completed assessments are returned. An empty result does not establish that the river is unsuitable.'
              : picks.length
                ? null
                : 'No suitable recommendation could be established from the checked candidates and available data.',
          },
          timedOut ||
            (picks.length &&
              (failed ||
                coverage?.status === 'partial' ||
                picks.some((p) => p.status !== 'ok')))
            ? 'partial'
            : !picks.length
              ? failed
                ? 'lookup_failed'
                : 'unavailable'
              : 'ok',
        );
      }
      default:
        throw new AgentError('Unknown tool.');
    }
  }
  return async (name: string, input: unknown): Promise<AgentResult> => {
    try {
      const definition = AGENT_TOOLS.find((t) => t.name === name);
      if (!definition) throw new AgentError('Unknown tool.');
      const parsed = definition.input.safeParse(input);
      if (!parsed.success)
        return result(
          {
            message: 'Invalid tool arguments.',
            issues: parsed.error.issues.map((i) => ({
              field: i.path.join('.'),
              message: i.message,
            })),
          },
          'invalid_request',
        );
      return await run(name, parsed.data);
    } catch (error) {
      if (error instanceof AgentError)
        return result({ message: error.message }, error.status);
      return result(
        {
          message:
            'The data lookup failed. Please retry; no condition or availability conclusion can be drawn.',
        },
        'lookup_failed',
      );
    }
  };
}
