// src/lib/data/dams.ts
// Server-side aggregator for USACE dam pages — the shared layer behind
// /dams, /dams/[damId] and the API routes, mirroring src/lib/data/rivers.ts.
//
// READ-THROUGH, NOT STORED. Unlike gauge readings, none of this is worth
// persisting: the Corps rewrites its whole release forecast daily and SWPA
// republishes seven schedule files on a rolling week, so yesterday's copy is
// worthless. Pool elevation is a display number nobody charts. Storing it
// would mean tables, a cron, supersession deletes and a retention job to
// manage data with no history value. Callers cache at the CDN edge instead.
//
// The one exception is total release, which IS a river discharge and DOES get
// stored — through the usace FlowProvider and the normal gauge pipeline. This
// module reads it live for display alongside everything else.
//
// TWO SOURCES, split by what each is good at:
//   CWMS  — release, pool, % flood pool, tailwater temperature
//   SWPA  — the hourly forward generation schedule
// They barely overlap. Clearwater has no turbines so it is CWMS-only; Stockton
// and Truman publish nothing to CWMS so they are SWPA-only. A dam renders
// whatever it has.
//
// PER-METRIC CONTRACT: a metric the dam does not publish is ABSENT from the
// snapshot, never present with a null. Absent means "this dam has no
// powerhouse", and the UI must render nothing rather than "0 cfs" or a dash.

import {
  bucketedNow,
  changeOver,
  fetchLatestValue,
  fetchTimeseries,
  stalenessOf,
  type TimeseriesChange,
  type TimeseriesPoint,
} from '@/lib/usace/cda';
import { fetchProjectSchedule, idleWindows } from '@/lib/usace/swpa';
import { parseTsId, resolveSeries, type ResolvedSeries } from '@/lib/usace/resolve';
import {
  USACE_DAMS,
  getUsaceDam,
  type UsaceDam,
  type UsaceMetric,
} from '@/lib/flow-providers/usace-registry';

/**
 * What a LIST surface needs, and nothing else.
 *
 * The hierarchy a tailwater angler scans a list by: is it generating, what
 * happens next, how much is coming out, is the water below moving. Pool level,
 * flood pool, temperature and inflow answer none of those and belong behind the
 * tap — a twenty-dam index that repeats a detail page twenty times is not
 * scannable.
 *
 * ── generationFlow is load-bearing, not display ────────────────────────────
 * `DamSnapshot.generating` is DERIVED from it (turbine flow above the dam's
 * generationOnCfs floor). Drop it from this set to save a request and every
 * generating chip on every list silently becomes null — the one fact the
 * hierarchy leads with, gone, with no error anywhere. Pinned by
 * dams-route-contract.test.ts.
 */
export const SUMMARY_METRICS: UsaceMetric[] = [
  'release',
  'generationFlow',
  'tailwaterElevation',
];

/**
 * Everything a dam's own page shows, in display priority order.
 *
 * `tailwaterElevation` and `inflow` were declared in the registry and resolvable
 * from the CWMS catalog from the beginning, and read by nothing — the stage
 * below the dam is the number a wading angler actually stands in, and it was
 * the one thing this feature could already fetch and never showed.
 */
export const DETAIL_METRICS: UsaceMetric[] = [
  ...SUMMARY_METRICS,
  'tailwaterTempF',
  'poolElevation',
  'pctFloodPool',
  'inflow',
];

/**
 * What /api/high-water needs: a release figure and whether the units are running.
 *
 * That route filters to dams whose tailwater gauge is running high, which the
 * registry can answer with no requests at all — see fetchTailwaterDams. It reads
 * no schedule and no lake state, so fetching them was work whose only
 * destination was the garbage collector.
 */
const HIGH_WATER_METRICS: UsaceMetric[] = ['release', 'generationFlow'];

/**
 * Metrics published with their recent movement attached.
 *
 * Only the tailwater stage, deliberately. It is the one metric whose CHANGE is
 * the fact rather than a decoration: it swings 8.19 ft at Table Rock and 7.67 ft
 * at Bull Shoals between idle and full generation (measured over 48 hours,
 * 2026-08-12), and it moves on unscheduled releases too — so it is the only
 * signal here that catches water the schedule never announced.
 */
