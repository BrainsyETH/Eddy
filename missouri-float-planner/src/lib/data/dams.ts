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
  fetchLatestValue,
  fetchTimeseries,
  stalenessOf,
  type TimeseriesPoint,
} from '@/lib/usace/cda';
import { fetchProjectSchedule, idleWindows } from '@/lib/usace/swpa';
import { resolveSeries, type ResolvedSeries } from '@/lib/usace/resolve';
import {
  USACE_DAMS,
  getUsaceDam,
  type UsaceDam,
  type UsaceMetric,
} from '@/lib/flow-providers/usace-registry';

/** Metrics read for a dam page, in display priority order. */
const SNAPSHOT_METRICS: UsaceMetric[] = [
  'release',
  'generationFlow',
  'poolElevation',
  'pctFloodPool',
  'tailwaterTempF',
];

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
      ...(hit.probed ? { probed: hit.probed } : {}),
    };
  }
  return out;
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

async function readMetrics(dam: UsaceDam): Promise<Partial<Record<UsaceMetric, DamMetricValue>>> {
  if (!dam.office || !dam.cdaLocation) return {};

  const asked = SNAPSHOT_METRICS.filter((m) => !dam.suppressMetrics?.includes(m));
  const resolved = await seriesFor(dam, asked);
  const wanted = asked.filter((m) => resolved[m]);
  if (wanted.length === 0) return {};

  const results = await mapWithConcurrency(wanted, FETCH_CONCURRENCY, async (metric) => {
    const series = resolved[metric]!;
    // A resolved series arrives with its value already read — see MetricSource.
    const point =
      series.probed ??
      (await fetchLatestValue(
        dam.office!,
        series.tsId,
        series.unit,
        series.lookbackHours ?? 8
      ));
    if (!point) return null;
    const published = publishableValue(dam, metric, point.value);
    if (published === null) return null;
    const value: DamMetricValue = {
      value: published,
      unit: series.unit,
      at: new Date(point.timestamp).toISOString(),
      staleness: stalenessOf(point.timestamp),
      ...(series.dailyMean ? { dailyMean: true } : {}),
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
 * Everything a dam page needs. Never throws — a source that fails simply
 * contributes nothing, because a dam with a pool level but no schedule is
 * still worth a page.
 */
export async function fetchDamSnapshot(
  damId: string,
  options?: { scheduleDays?: number }
): Promise<DamSnapshot | null> {
  const dam = getUsaceDam(damId);
  if (!dam) return null;

  const [metrics, schedule] = await Promise.all([
    readMetrics(dam).catch(
      () => ({}) as Partial<Record<UsaceMetric, DamMetricValue>>
    ),
    readSchedule(dam, options?.scheduleDays ?? 2).catch(() => [] as DamScheduleDay[]),
  ]);

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
    ...(dam.nameplate ? { nameplate: dam.nameplate } : {}),
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
 * Snapshots for every dam, for the index page.
 *
 * Schedules are fetched per project, but SWPA serves one file per weekday
 * holding ALL projects — Next's fetch cache collapses those to one request per
 * day across the whole page, so this is far cheaper than the call count
 * suggests.
 */
export async function fetchAllDamSnapshots(): Promise<DamSnapshot[]> {
  const ids = Object.keys(USACE_DAMS);
  const results = await mapWithConcurrency(ids, 4, (id) =>
    fetchDamSnapshot(id, { scheduleDays: 1 })
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

  const [dam, forecastResult] = await Promise.all([
    fetchDamSnapshot(entry.id, { scheduleDays: 2 }),
    series && entry.office
      ? fetchTimeseries(
          entry.office,
          series.tsId,
          series.unit,
          new Date(Date.now() - 12 * 60 * 60 * 1000),
          new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
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
