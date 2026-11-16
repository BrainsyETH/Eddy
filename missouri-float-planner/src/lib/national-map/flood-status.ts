// src/lib/national-map/flood-status.ts
// The THIRD vocabulary on the River Map: official NWS flood categories.
//
// ── Why this is its own file ────────────────────────────────────────────────
// shared/condition-system.ts answers "should you float this river" (curated
// only). shared/flow-band.ts answers "how does today compare to this gauge's
// own record". Neither answers "has the National Weather Service's flood
// threshold been reached" — and Eddy must not answer it either. NOAA computes
// the category at each forecast point against thresholds it publishes; this
// file QUOTES that category. It never compares a USGS stage to an NWS number:
// the two systems can sit on different datums (import-nwps-gauges.ts measured
// ~6% of published thresholds as elevations or kcfs), and a numeric join that
// is right 94% of the time is a wrong flood map.
//
// ── Distinctions that must survive every layer ──────────────────────────────
//   * Action is NOT flooding. It is a separate category and never counts as a
//     flood gauge in any total.
//   * not_defined is "NWS has no flood threshold here", NOT "no flooding".
//   * obs_not_current / out_of_service are "we do not know right now".
//   * Observed and forecast are separate fields with separate times. The first
//     release maps OBSERVED status only; forecast is carried for the detail
//     panel and a later Forecast option.
//
// Source: NOAA riv_gauges MapServer, layer 0 (Observed River Stages) and layer
// 15 (Full Forecast Period Stages). Status strings measured 2026-11-02.
//
// Pure, no imports beyond types.

/**
 * Wire codes. Small integers because ~13,000 of them ride in every recorded
 * frame. NEVER renumber — recorded history decodes with this table.
 */
export const FLOOD_CODE = {
  unknown: 0,
  no_flooding: 1,
  action: 2,
  minor: 3,
  moderate: 4,
  major: 5,
  not_defined: 6,
  not_current: 7,
  out_of_service: 8,
  low_threshold: 9,
} as const;

export type FloodStatus = keyof typeof FLOOD_CODE;
export type FloodCode = (typeof FLOOD_CODE)[FloodStatus];

const BY_CODE = new Map<number, FloodStatus>(
  (Object.entries(FLOOD_CODE) as Array<[FloodStatus, number]>).map(([k, v]) => [v, k]),
);

/**
 * NOAA status string → our status. The observed layer says `obs_not_current`
 * and the forecast layer `fcst_not_current`; both mean the same thing for a
 * map. Anything unrecognized is `unknown`, never `no_flooding`.
 */
export function parseNoaaStatus(raw: unknown): FloodStatus {
  if (typeof raw !== 'string') return 'unknown';
  const s = raw.trim().toLowerCase();
  switch (s) {
    case 'no_flooding':
    case 'action':
    case 'minor':
    case 'moderate':
    case 'major':
    case 'not_defined':
    case 'out_of_service':
    case 'low_threshold':
      return s;
    case 'obs_not_current':
    case 'fcst_not_current':
      return 'not_current';
    default:
      return 'unknown';
  }
}

export function floodStatusFromCode(code: unknown): FloodStatus {
  return typeof code === 'number' ? BY_CODE.get(code) ?? 'unknown' : 'unknown';
}

/** Minor, moderate or major — the only statuses that are flooding. */
export function isFlooding(status: FloodStatus): boolean {
  return status === 'minor' || status === 'moderate' || status === 'major';
}

/** Severity rank for ordering and salience. Only meaningful among comparable statuses. */
export function floodSeverity(status: FloodStatus): number {
  switch (status) {
    case 'major':
      return 4;
    case 'moderate':
      return 3;
    case 'minor':
      return 2;
    case 'action':
      return 1;
    default:
      return 0;
  }
}

export interface FloodStatusDef {
  label: string;
  /** Detail-panel sentence. Never implies inundation extent. */
  sentence: string;
}

export const FLOOD_STATUS_TEXT: Record<FloodStatus, FloodStatusDef> = {
  major: { label: 'Major flooding', sentence: 'At or above the NWS major flood stage' },
  moderate: { label: 'Moderate flooding', sentence: 'At or above the NWS moderate flood stage' },
  minor: { label: 'Minor flooding', sentence: 'At or above the NWS flood stage' },
  action: { label: 'Action stage', sentence: 'At or above the NWS action stage — not flooding' },
  no_flooding: { label: 'Below flood stage', sentence: 'Below the NWS flood stage' },
  low_threshold: { label: 'Below low threshold', sentence: 'Below the NWS low-water threshold' },
  not_defined: { label: 'No flood threshold', sentence: 'NWS has not defined a flood stage here' },
  not_current: { label: 'Not current', sentence: 'The NWS observation here is not current' },
  out_of_service: { label: 'Out of service', sentence: 'NWS lists this gauge as out of service' },
  unknown: { label: 'Unknown', sentence: 'No NWS flood status is available' },
};

/**
 * NOAA's `obstime` / `fcsttime` / `fcstissunc` strings: "YYYY-MM-DD HH:MM:SS",
 * in UTC (measured: Florida's 02:54 observations arrived at 04:40Z; read as
 * Eastern they would be five hours in the future). Returns epoch seconds.
 */
export function parseNoaaTime(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(raw.trim());
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], m[6] ? +m[6] : 0);
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
}

/** A published number, or null for '', '-999', and anything that is not finite. */
export function parseNoaaNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n) || n <= -900) return null;
  return n;
}