const TREND_METRICS: UsaceMetric[] = ['tailwaterElevation'];

/**
 * The window a trend is measured over.
 *
 * Three hours because a generation ramp takes one to two hours to express
 * downstream, so a shorter window straddles the ramp and reads as noise. It
 * also sits inside the default 8-hour lookback, which is what keeps the trend
 * free of an extra request.
 */
const TREND_HOURS = 3;

/** Parallel CDA requests across a whole page render. */
const FETCH_CONCURRENCY = 6;

// The wire shapes live in shared/ so eddy-ios can import the same definitions
// rather than restating them — see that file's header for why they cannot live
// in packages/eddy-types. Re-exported here so every existing `@/lib/data/dams`
// import keeps working verbatim.
export type {
  DamMetricValue,
  DamScheduleDay,
  DamSnapshot,
  DamStaleness,
  DamTailwater,
  DamsResponse,
  ScheduledHour,
} from '@shared/dam-types';
import type { DamMetricValue, DamScheduleDay, DamSnapshot } from '@shared/dam-types';

/** Run `fn` over `items`, at most `limit` at a time. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<Array<R | null>> {
  const out: Array<R | null> = new Array(items.length).fill(null);
  let cursor = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = cursor;
      cursor += 1;
      if (i >= items.length) return;
      try {
        out[i] = await fn(items[i]);
      } catch {
        out[i] = null;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * A series to read, plus the value already read for it if resolution confirmed
 * one. `probed` exists so a discovered series costs the same number of requests
 * as a declared one: the resolver has to read a value to know the series is
 * live at all (the CWMS catalog's timestamps are unreliable — see
 * src/lib/usace/resolve.ts), and throwing that value away to fetch it again a
 * moment later would double the fan-out for every resolver-backed dam.
 */
interface MetricSource {
  tsId: string;
  unit: string;
  lookbackHours?: number;
  dailyMean?: boolean;
  probed?: TimeseriesPoint;
}

/**
 * The series to use for each wanted metric: the registry's verified id when it
 * has one, otherwise whatever the catalog resolver discovers.
 *
 * Hand-written ids always win. They were confirmed live, and a resolver that
 * silently picks the WRONG series is worse than a hardcoded one that 404s
 * loudly. The resolver's job is the case the registry cannot cover — a dam
 * with no entries yet — so a new project needs only an office and a CWMS
 * location, not a transcription of eight timeseries ids.
 */
async function seriesFor(
  dam: UsaceDam,
  metrics: UsaceMetric[]
): Promise<Partial<Record<UsaceMetric, MetricSource>>> {
  const out: Partial<Record<UsaceMetric, MetricSource>> = {};
  const unresolved: UsaceMetric[] = [];

  for (const metric of metrics) {
    const declared = dam.series[metric];
    if (declared) out[metric] = declared;
    else unresolved.push(metric);
  }

  if (unresolved.length === 0 || !dam.office || !dam.cdaLocation) return out;

  const discovered: Partial<Record<UsaceMetric, ResolvedSeries>> = await resolveSeries(
    dam.office,
    dam.cdaLocation,
    unresolved
  ).catch(() => ({}));
  for (const [metric, hit] of Object.entries(discovered)) {
    if (!hit) continue;
    console.info(`[USACE] resolved ${dam.id}.${metric} -> ${hit.tsId} (${hit.reason})`);
    out[metric as UsaceMetric] = {
      tsId: hit.tsId,
      unit: hit.unit,
      // A DECLARED daily series is flagged by hand in the registry; a RESOLVED
      // one has nobody to flag it, so the interval in its own id has to. The
      // resolver's specs admit `~1Day` for release and inflow, and Wappapello's
      // inflow resolves to exactly that — without this, a day-old average would
      // render as a reading taken just now, which is the correctness bug the
      // registry's own `dailyMean` note exists to prevent.
      ...dailyIntervalHints(hit.tsId),
      ...(hit.probed ? { probed: hit.probed } : {}),
    };
  }
  return out;
}

/**
 * How far back a daily series has to be read, in hours.
 *
 * Mirrors the 72 the registry sets by hand for the two St. Louis dams: a daily
 * mean is published roughly a day in arrears, so the default 8-hour window
 * finds nothing at all.
 */
