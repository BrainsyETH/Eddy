// src/lib/usace/resolve.ts
// Discovers the right CWMS timeseries for a logical metric, instead of
// hardcoding its id.
//
// WHY THIS EXISTS. Districts name the same concept differently, and there is no
// derivable rule — measured across six districts on 2026-07-27:
//
//   SWL   Flow-Res Out | 1Hour     | Regi-Comp
//   MVS   Flow-Out     | ~1Day     | lakerep-rev
//   SWT   Flow-Res Out | 1Hour     | Rev-Regi-Flowgroup
//   NAB   Flow-Out     | 15Minutes | National-CWMS-Forecast
//   SAM   Flow-Out     | 1Hour     | Raw-APCO / Raw-GPC
//   SPK   Flow-Res Out | 1Hour     | Calc-val
//
// Enumerating ids by hand is right for ten dams and wrong for a hundred: it
// makes adding a district an act of transcription, and it can only FAIL on a
// rename, never recover from one. This module inverts that — describe the
// metric once, let the catalog say which series currently carries it.
//
// It is a FALLBACK, not a replacement. Explicit ids in usace-registry.ts are
// verified and always win; the resolver covers the two cases they can't: a dam
// with no entry yet, and an entry whose series has been renamed out from under
// us. A resolver that silently picks the WRONG series is worse than a hardcoded
// one that 404s loudly, so the scoring below is deliberately conservative and
// returns null rather than guessing.
//
// THE CATALOG IS NOT A FRESHNESS ORACLE. Measured 2026-08-02: every
// `latest-time` and `last-update` in /catalog/TIMESERIES was stamped
// 2026-07-27 — six days stale — while /timeseries returned live values for the
// same ids (Bull Shoals release 730 cfs at 15:00Z that day). The original 36h
// age gate therefore disqualified every live hourly series, and `~1Month`
// aggregates survived on a technicality: their bucket stamp is dated to the
// START of a future month, so a monthly mean looked 30 hours old. Bull Shoals
// resolved 4 of 8 metrics, all monthly averages; Tenkiller resolved nothing.
// It stayed invisible because hardcoded ids win for every shipped dam.
//
// So freshness now comes from READING A VALUE (see probeSeries) and the
// catalog timestamp is demoted to a liveness FLOOR that only buries corpses —
// series a district abandoned years ago and left listed. Interval is an
// ALLOWLIST rather than a ranking, so no aggregate can represent "right now"
// however fresh its metadata claims to be.

import {
  bucketedNow,
  fetchLatestValue,
  fetchTimeseries,
  type TimeseriesPoint,
} from '@/lib/usace/cda';
import type { UsaceMetric } from '@/lib/flow-providers/usace-registry';

const CDA_BASE = 'https://cwms-data.usace.army.mil/cwms-data';
const CDA_HEADERS = { Accept: 'application/json;version=2' } as const;

const REQUEST_TIMEOUT_MS = 10_000;
/** The catalog changes when a district reworks its series — rare. */
const REVALIDATE_SECONDS = 86_400;

/**
 * Liveness floor, NOT a freshness measure — see the header.
 *
 * Deliberately generous: it has to survive a catalog whose metadata is frozen
 * for an unknown stretch, while still rejecting what it exists to reject —
 * `Bull_Shoals_Dam.Flow-Res Out.Ave.1Hour.1Hour.CCP-Comp` last carried data in
 * February 2020 and is still listed beside the live `Regi-Comp` series.
 */
const CATALOG_MAX_AGE_DAYS = 30;

/**
 * Candidates probed per metric before giving up. Bounds the added fan-out: the
 * first candidate is right almost always, so this is the cost of being wrong,
 * not the cost of being right.
 */
const MAX_PROBES_PER_METRIC = 3;

/** Lookback for the liveness probe. Covers MVS's daily mean, ~a day in arrears. */
const PROBE_LOOKBACK_HOURS = 96;

/** How far ahead to look when confirming a forecast series actually forecasts. */
const FORECAST_HORIZON_DAYS = 14;

/**
 * Intervals that summarise a PERIOD rather than sample a moment. Rejected for
 * every metric, so the "what does this number mean" failure cannot recur even
 * if someone adds `~1Month` to a spec's interval list by hand.
 */
const AGGREGATE_INTERVAL = /^~?1(Week|Month|Year|Decade)$/i;

export interface CatalogEntry {
  name: string;
  units: string;
  /** ISO of the most recent value, or null when the catalog reports none. */
  latestTime: string | null;
}

/** CWMS ids are `Location.Parameter.Type.Interval.Duration.Version`. */
export interface ParsedTsId {
  location: string;
  parameter: string;
  type: string;
  interval: string;
  duration: string;
  version: string;
}

