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

import type { UsaceMetric } from '@/lib/flow-providers/usace-registry';

const CDA_BASE = 'https://cwms-data.usace.army.mil/cwms-data';
const CDA_HEADERS = { Accept: 'application/json;version=2' } as const;

const REQUEST_TIMEOUT_MS = 10_000;
/** The catalog changes when a district reworks its series — rare. */
const REVALIDATE_SECONDS = 86_400;

/**
 * A series older than this is not a live feed, whatever it is named.
 *
 * Scaled by interval, because "stale" means different things at different
 * cadences: MVS publishes observed release as a DAILY average roughly a day in
 * arrears, so a single 36h gate rejected the correct series outright. Caught by
 * running the resolver against the live catalog — Wappapello and Mark Twain
 * resolved to nothing while all six SWL dams resolved fine.
 */
const DEFAULT_MAX_AGE_HOURS = 36;
const DAILY_MAX_AGE_HOURS = 96;

function maxAgeForInterval(interval: string, fallback: number): number {
  return /(^|~)1?Day/i.test(interval) ? Math.max(fallback, DAILY_MAX_AGE_HOURS) : fallback;
}

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

interface MetricSpec {
  /** Accepted CWMS parameter names, best first. */
  parameters: string[];
  /**
   * Location suffixes to accept, best first. '' means the bare project.
   * Pool elevation lives on `-Headwater` at SWL but on the bare location at
   * MVS, and water temperature only ever lives on `-Tailwater`.
   */
  subLocations: string[];
  /** Intervals preferred, best first. Anything else scores last but is allowed. */
  intervals: string[];
  /** Unit to request; CDA converts server-side. */
  unit: 'cfs' | 'ft' | 'F' | '%';
  /** True when a FORECAST series is wanted; false rejects forecast versions. */
  forecast: boolean;
}

const SPECS: Partial<Record<UsaceMetric, MetricSpec>> = {
  release: {
    parameters: ['Flow-Res Out', 'Flow-Out'],
    subLocations: [''],
    intervals: ['1Hour', '30Minutes', '~1Day'],
    unit: 'cfs',
    forecast: false,
  },
  releaseForecast: {
    parameters: ['Flow-Res Out', 'Flow-Out'],
    subLocations: [''],
    intervals: ['1Hour', '~1Day'],
    unit: 'cfs',
    forecast: true,
  },
  poolElevation: {
    parameters: ['Elev'],
    subLocations: ['-Headwater', ''],
    intervals: ['1Hour', '30Minutes'],
    unit: 'ft',
    forecast: false,
  },
  pctFloodPool: {
    parameters: ['%-Flood Pool'],
    subLocations: ['-Headwater', ''],
    intervals: ['1Hour', '~1Day'],
    unit: '%',
    forecast: false,
  },
  inflow: {
    parameters: ['Flow-Res In', 'Flow-In'],
    subLocations: [''],
    intervals: ['1Hour', '~1Day'],
    unit: 'cfs',
    forecast: false,
  },
  generationFlow: {
    parameters: ['Flow-Plant'],
    subLocations: [''],
    intervals: ['1Hour'],
    unit: 'cfs',
    forecast: false,
  },
  tailwaterElevation: {
    parameters: ['Elev-Downstream', 'Elev'],
    subLocations: ['-Tailwater'],
    intervals: ['1Hour', '30Minutes'],
    unit: 'ft',
    forecast: false,
  },
  tailwaterTempF: {
    parameters: ['Temp-Water'],
    subLocations: ['-Tailwater'],
    intervals: ['1Hour', '30Minutes'],
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
}

/**
 * Score a candidate. Higher wins; null means disqualified.
 *
 * Freshness is a GATE rather than a term: a beautifully-named series that
 * stopped updating in 2019 is not the answer, and letting a name outrank
 * staleness is how a resolver quietly serves dead data.
 */
function score(
  entry: CatalogEntry,
  spec: MetricSpec,
  location: string,
  now: number,
  maxAgeHours: number
): { points: number; reason: string } | null {
  const parsed = parseTsId(entry.name);
  if (!parsed) return null;

  const subIndex = spec.subLocations.findIndex(
    (suffix) => parsed.location === `${location}${suffix}`
  );
  if (subIndex === -1) return null;

  const paramIndex = spec.parameters.indexOf(parsed.parameter);
  if (paramIndex === -1) return null;

  const isForecast = FORECAST_VERSION.test(parsed.version);
  if (isForecast !== spec.forecast) return null;

  if (!entry.latestTime) return null;
  const latest = new Date(entry.latestTime).getTime();
  if (!Number.isFinite(latest)) return null;

  if (spec.forecast) {
    // A LIVE forecast extends into the future — that is what makes it a
    // forecast. Districts leave retired forecast series in the catalog with
    // perfectly plausible names: MVS still lists CWMS-Forecast-16dQPF, whose
    // last value is from 2019 and which returns ZERO future points, right
    // beside CWMS-Forecast-NoQPF, which runs 11 days ahead. Without this check
    // the dead one scored just as well as the live one.
    if (latest <= now) return null;
  } else {
    const ageHours = (now - latest) / 3_600_000;
    if (ageHours > maxAgeForInterval(parsed.interval, maxAgeHours)) return null;
  }

  const intervalIndex = spec.intervals.indexOf(parsed.interval);
  const intervalRank = intervalIndex === -1 ? spec.intervals.length : intervalIndex;

  let points = 0;
  points += (spec.subLocations.length - subIndex) * 1000;
  points += (spec.parameters.length - paramIndex) * 100;
  points += (spec.intervals.length - intervalRank) * 10;
  if (REVIEWED_VERSION.test(parsed.version)) points += 5;
  if (RAW_VERSION.test(parsed.version)) points -= 3;

  return {
    points,
    reason: `${parsed.parameter}/${parsed.interval}/${parsed.version}`,
  };
}

/** Pick the best series for a metric from a catalog listing. Pure. */
export function pickSeries(
  entries: CatalogEntry[],
  metric: UsaceMetric,
  location: string,
  options?: { now?: number; maxAgeHours?: number }
): ResolvedSeries | null {
  const spec = SPECS[metric];
  if (!spec) return null;

  const now = options?.now ?? Date.now();
  const maxAgeHours = options?.maxAgeHours ?? DEFAULT_MAX_AGE_HOURS;

  let best: { entry: CatalogEntry; points: number; reason: string } | null = null;
  for (const entry of entries) {
    const s = score(entry, spec, location, now, maxAgeHours);
    if (!s) continue;
    if (!best || s.points > best.points) best = { entry, ...s };
  }

  if (!best) return null;
  return { tsId: best.entry.name, unit: spec.unit, reason: best.reason };
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

/** Resolve several metrics from a single catalog fetch. */
export async function resolveSeries(
  office: string,
  location: string,
  metrics: UsaceMetric[]
): Promise<Partial<Record<UsaceMetric, ResolvedSeries>>> {
  const entries = await fetchCatalog(office, location);
  if (!entries) return {};

  const out: Partial<Record<UsaceMetric, ResolvedSeries>> = {};
  for (const metric of metrics) {
    const hit = pickSeries(entries, metric, location);
    if (hit) out[metric] = hit;
  }
  return out;
}

/** Metrics the resolver knows how to look for. */
export const RESOLVABLE_METRICS = Object.keys(SPECS) as UsaceMetric[];