const DAILY_LOOKBACK_HOURS = 72;

/** `dailyMean` and a matching lookback, when a resolved id names a daily interval. */
export function dailyIntervalHints(
  tsId: string
): Pick<MetricSource, 'dailyMean' | 'lookbackHours'> {
  const parsed = parseTsId(tsId);
  if (!parsed || !/1Day/i.test(parsed.interval)) return {};
  return { dailyMean: true, lookbackHours: DAILY_LOOKBACK_HOURS };
}

/**
 * Anything below this rounds to "-0%", so it is a rounding artefact rather than
 * a fact about the lake. Clamped up to zero instead of dropped, because a metric
 * that vanishes and reappears as a lake drifts either side of its conservation
 * pool is worse than one that reads 0%.
 */
const FLOOD_POOL_ZERO_BAND = -0.5;

/**
 * The value to publish for a metric at this dam, or null to omit it entirely.
 *
 * Three rules, all about `%-Flood Pool`, which is the one metric whose meaning
 * is local rather than universal:
 *
 * - Per-dam suppression from the registry: a navigation pool reads 90-94% of
 *   flood pool as its ordinary state. See UsaceDam.suppressMetrics.
 * - A percentage inside the rounding band clamps to 0. Tenkiller measured
 *   -0.39% and +2.29% hours apart on 2026-08-02, and both surfaces render this
 *   as `${value.toFixed(0)}% flood pool` — so the raw number would have shipped
 *   "-0% flood pool" and made the row flicker as the lake drifted.
 * - A meaningfully NEGATIVE percentage omits the metric. Broken Bow read -7.52%:
 *   the lake is drawn down below the flood pool entirely, which is the ordinary
 *   summer state but is not something "% flood pool" can express. The honest
 *   rendering is the one the UI already gives an absent metric — nothing.
 */
export function publishableValue(
  dam: Pick<UsaceDam, 'suppressMetrics'>,
  metric: UsaceMetric,
  value: number
): number | null {
  if (dam.suppressMetrics?.includes(metric)) return null;
  if (metric !== 'pctFloodPool') return value;
  if (value >= 0) return value;
  return value >= FLOOD_POOL_ZERO_BAND ? 0 : null;
}

async function readMetrics(
  dam: UsaceDam,
  requested: UsaceMetric[]
): Promise<Partial<Record<UsaceMetric, DamMetricValue>>> {
  if (!dam.office || !dam.cdaLocation) return {};

  const asked = requested.filter((m) => !dam.suppressMetrics?.includes(m));
  const resolved = await seriesFor(dam, asked);
  const wanted = asked.filter((m) => resolved[m]);
  if (wanted.length === 0) return {};

  const results = await mapWithConcurrency(wanted, FETCH_CONCURRENCY, async (metric) => {
    const series = resolved[metric]!;
    const lookbackHours = series.lookbackHours ?? 8;

    let point: TimeseriesPoint | null;
    let trend: TimeseriesChange | null = null;

    if (TREND_METRICS.includes(metric)) {
      // Read the WINDOW rather than just its last point. fetchLatestValue
      // already fetches exactly this window and discards all but the newest
      // reading, so for a declared series the trend costs nothing but the
      // arithmetic.
      //
      // The `probed` shortcut is deliberately NOT taken here, and it is the one
      // place in this file that spends a request it could avoid. A resolved
      // series arrives with a single point, which cannot carry a trend — so
      // reusing it would show the stage moving at the six Little Rock dams and
      // not at the ten Tulsa ones, for a reason no reader could see. One extra
      // request per resolver-backed dam buys a surface that behaves the same
      // everywhere.
      // Bucketed, so this window matches the one fetchLatestValue would have
      // built for the same series and the two share a cache entry.
      const end = bucketedNow();
      const window = await fetchTimeseries(
        dam.office!,
        series.tsId,
        series.unit,
        new Date(end.getTime() - lookbackHours * 60 * 60 * 1000),
        end
      );
      const points = window?.points ?? [];
      point =
        points.length > 0
          ? points.reduce((a, b) => (b.timestamp > a.timestamp ? b : a))
          : null;
      trend = changeOver(points, TREND_HOURS);
    } else {
      // A resolved series arrives with its value already read — see MetricSource.
      point =
        series.probed ??
        (await fetchLatestValue(dam.office!, series.tsId, series.unit, lookbackHours));
    }

    if (!point) return null;
    const published = publishableValue(dam, metric, point.value);
    if (published === null) return null;
    const value: DamMetricValue = {
      value: published,
      unit: series.unit,
      at: new Date(point.timestamp).toISOString(),
      staleness: stalenessOf(point.timestamp),
      ...(series.dailyMean ? { dailyMean: true } : {}),
      ...(trend ? { trend } : {}),
    };
    return [metric, value] as const;
  });

  const metrics: Partial<Record<UsaceMetric, DamMetricValue>> = {};
  for (const entry of results) {
    if (entry) metrics[entry[0]] = entry[1];
  }
  return metrics;
}

