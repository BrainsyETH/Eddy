// src/lib/nws/forecast.ts
//
// Official NWS forecast hydrographs via the National Water Prediction Service
// (NWPS), keyed by NWS Location ID (LID, stored in gauge_stations.nws_lid).
//
// ── Why not AHPS ──────────────────────────────────────────────────────────
// The legacy AHPS hydrograph XML was retired in 2024 (src/lib/nws/flood-stages.ts
// already says so in its header) and its host no longer completes a TLS
// connection — curl exits 56, not 404. The module that read it caught that and
// returned [], so every caller quietly believed the river simply had no
// forecast: the river outlook and /api/usgs/mo-forecast rendered "no official
// forecast" for every river, with no error anywhere, while the gauge chart
// (already on this module) drew one for the same station. That module is gone;
// forecast.test.ts keeps the retired host from being named under src/ again.
//
// NWPS serves the same product at /gauges/{lid}/stageflow, alongside the
// observed series this app already reads in flow-providers/nws.ts.
//
// ── Both units, unlike AHPS ────────────────────────────────────────────────
// The legacy XML carried stage only, which is why anything built on it could
// only draw a forecast on a foot axis. NWPS reports `primary` (Stage, ft) and
// `secondary` (Flow, kcfs) per point, so a discharge-rated river gets a
// forecast on its own axis rather than none at all. Units are read from the
// document and folded BY UNIT rather than by position — same rule, and same
// reason, as foldByUnit() in flow-providers/nws.ts.

import { trackedFetch } from '@/lib/telemetry/upstream';
const NWPS_BASE = 'https://api.water.noaa.gov/nwps/v1/gauges';

/** NWPS marks missing values with large negative sentinels. */
function isMissing(v: number | undefined | null): boolean {
  return v === undefined || v === null || !Number.isFinite(v) || v <= -999;
}

export interface NwsForecastPoint {
  timestamp: string;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
}

export interface NwsForecast {
  /** Null when NWPS has no live forecast — see the zero-time note below. */
  issuedAt: string | null;
  /** Oldest first. Empty for a gauge with no active forecast, which is normal. */
  points: NwsForecastPoint[];
}

const EMPTY: NwsForecast = { issuedAt: null, points: [] };

interface StageflowPoint {
  validTime?: string;
  primary?: number;
  secondary?: number;
}

interface StageflowSection {
  issuedTime?: string;
  primaryUnits?: string;
  secondaryUnits?: string;
  data?: StageflowPoint[];
}

/**
 * A gauge with no active forecast still returns a `forecast` section — with an
 * empty `data`, blank units, and issuedTime "0001-01-01T00:00:00Z". Passing
 * that zero value through as an issuance time would date the forecast to the
 * year 1, so anything at or before the Unix epoch becomes null.
 */
function issuedAtOrNull(raw: string | undefined): string | null {
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) && parsed > 0 ? raw : null;
}

function foldByUnit(
  point: NwsForecastPoint,
  value: number | undefined,
  unit: string | undefined,
): void {
  if (isMissing(value)) return;
  const u = (unit ?? '').toLowerCase();
  if (u === 'ft') point.gaugeHeightFt = value as number;
  else if (u === 'kcfs') point.dischargeCfs = (value as number) * 1000;
  else if (u === 'cfs') point.dischargeCfs = value as number;
}

/**
 * One gauge's official forecast. Returns an empty forecast rather than throwing:
 * NWPS is a third party, and "no forecast" is an ordinary state for most gauges
 * (only ~12,700 of them are forecast points at all).
 *
 * The timeout is deliberately tighter than the 10s used by the backfill paths
 * in flood-stages.ts — this one sits on a user-facing render, so a slow upstream
 * should cost the forecast overlay rather than the whole chart. The CDN headers
 * on the calling route are what keep this off the hot path in the normal case.
 */
export async function fetchNwsForecast(lid: string, options: { strict?: boolean; signal?: AbortSignal } = {}): Promise<NwsForecast> {
  try {
    const res = await trackedFetch('nws', 'forecast', `${NWPS_BASE}/${encodeURIComponent(lid)}/stageflow`, {
      signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(6_000)]) : AbortSignal.timeout(6_000),
      headers: { Accept: 'application/json' },
      next: { revalidate: 900 },
    });
    if (!res.ok) {
      // 404 is ordinary here: not every LID we hold is an NWPS gauge.
      if (res.status !== 404 && options.strict) throw new Error('NWS forecast lookup failed');
      if (res.status !== 404) console.warn(`[NWPS] ${lid} stageflow: HTTP ${res.status}`);
      return EMPTY;
    }

    const doc = (await res.json()) as { forecast?: StageflowSection };
    const section = doc.forecast;
    if (options.strict && (!section || !Array.isArray(section.data))) throw new Error('Malformed NWS forecast response');
    if (!section?.data?.length) return EMPTY;

    const points = section.data
      .flatMap((raw) => {
        if (!raw.validTime || !Number.isFinite(Date.parse(raw.validTime))) return [];
        const point: NwsForecastPoint = {
          timestamp: raw.validTime,
          gaugeHeightFt: null,
          dischargeCfs: null,
        };
        foldByUnit(point, raw.primary, section.primaryUnits);
        foldByUnit(point, raw.secondary, section.secondaryUnits);
        // A point carrying neither unit says nothing; drop it rather than
        // plotting a hole in the middle of the forecast line.
        return point.gaugeHeightFt === null && point.dischargeCfs === null ? [] : [point];
      })
      .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

    return points.length ? { issuedAt: issuedAtOrNull(section.issuedTime), points } : EMPTY;
  } catch (e) {
    if (options.strict) throw e;
    console.error(`[NWPS] ${lid} stageflow: fetch failed`, e);
    return EMPTY;
  }
}

/** A forecast point as a stage in feet — the shape the outlook and the statewide map read. */
export interface NwsForecastStage {
  dateTime: string;
  valueFt: number;
}

/**
 * The stage-only view of a forecast. Points NWPS published as flow alone are
 * dropped: these callers grade against a foot ladder and compare to flood
 * stages, and a cfs value has no place on either.
 */
export function forecastStages(points: NwsForecastPoint[]): NwsForecastStage[] {
  return points.flatMap((point) =>
    point.gaugeHeightFt === null ? [] : [{ dateTime: point.timestamp, valueFt: point.gaugeHeightFt }],
  );
}

/** One gauge's official forecast as stages. [] when there is none, like fetchNwsForecast. */
export async function fetchNwsForecastStages(lid: string, signal?: AbortSignal): Promise<NwsForecastStage[]> {
  return forecastStages((await fetchNwsForecast(lid, { signal })).points);
}

/**
 * The highest stage still ahead, within `hours` of `nowMs`.
 *
 * NWPS keeps serving a forecast from its issuance time, so a day-old forecast
 * leads with points that have already happened, and a mainstem forecast runs
 * two weeks out. A "72h peak" taken over the whole series would name a crest
 * that already passed, or one eleven days away.
 */
export function upcomingPeak(
  stages: NwsForecastStage[],
  nowMs: number,
  hours = 72,
): { peakFt: number; peakAt: string } | null {
  const until = nowMs + hours * 3_600_000;
  let peak: { peakFt: number; peakAt: string } | null = null;
  for (const stage of stages) {
    const at = Date.parse(stage.dateTime);
    if (!Number.isFinite(at) || at < nowMs || at > until) continue;
    if (peak === null || stage.valueFt > peak.peakFt) peak = { peakFt: stage.valueFt, peakAt: stage.dateTime };
  }
  return peak;
}