export function parseTsId(name: string): ParsedTsId | null {
  const parts = name.split('.');
  if (parts.length < 6) return null;
  return {
    location: parts[0],
    parameter: parts[1],
    type: parts[2],
    interval: parts[3],
    duration: parts[4],
    // Version is everything remaining — a few districts put dots in it.
    version: parts.slice(5).join('.'),
  };
}

/**
 * One acceptable way a district spells a metric: a parameter name AND the
 * sub-location it must sit on. `subLocation: ''` means the bare project.
 *
 * These are PAIRS rather than two independent lists because the cross-product
 * admits combinations that do not exist and are dangerous. Tulsa publishes
 * tailwater elevation as `TENK.Elev-Tailwater` — on the BARE location, where
 * SWL uses `..._Dam-Tailwater.Elev-Downstream`. Reaching it with a
 * `subLocations: ['-Tailwater', '']` list would also admit bare `TENK.Elev`,
 * which is the POOL: measured 2026-08-02, `TENK.Elev` = 632.94 ft and
 * `TENK.Elev-Tailwater` = 482.86 ft. A 150-foot error, silently.
 */
interface ParamPair {
  parameter: string;
  subLocation: string;
}

interface MetricSpec {
  /** Accepted parameter/sub-location pairs, best first. */
  pairs: ParamPair[];
  /**
   * Intervals ALLOWED, best first. Anything not listed is disqualified — not
   * merely ranked last. The old code scored an unlisted interval
   * `(len - len) * 10 = 0`, i.e. no penalty at all, which is how a monthly mean
   * came to represent "release right now".
   */
  intervals: string[];
  /** Unit to request; CDA converts server-side. */
  unit: 'cfs' | 'ft' | 'F' | '%';
  /** True when a FORECAST series is wanted; false rejects forecast versions. */
  forecast: boolean;
}

/** `Flow-Res Out` (SWL/SWT/SPK) and `Flow-Out` (MVS/NAB/SAM) on the project. */
const RELEASE_PAIRS: ParamPair[] = [
  { parameter: 'Flow-Res Out', subLocation: '' },
  { parameter: 'Flow-Out', subLocation: '' },
];

const SPECS: Partial<Record<UsaceMetric, MetricSpec>> = {
  release: {
    pairs: RELEASE_PAIRS,
    intervals: ['1Hour', '30Minutes', '15Minutes', '~1Day'],
    unit: 'cfs',
    forecast: false,
  },
  releaseForecast: {
    pairs: RELEASE_PAIRS,
    intervals: ['1Hour', '15Minutes', '~1Day'],
    unit: 'cfs',
    forecast: true,
  },
  poolElevation: {
    // SWL hangs pool elevation off `-Headwater`; MVS and SWT use the bare
    // project. `~1Hour` is SWT's interlaced series.
    pairs: [
      { parameter: 'Elev', subLocation: '-Headwater' },
      { parameter: 'Elev', subLocation: '' },
    ],
    intervals: ['1Hour', '30Minutes', '15Minutes', '~1Hour'],
    unit: 'ft',
    forecast: false,
  },
  pctFloodPool: {
    // SWT spells it `%-Flood Pool Full` on the bare project. Exact-match
    // scoring meant the SWL name could never reach it.
    pairs: [
      { parameter: '%-Flood Pool', subLocation: '-Headwater' },
      { parameter: '%-Flood Pool', subLocation: '' },
      { parameter: '%-Flood Pool Full', subLocation: '' },
    ],
    intervals: ['1Hour', '30Minutes', '~1Day'],
    unit: '%',
    forecast: false,
  },
  inflow: {
    pairs: [
      { parameter: 'Flow-Res In', subLocation: '' },
      { parameter: 'Flow-In', subLocation: '' },
    ],
    intervals: ['1Hour', '~6Hours', '~1Day'],
    unit: 'cfs',
    forecast: false,
  },
  generationFlow: {
    // SWL calls turbine discharge `Flow-Plant`; SWT calls it `Flow-Power`.
    // Verified 2026-08-02: TENK.Flow-Power read 0 cfs while total release was
    // 330 cfs — units idle with a low-flow release running, which is exactly
    // the distinction generationOnCfs exists to make.
    pairs: [
      { parameter: 'Flow-Plant', subLocation: '' },
      { parameter: 'Flow-Power', subLocation: '' },
    ],
    intervals: ['1Hour', '15Minutes'],
    unit: 'cfs',
    forecast: false,
  },
  tailwaterElevation: {
    // Bare `Elev` is deliberately ABSENT — that is the pool. See ParamPair.
    pairs: [
      { parameter: 'Elev-Downstream', subLocation: '-Tailwater' },
      { parameter: 'Elev', subLocation: '-Tailwater' },
      { parameter: 'Elev-Tailwater', subLocation: '' },
    ],
    intervals: ['1Hour', '30Minutes', '15Minutes'],
    unit: 'ft',
    forecast: false,
  },
  tailwaterTempF: {
    pairs: [{ parameter: 'Temp-Water', subLocation: '-Tailwater' }],
    intervals: ['1Hour', '30Minutes', '15Minutes'],
    unit: 'F',
    forecast: false,
  },
};