async function readSchedule(dam: UsaceDam, days: number): Promise<DamScheduleDay[]> {
  // Zero days is a caller saying it does not render a schedule at all — see
  // fetchTailwaterDams. Distinct from a dam with no SWPA code, but the answer is
  // the same and the contract is unchanged: an empty schedule renders nothing.
  if (days <= 0) return [];
  if (!dam.swpaCode) return [];
  const schedules = await fetchProjectSchedule(dam.swpaCode, days);
  return schedules.map((s) => ({
    scheduleDate: s.scheduleDate,
    hours: s.hours,
    idle: idleWindows(s),
    retrievedAt: s.retrievedAt,
  }));
}

/**
 * One dam, reading exactly the metrics asked for. Never throws — a source that
 * fails simply contributes nothing, because a dam with a pool level but no
 * schedule is still worth a page.
 *
 * ── One reader, three appetites ────────────────────────────────────────────
 * The metric set is a PARAMETER rather than a second implementation. Everything
 * that makes this awkward — per-district timeseries ids, catalog resolution,
 * daily-mean detection, flood-pool suppression, the trend window — is the same
 * work whoever is asking, and a summary path that reimplemented any of it would
 * drift from the detail path in exactly the ways this file's comments record.
 *
 * Prefer the named wrappers below; they are what the call sites should read as.
 */
async function fetchSnapshot(
  damId: string,
  options: { metrics: UsaceMetric[]; scheduleDays: number }
): Promise<DamSnapshot | null> {
  const dam = getUsaceDam(damId);
  if (!dam) return null;

  const [metrics, schedule] = await Promise.all([
    readMetrics(dam, options.metrics).catch(
      () => ({}) as Partial<Record<UsaceMetric, DamMetricValue>>
    ),
    readSchedule(dam, options.scheduleDays).catch(() => [] as DamScheduleDay[]),
  ]);

  return buildSnapshot(dam, metrics, schedule);
}

/**
 * Assemble the wire payload. Pure — every field comes from the registry entry
 * or from what was already read.
 *
 * ── Why this is separate from the fetching ─────────────────────────────────
 * So the payload's FIELD SET can be asserted without a network call. The
 * consumer of /api/dams is a shipped iOS binary, and the failure that matters
 * is a field quietly ceasing to be carried; a contract test that hand-lists the
 * expected fields can only check the names it was told about, not what this
 * function actually emits. See dams-route-contract.test.ts, which calls this
 * with no metrics and no schedule and asserts on the keys.
 */
