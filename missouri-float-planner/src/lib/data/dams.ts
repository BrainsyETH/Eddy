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
import { fetchProjectSchedule, idleWindows, SWPA_PROJECTS } from '@/lib/usace/swpa';
import { parseTsId, resolveSeries, type ResolvedSeries } from '@/lib/usace/resolve';
import {
  USACE_DAMS,
  getUsaceDam,
  hasPowerhouse,
  type UsaceDam,
  type UsaceMetric,
} from '@/lib/flow-providers/usace-registry';
import { buildPatternDays, patternHasObservations } from '@/lib/data/dam-history';
import { readPatternHours } from '@/lib/data/dam-history-store';
import { fetchOsageReadings, fetchTrumanDaily } from '@/lib/ameren/osage';

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
  DamGenerationForecast,
  DamForecastWindow,
  DamMetricValue,
  DamPatternDay,
  DamScheduleDay,
  DamSnapshot,
  DamStaleness,
  DamTailwater,
  DamsResponse,
  ScheduledHour,
} from '@shared/dam-types';
import type {
  DamGenerationForecast,
  DamMetricValue,
  DamPatternDay,
  DamScheduleDay,
  DamSnapshot,
} from '@shared/dam-types';
import { buildForecastWindows, FORECAST_HORIZON_HOURS } from '@/lib/data/dam-forecast';

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
export interface MetricSource {
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
export async function seriesFor(
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

  // Either shape of location config feeds the resolver: the common single
  // prefix, or LRN's list of split station namespaces. Neither present means
  // no resolution — explicit ids are all the dam has, and a rename 404s
  // loudly instead of being papered over.
  const locations = dam.cdaLocations ?? (dam.cdaLocation ? [dam.cdaLocation] : []);
  if (unresolved.length === 0 || !dam.office || locations.length === 0) return out;

  const discovered: Partial<Record<UsaceMetric, ResolvedSeries>> = await resolveSeries(
    dam.office,
    locations,
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

/**
 * Metrics from Ameren's hydro reporting API, for the dams CWMS cannot serve.
 * Same shape out as readMetrics, same staleness and trend machinery, so a
 * reading's provenance changes nothing about how a surface treats it.
 *
 * - 'osage' (Bagnell): hourly pool, tailwater and discharge. The tailwater
 *   gets the same 3-hour trend the CWMS path computes, from the same window
 *   arithmetic (changeOver), because the number means the same thing.
 * - 'truman': the daily report's observed pool and outflow, about a day in
 *   arrears. Each value wears the report's own timestamp, so readingStaleness
 *   bands it honestly — a day-old figure renders dimmed with its age, which
 *   is the truth, rather than fresh, which would be the bug.
 */
async function readAmerenMetrics(
  dam: UsaceDam,
  requested: UsaceMetric[]
): Promise<Partial<Record<UsaceMetric, DamMetricValue>>> {
  const metrics: Partial<Record<UsaceMetric, DamMetricValue>> = {};

  if (dam.amerenMetrics === 'osage') {
    const readings = await fetchOsageReadings();
    if (!readings || readings.length === 0) return {};
    const latest = readings[readings.length - 1];
    const at = new Date(latest.timestamp).toISOString();
    const staleness = stalenessOf(latest.timestamp);

    if (requested.includes('release')) {
      metrics.release = { value: latest.dischargeCfs, unit: 'cfs', at, staleness };
    }
    if (requested.includes('poolElevation')) {
      metrics.poolElevation = { value: latest.headwaterFt, unit: 'ft', at, staleness };
    }
    if (requested.includes('tailwaterElevation')) {
      const trend = changeOver(
        readings.map((r) => ({ timestamp: r.timestamp, value: r.tailwaterFt })),
        TREND_HOURS
      );
      metrics.tailwaterElevation = {
        value: latest.tailwaterFt,
        unit: 'ft',
        at,
        staleness,
        ...(trend ? { trend } : {}),
      };
    }
    return metrics;
  }

  if (dam.amerenMetrics === 'truman') {
    const daily = await fetchTrumanDaily();
    if (!daily) return {};
    const at = new Date(daily.timestamp).toISOString();
    const staleness = stalenessOf(daily.timestamp);
    if (requested.includes('poolElevation')) {
      metrics.poolElevation = { value: daily.poolElevationFt, unit: 'ft', at, staleness };
    }
    if (requested.includes('release')) {
      metrics.release = { value: daily.outflowCfs, unit: 'cfs', at, staleness };
    }
    return metrics;
  }

  return metrics;
}

/**
 * Whether readMetrics has anything to fetch for this dam at all.
 *
 * The office is the fetch prerequisite; the rest is "does anything name a
 * series" — declared ids, or a location the resolver can search. This used
 * to be `office && cdaLocation`, which was the same set until the Nashville
 * dams: explicit series, cdaLocations (plural), no cdaLocation — and the
 * old gate silently returned {} for all three, blanking every metric on
 * their pages while every test that could run offline stayed green. Pinned
 * by dams.test.ts against the registry, which is why this is a named
 * function and not an inline condition.
 */
export function hasCwmsMetricsPath(dam: UsaceDam): boolean {
  return Boolean(
    dam.office &&
      (Object.keys(dam.series).length > 0 || dam.cdaLocation || dam.cdaLocations?.length)
  );
}

/**
 * Whether the history cron should keep an hourly record for this dam.
 *
 * Narrower than hasCwmsMetricsPath on purpose: a flood-control dam has no
 * generation pattern, and storing its release alone would build a strip whose
 * top half is permanently empty. Two shapes qualify — an explicit
 * generationFlow series (SWL, LRN), or a SWPA column plus a location the
 * resolver can search (the Tulsa projects, whose turbine series resolve at
 * request time).
 *
 * The location half asks the SAME question hasCwmsMetricsPath asks, in the
 * same shape-agnostic way, because this predicate was written inline as
 * `swpaCode && cdaLocation` and that is the exact singular-only blindness the
 * function above exists to record: a future project configured the Nashville
 * way — turbines, cdaLocations plural, no hand-declared generationFlow — would
 * have been dropped here silently, its strip simply never filling. Named and
 * exported so dams.test.ts can pin the set against the registry rather than
 * trusting a condition nobody can see.
 */
export function wantsHistory(dam: UsaceDam): boolean {
  const hasLocation = Boolean(dam.cdaLocation || dam.cdaLocations?.length);
  return Boolean(dam.office && (dam.series.generationFlow || (dam.swpaCode && hasLocation)));
}

async function readMetrics(
  dam: UsaceDam,
  requested: UsaceMetric[]
): Promise<Partial<Record<UsaceMetric, DamMetricValue>>> {
  if (!hasCwmsMetricsPath(dam)) return {};

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
      // ── AN EMPTY WINDOW FALLS BACK TO THE PROBE, RATHER THAN TO NOTHING ──
      //
      // The window is 8 hours; the resolver's liveness probe looks back 96
      // (PROBE_LOOKBACK_HOURS). So for a resolver-backed dam whose stage series
      // lags half a day, the probe CONFIRMS the series live and holds its
      // reading, and then this fetch finds an empty window and dropped the
      // metric on the floor — the tile vanished from the detail card, which on
      // the wire contract is indistinguishable from "this dam does not publish
      // a tailwater stage at all".
      //
      // A stale number wearing its honest age beats no number: readingStaleness
      // bands it from `at` and the surface dims it and says how old it is,
      // which is exactly what the non-trend branch below already gets by
      // reusing `probed`. The trend stays null — an empty window cannot carry
      // one, and changeOver says so rather than guessing.
      point =
        points.length > 0
          ? points.reduce((a, b) => (b.timestamp > a.timestamp ? b : a))
          : (series.probed ?? null);
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
 * Districts whose CWMS forecast is rendered, with the attribution and zone the
 * payload carries. An office absent here produces NO forecast even if a series
 * is declared — attribution and zone are facts about the district, and a
 * forecast without a named source and clock has no business on a page someone
 * wades against. A TVA-era Eastern district adds its row here; nothing else
 * changes.
 */
const FORECAST_OFFICES: Partial<
  Record<NonNullable<UsaceDam['office']>, { source: string; timeZone: string }>
> = {
  LRN: {
    source: 'U.S. Army Corps of Engineers, Nashville District',
    timeZone: 'America/Chicago',
  },
};

/**
 * The district's forward generation forecast, or undefined when this dam has
 * none to offer. Undefined rather than an empty window list, for the same
 * reason readPattern returns undefined: the section is better absent than
 * present and empty.
 *
 * Requires the dam's `generationOnCfs` floor — the windows' on/off verdicts
 * are made with the same floor the observed `generating` chip uses, so the
 * forecast and the observation cannot disagree about what "running" means.
 */
async function readForecast(dam: UsaceDam): Promise<DamGenerationForecast | undefined> {
  const series = dam.series.generationForecast;
  const office = dam.office ? FORECAST_OFFICES[dam.office] : undefined;
  if (!series || !office || !dam.office || dam.generationOnCfs === undefined) return undefined;

  const now = bucketedNow().getTime();
  const result = await fetchTimeseries(
    dam.office,
    series.tsId,
    series.unit,
    // Two hours back so the hour currently running (stamped at its END) is in
    // the window; buildForecastWindows slices everything older at `now`.
    new Date(now - 2 * 3_600_000),
    new Date(now + FORECAST_HORIZON_HOURS * 3_600_000)
  ).catch(() => null);
  if (!result || result.points.length === 0) return undefined;

  const windows = buildForecastWindows(result.points, dam.generationOnCfs, Date.now());
  if (windows.length === 0) return undefined;

  return {
    windows,
    timeZone: office.timeZone,
    retrievedAt: result.retrievedAt,
    source: office.source,
  };
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
  options: {
    metrics: UsaceMetric[];
    scheduleDays: number;
    pattern?: boolean;
    forecast?: boolean;
  }
): Promise<DamSnapshot | null> {
  const dam = getUsaceDam(damId);
  if (!dam) return null;

  const [metrics, schedule, pattern, forecast] = await Promise.all([
    (dam.amerenMetrics ? readAmerenMetrics(dam, options.metrics) : readMetrics(dam, options.metrics)).catch(
      () => ({}) as Partial<Record<UsaceMetric, DamMetricValue>>
    ),
    readSchedule(dam, options.scheduleDays).catch(() => [] as DamScheduleDay[]),
    options.pattern ? readPattern(damId) : Promise.resolve(undefined),
    options.forecast ? readForecast(dam).catch(() => undefined) : Promise.resolve(undefined),
  ]);

  return buildSnapshot(dam, metrics, schedule, pattern, forecast);
}

/**
 * The observed week behind this dam, or undefined when there is nothing to draw.
 *
 * Undefined rather than eight days of nulls: a strip of pure gaps reads as a
 * week of silence at the powerhouse rather than as a feature with no data yet,
 * and the section is better absent than misleading. `readPatternHours` already
 * swallows its own failures, so this cannot take a page down.
 */
async function readPattern(damId: string): Promise<DamPatternDay[] | undefined> {
  const rows = await readPatternHours(damId);
  if (rows.length === 0) return undefined;
  const days = buildPatternDays(rows);
  return patternHasObservations(days) ? days : undefined;
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
  schedule: DamScheduleDay[],
  pattern?: DamPatternDay[],
  forecast?: DamGenerationForecast
): DamSnapshot {
  const gen = metrics.generationFlow;
  const generating =
    gen && dam.generationOnCfs !== undefined ? gen.value > dam.generationOnCfs : null;

  const sources: string[] = [];
  // Attribution follows the path the metrics actually came down: a dam with
  // amerenMetrics reads Ameren instead of CWMS, never both, so the label is
  // decided by the registry rather than guessed from the values.
  if (Object.keys(metrics).length > 0) {
    sources.push(dam.amerenMetrics ? 'Ameren Missouri' : 'USACE CWMS');
  }
  if (schedule.length > 0) sources.push('SWPA');

  // The two SWPA figures a client needs to size an observation against this
  // project, lifted from the same table megawattsToCfs divides by. Emitted
  // field-by-field rather than spread: SwpaProject also carries `code`, `name`
  // and `state`, none of which is a reference figure, and a spread would
  // publish the parser's internals as API.
  const swpa = dam.swpaCode ? SWPA_PROJECTS[dam.swpaCode] : undefined;

  return {
    id: dam.id,
    name: dam.name,
    lakeName: dam.lakeName,
    state: dam.state,
    lat: dam.lat,
    lon: dam.lon,
    // The PLANT, not the schedule — see hasPowerhouse. A Corps hydro project
    // SWPA does not schedule still has turbines, and CWMS still publishes
    // their flow; saying otherwise renders a missing schedule as a missing
    // powerhouse.
    hasTurbines: hasPowerhouse(dam),
    ...(dam.nameplate ? { nameplate: dam.nameplate } : {}),
    ...(swpa
      ? {
          generationReference: {
            units: swpa.units,
            fullGenerationCfs: swpa.fullPowerCfs,
            schedulingCapacityMw: swpa.capacityMw,
            source: 'SWPA',
          },
        }
      : {}),
    // On the wire for both list and detail: it is what lets a client separate
    // "measured at effectively zero" from "not measured", and the list surfaces
    // carry generationFlow already.
    ...(dam.generationOnCfs !== undefined ? { generationFloorCfs: dam.generationOnCfs } : {}),
    ...(schedule.length > 0 ? { scheduleTimeZone: 'America/Chicago' as const } : {}),
    ...(dam.releaseExcludesGeneration ? { releaseExcludesGeneration: true } : {}),
    ...(pattern && pattern.length > 0 ? { pattern } : {}),
    ...(forecast && forecast.windows.length > 0 ? { generationForecast: forecast } : {}),
    ...(dam.tailwaterFishery ? { tailwaterFishery: dam.tailwaterFishery } : {}),
    ...(dam.infoPhone ? { infoPhone: dam.infoPhone } : {}),
    // The reach this dam controls, when Eddy carries it. On the wire so a
    // client holding the dam list can answer "does this river have a dam above
    // it" without a second round trip — which is what lets the iOS river screen
    // show a dam panel with no /api/rivers/[slug]/dam route existing.
    ...(dam.tailwater ? { tailwater: dam.tailwater } : {}),
    metrics,
    generating,
    schedule,
    sources,
  };
}

/**
 * How many days of SWPA schedule each surface carries.
 *
 * Named because the stored-snapshot path derives a summary from a detail by
 * slicing to the smaller of the two (see summaryOf), and a bare 2 and 3 in
 * three files is how those would come to disagree.
 */
export const DETAIL_SCHEDULE_DAYS = 3;
export const SUMMARY_SCHEDULE_DAYS = 2;

/** A dam's own page: every metric, three days of schedule, the observed week. */
export async function fetchDamDetail(
  damId: string,
  options?: { scheduleDays?: number }
): Promise<DamSnapshot | null> {
  return fetchSnapshot(damId, {
    metrics: DETAIL_METRICS,
    scheduleDays: options?.scheduleDays ?? DETAIL_SCHEDULE_DAYS,
    // Detail only. A twenty-dam index has no room to draw a week per row and no
    // reason to pay twenty database reads for one that is never seen.
    pattern: true,
    // Same argument: ~9 days of hourly forecast is a detail-page payload, and
    // most dams have no forecast series to read anyway.
    forecast: true,
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
    scheduleDays: options?.scheduleDays ?? SUMMARY_SCHEDULE_DAYS,
  });
}

/**
 * A stored DETAIL snapshot, narrowed to what a list surface shows.
 *
 * ── Why a projection rather than a second stored payload ──────────────────
 *
 * Because the detail is a strict superset of the summary — SUMMARY_METRICS is
 * declared as a subset of DETAIL_METRICS, and DETAIL_SCHEDULE_DAYS is the
 * larger of the two windows — so storing both would mean asking CWMS and SWPA
 * for the same project twice an hour to write two rows that cannot legally
 * disagree.
 *
 * ── Why it goes back through buildSnapshot ────────────────────────────────
 *
 * So no field can drift. `sources` is derived from which metrics and how much
 * schedule actually survive the narrowing — a project whose only reading is a
 * detail-only metric must stop claiming CWMS on the list — and re-deriving it
 * here by hand is the second implementation this file's comments keep warning
 * about. buildSnapshot is pure and is the same function the live path uses, so
 * a stored summary is byte-identical to a freshly-read one given the same
 * inputs.
 *
 * Null for a dam the registry no longer carries: buildSnapshot needs the
 * registry entry for identity, and a stored row for a removed project is
 * exactly the row that must not be served.
 */
export function summaryOf(snapshot: DamSnapshot): DamSnapshot | null {
  const dam = getUsaceDam(snapshot.id);
  if (!dam) return null;

  const metrics: Partial<Record<UsaceMetric, DamMetricValue>> = {};
  for (const metric of SUMMARY_METRICS) {
    const value = snapshot.metrics[metric];
    if (value) metrics[metric] = value;
  }

  // A stored detail carries DETAIL_SCHEDULE_DAYS; the list wants the first
  // SUMMARY_SCHEDULE_DAYS of them. readSchedule returns days in order, so this
  // is the same window fetchDamSummary would have asked for.
  return buildSnapshot(dam, metrics, snapshot.schedule.slice(0, SUMMARY_SCHEDULE_DAYS));
}

/**
 * Re-band every metric's staleness against the clock the response is served on.
 *
 * ── Why a stored snapshot needs this and a live one does not ──────────────
 *
 * `staleness` is stamped when a snapshot is assembled, and cda.ts says plainly
 * what that means: "a point-in-time stamp, not a live fact". On the live path
 * the stamp and the response are microseconds apart. On the stored path they
 * can be an hour apart, which would let a reading that has aged out of 'fresh'
 * be served still calling itself fresh — the one field where storing a snapshot
 * would make it say something untrue rather than merely old.
 *
 * Recomputed from each metric's own `at`, which is the observation time and
 * does not move. Everything else in the payload is already self-dating: a
 * schedule names its hours, a pattern names its days, and the display surfaces
 * band all of them on the reader's own clock.
 */
export function refreshStaleness(snapshot: DamSnapshot, now = Date.now()): DamSnapshot {
  const metrics: Partial<Record<UsaceMetric, DamMetricValue>> = {};
  for (const [metric, value] of Object.entries(snapshot.metrics) as [
    UsaceMetric,
    DamMetricValue,
  ][]) {
    const at = Date.parse(value.at);
    metrics[metric] = Number.isFinite(at)
      ? { ...value, staleness: stalenessOf(at, now) }
      : // An unparseable timestamp is left exactly as stored. stalenessOf would
        // answer 'stale' for it, which is the right guess, but rewriting a
        // field we cannot evaluate is how a bad value becomes an asserted one.
        value;
  }
  return { ...snapshot, metrics };
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
  return fetchDamSummaries(Object.keys(USACE_DAMS));
}

/**
 * Summaries for a NAMED subset of dams, read live.
 *
 * Exists for the stored-snapshot path in /api/dams: when the cron has rows for
 * eighteen of twenty projects, the route serves those eighteen from the table
 * and reads only the two it is missing. The alternative — all stored or all
 * live — has a cliff in it, because one project that never stores (a district
 * publishing nothing, a series id that moved) would silently put every dam
 * back on the live path forever, with nothing anywhere saying so.
 */
export async function fetchDamSummaries(ids: string[]): Promise<DamSnapshot[]> {
  if (ids.length === 0) return [];
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
    .filter((d) => d.tailwater?.gaugeSiteId)
    .map((d) => d.id);
  const results = await mapWithConcurrency(ids, 4, (id) =>
    fetchSnapshot(id, { metrics: HIGH_WATER_METRICS, scheduleDays: 0 })
  );
  return results.filter((d): d is DamSnapshot => d !== null);
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
  tailwaterGaugeSiteId: string;
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
    tailwaterGaugeSiteId: entry.tailwater!.gaugeSiteId,
    forecast,
    forecastIsDaily: series ? series.tsId.includes('~1Day') : false,
  };
}