const FORECAST_VERSION = /forecast/i;
/** Reviewed beats raw: raw is often an hour fresher but not quality-controlled. */
const REVIEWED_VERSION = /(^|[-.])rev($|[-.])/i;
const RAW_VERSION = /(^|[-.])raw($|[-.])/i;

export interface ResolvedSeries {
  tsId: string;
  unit: MetricSpec['unit'];
  /** Why this one won, for logging when a resolution looks wrong. */
  reason: string;
  /**
   * The point the liveness probe actually read. Callers reuse it rather than
   * re-fetching the same window a second time — see resolveSeries.
   */
  probed?: TimeseriesPoint;
}

/**
 * Score a candidate. Higher wins; null means disqualified.
 *
 * Disqualification does the real work here, and every `return null` below is a
 * failure this resolver actually produced against the live catalog. Ranking
 * only breaks ties between series that are all legitimate answers.
 */
function score(
  entry: CatalogEntry,
  spec: MetricSpec,
  location: string,
  now: number,
  maxAgeDays: number
): { points: number; reason: string } | null {
  const parsed = parseTsId(entry.name);
  if (!parsed) return null;

  const pairIndex = spec.pairs.findIndex(
    (pair) =>
      parsed.parameter === pair.parameter &&
      parsed.location === `${location}${pair.subLocation}`
  );
  if (pairIndex === -1) return null;

  const isForecast = FORECAST_VERSION.test(parsed.version);
  if (isForecast !== spec.forecast) return null;

  // An interval the spec did not ask for is not an answer to this metric.
  if (AGGREGATE_INTERVAL.test(parsed.interval)) return null;
  const intervalIndex = spec.intervals.indexOf(parsed.interval);
  if (intervalIndex === -1) return null;

  // Liveness floor only. A series the catalog has never seen a value for, or
  // one abandoned years ago, is not a candidate; anything more recent goes to
  // the probe, because the catalog's own clock cannot be trusted (see header).
  if (!entry.latestTime) return null;
  const latest = new Date(entry.latestTime).getTime();
  if (!Number.isFinite(latest)) return null;
  if ((now - latest) / 86_400_000 > maxAgeDays) return null;

  let points = 0;
  points += (spec.pairs.length - pairIndex) * 100;
  points += (spec.intervals.length - intervalIndex) * 10;
  if (REVIEWED_VERSION.test(parsed.version)) points += 5;
  if (RAW_VERSION.test(parsed.version)) points -= 3;

  return {
    points,
    reason: `${parsed.parameter}/${parsed.interval}/${parsed.version}`,
  };
}

/**
 * Every acceptable series for a metric, best first. Pure.
 *
 * A ranked list rather than one winner because the catalog cannot tell us which
 * candidate is live — only reading a value can, and that has to be able to fall
 * through to the runner-up.
 */
export function rankSeries(
  entries: CatalogEntry[],
  metric: UsaceMetric,
  location: string,
  options?: { now?: number; maxAgeDays?: number }
): ResolvedSeries[] {
  const spec = SPECS[metric];
  if (!spec) return [];

  const now = options?.now ?? Date.now();
  const maxAgeDays = options?.maxAgeDays ?? CATALOG_MAX_AGE_DAYS;

  return entries
    .map((entry) => {
      const s = score(entry, spec, location, now, maxAgeDays);
      return s ? { entry, ...s } : null;
    })
    .filter((c): c is { entry: CatalogEntry; points: number; reason: string } => c !== null)
    .sort((a, b) => b.points - a.points || a.entry.name.localeCompare(b.entry.name))
    .map((c) => ({ tsId: c.entry.name, unit: spec.unit, reason: c.reason }));
}

/** The single best series for a metric, or null. Pure. */
export function pickSeries(
  entries: CatalogEntry[],
  metric: UsaceMetric,
  location: string,
  options?: { now?: number; maxAgeDays?: number }
): ResolvedSeries | null {
  return rankSeries(entries, metric, location, options)[0] ?? null;
}

/**
 * Whether a series carries points beyond `now` — what actually makes a
 * forecast a forecast.
 *
 * This replaces a catalog-metadata check that the frozen catalog broke: MVS
 * lists CWMS-Forecast-16dQPF (dead since 2019, zero future points) beside
 * CWMS-Forecast-NoQPF (11 days out), and both look equally plausible by name.
 * Asking the data is the only test that separates them and keeps working when
 * the catalog's clock stops.
 */