export function buildSnapshot(
  dam: UsaceDam,
  metrics: Partial<Record<UsaceMetric, DamMetricValue>>,
  schedule: DamScheduleDay[]
): DamSnapshot {
  const gen = metrics.generationFlow;
  const generating =
    gen && dam.generationOnCfs !== undefined ? gen.value > dam.generationOnCfs : null;

  const sources: string[] = [];
  if (Object.keys(metrics).length > 0) sources.push('USACE CWMS');
  if (schedule.length > 0) sources.push('SWPA');

  return {
    id: dam.id,
    name: dam.name,
    lakeName: dam.lakeName,
    state: dam.state,
    lat: dam.lat,
    lon: dam.lon,
    hasTurbines: Boolean(dam.swpaCode),
    // Field-by-field, not a spread of dam.nameplate: the registry also carries
    // plannedMegawatts (a plant mid-rehabilitation), which nothing renders and
    // which would otherwise ride onto the wire silently, past a shared type
    // that documents exactly two fields.
    ...(dam.nameplate
      ? { nameplate: { units: dam.nameplate.units, megawatts: dam.nameplate.megawatts } }
      : {}),
    ...(dam.tailwaterFishery ? { tailwaterFishery: dam.tailwaterFishery } : {}),
    ...(dam.infoPhone ? { infoPhone: dam.infoPhone } : {}),
    // The reach this dam controls, when Eddy carries it. On the wire so a
    // client holding the dam list can answer "does this river have a dam above
    // it" without a second round trip — which is what lets the iOS river screen
    // show a dam panel with no /api/rivers/[slug]/dam route existing.
    //
    // Field-by-field, and the registry is now WIDER than the wire. It splits
    // the dam's release from the gauges below it; the wire keeps carrying one
    // `gaugeSiteId`, because a shipped iOS build reads exactly that key to open
    // a gauge screen and would lose the link if it were renamed. Nothing on any
    // client needs the second gauge yet, and the last time this was a spread
    // the type boundary silently DROPPED a field (sectionSlug) — a spread can
    // just as easily add one, publishing registry internals as API.
    ...(dam.tailwater
      ? {
          tailwater: {
            riverSlug: dam.tailwater.riverSlug,
            // Omitted, not null, when the reach has no downstream gauge —
            // matching the payload's rule for every other absent thing.
            ...(dam.tailwater.downstreamGaugeSiteIds[0]
              ? { gaugeSiteId: dam.tailwater.downstreamGaugeSiteIds[0] }
              : {}),
            ...(dam.tailwater.sectionSlug ? { sectionSlug: dam.tailwater.sectionSlug } : {}),
          },
        }
      : {}),
    metrics,
    generating,
    schedule,
    sources,
  };
}

/** A dam's own page: every metric, three days of schedule. */
export async function fetchDamDetail(
  damId: string,
  options?: { scheduleDays?: number }
): Promise<DamSnapshot | null> {
  return fetchSnapshot(damId, {
    metrics: DETAIL_METRICS,
    scheduleDays: options?.scheduleDays ?? 3,
  });
}

/**
 * One dam as a list surface needs it — SUMMARY_METRICS only.
 *
 * TWO days of schedule rather than one, because the card names the next change
 * and most of these are peaking plants that go idle overnight. With a single day
 * loaded, every dam whose next start falls after midnight says nothing at all —
 * which is most of them, most evenings. SWPA serves one file per weekday holding
 * ALL projects and that fetch IS cached, so the second day costs one more
 * request for a whole page rather than one per dam.
 */
export async function fetchDamSummary(
  damId: string,
  options?: { scheduleDays?: number }
): Promise<DamSnapshot | null> {
  return fetchSnapshot(damId, {
    metrics: SUMMARY_METRICS,
    scheduleDays: options?.scheduleDays ?? 2,
  });
}

/**
 * Every dam, for the index and /api/dams.
 *
 * Reads three metrics rather than seven. Measured against the registry, that is
 * 19 declared timeseries reads and 35 unresolved slots instead of 43 and 81 —
 * The difference is paid on the first render of each bucket; repeat reads of
 * the same series now share a URL (see bucketedNow in cda.ts).
 */
export async function fetchAllDamSummaries(): Promise<DamSnapshot[]> {
  const ids = Object.keys(USACE_DAMS);
  const results = await mapWithConcurrency(ids, 4, (id) => fetchDamSummary(id));
  return results.filter((d): d is DamSnapshot => d !== null);
}

/**
 * Only the dams that control a reach Eddy carries, for /api/high-water.
 *
 * That route lists dams whose tailwater gauge is running high, then reads a
 * release figure and whether the units are turning. It touches no schedule and
 * no lake state — so this reads neither.
 *
 * The filter runs in the REGISTRY, before any request is made. `tailwater` is a
 * static property of a dam, so asking the Corps about nineteen projects in order
 * to discard nineteen of them was work with no destination. Exactly one dam
 * qualifies today (Clearwater), which turns roughly 120 uncached requests into
 * two.
 */
