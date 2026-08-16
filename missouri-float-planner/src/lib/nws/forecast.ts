// src/lib/nws/forecast.ts
//
// Official NWS forecast hydrographs via the National Water Prediction Service
// (NWPS), keyed by NWS Location ID (LID, stored in gauge_stations.nws_lid).
//
// ── Why not src/lib/usgs/ahps-forecast.ts ──────────────────────────────────
// That module reads water.weather.gov/ahps2/hydrograph_to_xml.php, the LEGACY
// AHPS endpoint. AHPS was retired in 2024 (src/lib/nws/flood-stages.ts already
// says so in its header) and the host no longer completes a TLS connection —
// curl exits 56, not 404. fetchAhpsForecast() catches that and returns [], so
// every caller quietly believes the river simply has no forecast. Building a
// new forecast surface on it would have shipped a feature that renders nothing,
// forever, with no error anywhere.
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
export async function fetchNwsForecast(lid: string): Promise<NwsForecast> {
  try {
    const res = await fetch(`${NWPS_BASE}/${encodeURIComponent(lid)}/stageflow`, {
      signal: AbortSignal.timeout(6_000),
      headers: { Accept: 'application/json' },
      next: { revalidate: 900 },
    });
    if (!res.ok) {
      // 404 is ordinary here: not every LID we hold is an NWPS gauge.
      if (res.status !== 404) console.warn(`[NWPS] ${lid} stageflow: HTTP ${res.status}`);
      return EMPTY;
    }

    const doc = (await res.json()) as { forecast?: StageflowSection };
    const section = doc.forecast;
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
    console.error(`[NWPS] ${lid} stageflow: fetch failed`, e);
    return EMPTY;
  }
}