export function hasFuturePoint(points: TimeseriesPoint[], now = Date.now()): boolean {
  return points.some((p) => p.timestamp > now);
}

interface CdaCatalogResponse {
  entries?: Array<{
    name?: string;
    units?: string;
    extents?: Array<{ 'latest-time'?: string }>;
  }>;
}

/**
 * Every timeseries for one project. One request serves every metric, so
 * callers should fetch once and call pickSeries repeatedly.
 */
export async function fetchCatalog(
  office: string,
  location: string
): Promise<CatalogEntry[] | null> {
  // `like` is a regex over the full id. Escape the location so a project whose
  // name contains regex metacharacters can't widen the match.
  const pattern = `${location.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*`;
  const url =
    `${CDA_BASE}/catalog/TIMESERIES?office=${encodeURIComponent(office)}` +
    `&like=${encodeURIComponent(pattern)}&page-size=1000`;

  try {
    const res = await fetch(url, {
      headers: CDA_HEADERS,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) {
      console.error(`[CDA catalog] ${office}/${location}: HTTP ${res.status}`);
      return null;
    }
    const doc = (await res.json()) as CdaCatalogResponse;
    return (doc.entries ?? [])
      .filter((e): e is { name: string; units?: string; extents?: Array<{ 'latest-time'?: string }> } =>
        typeof e.name === 'string'
      )
      .map((e) => ({
        name: e.name,
        units: e.units ?? '',
        latestTime: e.extents?.[0]?.['latest-time'] ?? null,
      }));
  } catch (e) {
    console.error(`[CDA catalog] ${office}/${location}: fetch failed`, e);
    return null;
  }
}

/**
 * Confirm a candidate is live by reading it, returning the point on success.
 *
 * This is the resolver's freshness test. Returning the POINT rather than a
 * boolean matters: the caller wants that value anyway, so a confirmed
 * resolution costs one request instead of two.
 */
export type SeriesProbe = (
  office: string,
  series: { tsId: string; unit: string; forecast: boolean }
) => Promise<TimeseriesPoint | null>;

const defaultProbe: SeriesProbe = async (office, { tsId, unit, forecast }) => {
  if (!forecast) return fetchLatestValue(office, tsId, unit, PROBE_LOOKBACK_HOURS);

  const now = Date.now();
  // The WINDOW is bucketed so repeated probes of the same candidate share a
  // URL and can be cached; the freshness check below still uses the real clock,
  // because whether a point is in the future is a question about now and not
  // about the bucket.
  const windowNow = bucketedNow().getTime();
  const result = await fetchTimeseries(
    office,
    tsId,
    unit,
    new Date(windowNow - 6 * 3_600_000),
    new Date(windowNow + FORECAST_HORIZON_DAYS * 86_400_000)
  );
  const points = result?.points ?? [];
  if (!hasFuturePoint(points, now)) return null;
  // The furthest-out point, so a caller can see the horizon it bought.
  return points.reduce((a, b) => (b.timestamp > a.timestamp ? b : a));
};

/**
 * Resolve several metrics from a single catalog fetch, confirming each by
 * reading a value.
 *
 * Metrics resolve concurrently but candidates within a metric are tried in
 * order — the runner-up only costs a request when the favourite is dead.
 */
export async function resolveSeries(
  office: string,
  location: string,
  metrics: UsaceMetric[],
  options?: { probe?: SeriesProbe; now?: number }
): Promise<Partial<Record<UsaceMetric, ResolvedSeries>>> {
  const entries = await fetchCatalog(office, location);
  if (!entries) return {};

  const probe = options?.probe ?? defaultProbe;
  const out: Partial<Record<UsaceMetric, ResolvedSeries>> = {};

  await Promise.all(
    metrics.map(async (metric) => {
      const spec = SPECS[metric];
      if (!spec) return;
      const candidates = rankSeries(entries, metric, location, {
        now: options?.now,
      }).slice(0, MAX_PROBES_PER_METRIC);

      for (const candidate of candidates) {
        const point = await probe(office, {
          tsId: candidate.tsId,
          unit: candidate.unit,
          forecast: spec.forecast,
        }).catch(() => null);
        if (point) {
          out[metric] = { ...candidate, probed: point };
          return;
        }
        console.info(
          `[CDA resolve] ${office}/${location}.${metric}: ${candidate.tsId} returned no value, trying next`
        );
      }
    })
  );

  return out;
}

/** Metrics the resolver knows how to look for. */
export const RESOLVABLE_METRICS = Object.keys(SPECS) as UsaceMetric[];