export async function fetchTailwaterDams(): Promise<DamSnapshot[]> {
  const ids = Object.values(USACE_DAMS)
    .filter((d) => d.tailwater?.downstreamGaugeSiteIds.length)
    .map((d) => d.id);
  const results = await mapWithConcurrency(ids, 4, (id) =>
    fetchSnapshot(id, { metrics: HIGH_WATER_METRICS, scheduleDays: 0 })
  );
  return results.filter((d): d is DamSnapshot => d !== null);
}

/**
 * Every gauge that measures this dam's tailwater, nearest first.
 *
 * The wire carries only the nearest one, so a server-side caller that needs
 * the whole set has to come back to the registry — /api/high-water does, to
 * decide whether a tailwater is running high. Asking about the nearest gauge
 * alone would miss a reach whose upper gauge is quiet while a lower one is up,
 * and on a long tailwater those are different questions.
 */
export function tailwaterGaugeSiteIds(damId: string): string[] {
  return getUsaceDam(damId)?.tailwater?.downstreamGaugeSiteIds ?? [];
}

export function listDamIds(): string[] {
  return Object.keys(USACE_DAMS);
}

export interface ReleaseForecastPoint {
  /** ISO timestamp the forecast value applies to. */
  at: string;
  cfs: number;
}

export interface RiverDamContext {
  dam: DamSnapshot;
  /** The gauge on this river that the release drives. */
  tailwaterGaugeSiteId: string | null;
  /**
   * The Corps' own forward release curve. SWL publishes a DAILY series ~12
   * days out; MVS publishes hourly. Either way it is a forecast, not an
   * observation, and the UI must not draw it as one.
   */
  forecast: ReleaseForecastPoint[];
  /** True when the forecast series is a daily average rather than hourly. */
  forecastIsDaily: boolean;
}

/**
 * The dam that controls a river, if any — for the river hub's dam section.
 *
 * Returns null for all but one river today, and that is the honest answer:
 * only a TAILWATER gets this treatment. Rivers that feed a pool are excluded
 * by the registry rather than filtered here, so there is no "inflow" case to
 * accidentally render as a release.
 */
export async function fetchRiverDam(riverSlug: string): Promise<RiverDamContext | null> {
  const entry = Object.values(USACE_DAMS).find((d) => d.tailwater?.riverSlug === riverSlug);
  if (!entry) return null;

  const series = entry.series.releaseForecast;
  const forecastWindowNow = bucketedNow().getTime();

  const [dam, forecastResult] = await Promise.all([
    // The river hub's dam panel shows release, the schedule and a link out to
    // the dam page — never lake state — so a summary is the whole of what it
    // renders. The iOS panel is already summary-fed: it finds its dam in the
    // /api/dams list rather than fetching one.
    fetchDamSummary(entry.id),
    series && entry.office
      ? fetchTimeseries(
          entry.office,
          series.tsId,
          series.unit,
          // ONE bucketed instant for both ends. Calling bucketedNow() twice
          // would straddle a boundary whenever the two calls fell either side
          // of one, producing exactly the unique URL the bucketing exists to
          // avoid — rarely, and therefore invisibly.
          new Date(forecastWindowNow - 12 * 60 * 60 * 1000),
          new Date(forecastWindowNow + 14 * 24 * 60 * 60 * 1000)
        ).catch(() => null)
      : Promise.resolve(null),
  ]);

  if (!dam) return null;

  // Forward-looking points only. The series overlaps the recent past, and
  // showing yesterday's forecast beside today's reading invites the reader to
  // treat one as a correction of the other.
  const now = Date.now();
  const forecast: ReleaseForecastPoint[] = (forecastResult?.points ?? [])
    .filter((p) => p.timestamp > now)
    .map((p) => ({ at: new Date(p.timestamp).toISOString(), cfs: p.value }));

  return {
    dam,
    // Nearest gauge: this drives the river hub's one dam panel, and the reach
    // a reader is standing on is the one closest to the release. Null when the
    // tailwater has no gauge below it at all.
    tailwaterGaugeSiteId: entry.tailwater!.downstreamGaugeSiteIds[0] ?? null,
    forecast,
    forecastIsDaily: series ? series.tsId.includes('~1Day') : false,
  };
}
