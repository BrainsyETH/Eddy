// src/lib/ameren/osage.ts
// Ameren Missouri's hydro reporting API — the first NON-FEDERAL source in the
// dam layer. Bagnell Dam (Osage Project, FERC No. 459) publishes nothing to
// CWMS and has no SWPA column; this is where its numbers actually live.
//
// ── How this source was found, because it will 404 someday too ─────────────
// The old public reports lived at apps.ameren.com/HydroElectric/*.aspx and
// now return 503 — the app pool is dead, not the data. The lowercase path
// 301s to ameren.com's hydro pages, whose Angular bundle
// (www.ameren.com/hydroelectric/main.*.js) names this backend. Verified live
// 2026-08-15, unauthenticated, with values that cross-check against the
// site's own SHEF feed and USGS 06926000 downstream.
//
//   GET /api/ameren/Hydroelectric/getHeadWaterTailWaterReportData
//         ?startDate=MM/DD/YYYY&endDate=MM/DD/YYYY&interval=1h|15m&zone=
//     -> [{dateTimeStamp, headWaterLevel, tailWaterLevel, discharge,
//          intakeDO, intakeTDG}]        (numbers as STRINGS)
//   GET /api/ameren/Hydroelectric/getBagnellDamDailyReportData
//         ?startDate=…&endDate=…
//     -> { dischargeData: [...], levelandFlowData: { hstDamHeadLevelAtMidnight,
//          damOutflow, prescribedMinFlow, bagnellDamAnticipatedDischargeToday, … } }
//
// ── Timestamps are America/Chicago WALL CLOCK, and that is measured ────────
// The API's SHEF twin (getDailyShefitGMTReport) stamps the same values in
// GMT: 00:00 local carried the identical discharge as 05:00Z on 2026-08-15.
// Wall-clock times have the two DST defects instants don't, and both are
// handled explicitly in centralWallClockToUtc below rather than by luck.
//
// ── Fail-closed, exactly as the SWPA scraper ───────────────────────────────
// This is an informational endpoint with no version, no contract and Imperva
// in front (it served plain GETs from every egress tested, but that is an
// observation, not a promise). A row that does not parse is dropped; a body
// that is not the expected shape returns null; nothing here ever guesses.
//
// TRUMAN RIDES ALONG: the daily report's levelandFlowData carries the
// observed pool level and outflow of Harry S. Truman Dam upstream — the dam
// the Kansas City district publishes NOTHING for. Ameren watches it because
// its releases feed their lake; Eddy reads it because it is the only
// observed Truman data anywhere.

const AMEREN_BASE = 'https://www.ameren.com/api/ameren/Hydroelectric';

/** Per-request ceiling, same budget discipline as cda.ts. */
const REQUEST_TIMEOUT_MS = 8_000;

/** The hourly report updates hourly; match the CWMS observation cadence. */
const REVALIDATE_SECONDS = 900;

/** Identify ourselves — the polite default for someone else's free endpoint. */
const REQUEST_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'EddyGuide/1.0 (+https://eddy.guide)',
} as const;

const CENTRAL_TIME_ZONE = 'America/Chicago';
const HOUR_MS = 3_600_000;

/** One observed reading at Bagnell, converted to an honest instant. */
export interface OsageReading {
  /** Epoch milliseconds UTC. */
  timestamp: number;
  headwaterFt: number;
  tailwaterFt: number;
  dischargeCfs: number;
}

/** The Truman block from the daily report, converted the same way. */
export interface TrumanDailyLevels {
  /** Epoch milliseconds UTC of the report's own stamp — about a day behind. */
  timestamp: number;
  poolElevationFt: number;
  outflowCfs: number;
}

/**
 * A Central wall-clock stamp ('2026-08-14T23:30:00') as a UTC instant.
 *
 * Tried against both offsets Central can carry and accepted only when the
 * candidate formats back to the input:
 *
 * - SPRING-FORWARD GAP (02:00-03:00 never happens): neither candidate
 *   round-trips, so the answer is null and the row is dropped — a source
 *   stamping inside a nonexistent hour is broken input, not a puzzle.
 * - FALL-BACK REPEAT (01:00-02:00 happens twice): both candidates round-trip,
 *   and the EARLIER instant wins. That reads the value as older than it might
 *   be, which understates freshness — the same direction retrievedAtFrom in
 *   swpa.ts errs, and the safe one for anything a staleness banner hangs off.
 */
export function centralWallClockToUtc(naive: string): number | null {
  const m = naive.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, s);

  for (const offsetHours of [5, 6]) {
    const candidate = asUtc + offsetHours * HOUR_MS;
    if (roundTrips(candidate, y, mo, d, h, mi)) return candidate;
  }
  return null;
}

function roundTrips(ms: number, y: number, mo: number, d: number, h: number, mi: number): boolean {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CENTRAL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return get('year') === y && get('month') === mo && get('day') === d && get('hour') === h && get('minute') === mi;
}

/** A report string ("659.31") as a finite non-negative number, or null. */
function reportNumber(raw: unknown): number | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/**
 * The hourly report body as readings. Rows that do not parse are dropped
 * individually; a body that is not an array at all is an empty answer.
 * Sorted ascending so callers can take "latest" without re-checking order.
 */
export function parseOsageRows(doc: unknown): OsageReading[] {
  if (!Array.isArray(doc)) return [];
  const readings: OsageReading[] = [];
  for (const row of doc) {
    if (typeof row !== 'object' || row === null) continue;
    const r = row as Record<string, unknown>;
    if (typeof r.dateTimeStamp !== 'string') continue;
    const timestamp = centralWallClockToUtc(r.dateTimeStamp);
    const headwaterFt = reportNumber(r.headWaterLevel);
    const tailwaterFt = reportNumber(r.tailWaterLevel);
    const dischargeCfs = reportNumber(r.discharge);
    if (timestamp === null || headwaterFt === null || tailwaterFt === null || dischargeCfs === null) {
      continue;
    }
    readings.push({ timestamp, headwaterFt, tailwaterFt, dischargeCfs });
  }
  return readings.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * The Truman half of the daily report. Null unless every needed field parses —
 * a partial Truman block must not become a partial claim about a dam.
 */
export function parseTrumanBlock(doc: unknown): TrumanDailyLevels | null {
  if (typeof doc !== 'object' || doc === null) return null;
  const block = (doc as Record<string, unknown>).levelandFlowData;
  if (typeof block !== 'object' || block === null) return null;
  const b = block as Record<string, unknown>;
  if (typeof b.dateTimeStamp !== 'string') return null;
  const timestamp = centralWallClockToUtc(b.dateTimeStamp);
  const poolElevationFt = reportNumber(b.hstDamHeadLevelAtMidnight);
  const outflowCfs = reportNumber(b.damOutflow);
  if (timestamp === null || poolElevationFt === null || outflowCfs === null) return null;
  return { timestamp, poolElevationFt, outflowCfs };
}

/** MM/DD/YYYY of an instant's calendar day in Central time. */
function centralReportDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: CENTRAL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: REQUEST_HEADERS,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) {
      console.error(`[Ameren] ${url.split('?')[0]}: HTTP ${res.status}`);
      return null;
    }
    return (await res.json()) as unknown;
  } catch (e) {
    console.error(`[Ameren] ${url.split('?')[0]}: fetch failed`, e);
    return null;
  }
}

/**
 * Bagnell's hourly readings for yesterday and today (Central), oldest first.
 *
 * Two days rather than one so the hours just after a Central midnight still
 * have a window behind them for the trend arithmetic, and so an empty "today"
 * in the first minutes of a day is not an empty answer.
 */
export async function fetchOsageReadings(now = new Date()): Promise<OsageReading[] | null> {
  const end = centralReportDate(now);
  const start = centralReportDate(new Date(now.getTime() - 24 * HOUR_MS));
  const url =
    `${AMEREN_BASE}/getHeadWaterTailWaterReportData` +
    `?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}` +
    `&interval=1h&zone=`;
  const doc = await fetchJson(url);
  if (doc === null) return null;
  const readings = parseOsageRows(doc);
  return readings.length > 0 ? readings : null;
}

/** Truman's observed pool and outflow, from the same report Ameren keeps. */
export async function fetchTrumanDaily(now = new Date()): Promise<TrumanDailyLevels | null> {
  const end = centralReportDate(now);
  const start = centralReportDate(new Date(now.getTime() - 24 * HOUR_MS));
  const url =
    `${AMEREN_BASE}/getBagnellDamDailyReportData` +
    `?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}`;
  const doc = await fetchJson(url);
  if (doc === null) return null;
  return parseTrumanBlock(doc);
}
