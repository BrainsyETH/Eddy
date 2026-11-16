// Keep the shared wire contract independent of either app's dependencies.
export interface RainBoundary {
  type: 'Feature';
  properties: Record<string, unknown> | null;
  geometry: { type: 'MultiPolygon'; coordinates: number[][][][] };
}

export const RAIN_PREFERENCE_KEY = 'eddy:chart:rain:v1';
export const RAIN_HOUR = 3_600_000;
export const RAIN_MIN_COVERAGE = 0.95;
export interface RainInterval {
  start: string;
  end: string;
  inches: number | null;
  coverage: number;
  /** Only the current six-hour bin may end early. */
  partial?: boolean;
}
export interface RainSummary {
  version: 1;
  siteId: string;
  updatedAt: string;
  status: 'ready' | 'partial' | 'unavailable';
  basin: { name: string; areaSqMi: number; gauge: [number, number] };
  hourly: RainInterval[];
  totals: { hours: 24 | 72; start: string; end: string; inches: number | null; coverage: number }[];
}
export interface RainMapContext {
  river: { name: string; lines: number[][][] };
  places: { name: string; coordinates: [number, number] }[];
}
export interface RainDetail extends RainSummary {
  context?: RainMapContext;
  boundary: RainBoundary;
  shading: {
    start: string; end: string;
    // Native EPSG:3857 cells. Negative/nodata values are null, never dry.
    xmin: number; ymax: number; dx: number; dy: number;
    width: number; height: number; inches: (number | null)[];
  } | null;
}

export function rainAmount(inches: number | null | undefined): string {
  return inches == null || !Number.isFinite(inches) || inches < 0 ? 'Unavailable'
    : inches > 0 && inches < 0.01 ? '<0.01 in' : `${inches.toFixed(2)} in`;
}
export function rainRange(days: number, custom = false): boolean {
  return !custom && (days === 1 || days === 7);
}
export function usableRain(row: RainInterval): boolean {
  return row.inches != null && Number.isFinite(row.inches) && row.inches >= 0
    && row.coverage >= RAIN_MIN_COVERAGE && row.coverage <= 1;
}

/** Aligned, nonoverlapping bins. A missing hour invalidates the whole bin.
 * Never distribute a rolling 24/72-hour total across the timeline. */
export function rainBars(hourly: readonly RainInterval[], from: number, to: number, hours: 1 | 6): RainInterval[] {
  if (!Number.isFinite(from + to) || to <= from || to - from > 8 * 24 * RAIN_HOUR) return [];
  const rows = new Map<number, RainInterval>();
  for (const row of hourly) {
    const start = Date.parse(row.start), end = Date.parse(row.end);
    if (end - start !== RAIN_HOUR || start % RAIN_HOUR !== 0) continue;
    // Ambiguous revisions are missing; the publisher must resolve versions.
    rows.set(start, rows.has(start) ? { ...row, inches: null, coverage: 0 } : row);
  }
  const step = hours * RAIN_HOUR;
  const bars: RainInterval[] = [];
  for (let start = Math.floor(from / step) * step; start < to; start += step) {
    const end = Math.min(start + step, Math.floor(to / RAIN_HOUR) * RAIN_HOUR);
    if (end <= start) continue;
    const count = (end - start) / RAIN_HOUR;
    const members = Array.from({ length: count }, (_, i) => rows.get(start + i * RAIN_HOUR));
    const complete = members.every((row): row is RainInterval => !!row && usableRain(row));
    bars.push({ start: new Date(start).toISOString(), end: new Date(end).toISOString(), partial: end < start + step,
      inches: complete ? members.reduce((sum, row) => sum + row!.inches!, 0) : null,
      coverage: Math.min(...members.map(row => row?.coverage ?? 0)) });
  }
  return bars;
}
/** Accumulations end at the selected instant: at 14:00 show 13:00–14:00. */
export function rainAt(rows: readonly RainInterval[], time: number): RainInterval | null {
  return rows.find(row => Date.parse(row.start) < time && time <= Date.parse(row.end)) ?? null;
}
export function rainReadout(row: RainInterval | null, timeZone?: string): string {
  if (!row || !usableRain(row)) return 'Rain data unavailable';
  const hours = Math.round((Date.parse(row.end) - Date.parse(row.start)) / RAIN_HOUR);
  const ending = timeZone ? ` ending ${new Intl.DateTimeFormat('en-US', { hour: 'numeric', timeZone }).format(new Date(row.end))}` : ' total';
  return `Rain upstream: ${rainAmount(row.inches)} · ${hours} ${hours === 1 ? 'hour' : 'hours'}${row.partial ? ' so far' : ending}`;
}
export function rainMaximum(rows: readonly RainInterval[], hours: 1 | 6 = 6): number {
  // A drizzle must not fill the track. These are display scales, not risk thresholds.
  const floor = hours === 1 ? 0.25 : 1;
  const maximum = Math.max(floor, ...rows.filter(usableRain).map(row => row.inches!));
  return Math.ceil(maximum / floor) * floor;
}
/** Explain a short archive separately from interior outages. Alignment matters:
 * the leftmost six-hour bar may need hours just before the visible window. */
export function rainHistoryStart(rows: readonly RainInterval[], from: number, to: number, hours: 1 | 6): string | null {
  const first = Math.min(...rows.filter(row => Date.parse(row.end) - Date.parse(row.start) === RAIN_HOUR)
    .map(row => Date.parse(row.start)).filter(Number.isFinite));
  return first > Math.floor(from / (hours * RAIN_HOUR)) * hours * RAIN_HOUR && first < to
    ? new Date(first).toISOString() : null;
}
export function rainIsFresh(summary: RainSummary, now = Date.now()): boolean {
  const age = now - Date.parse(summary.updatedAt);
  return Number.isFinite(age) && age >= -10 * 60_000 && age <= 3 * RAIN_HOUR;
}

/** Reject another gauge, malformed numbers and old responses at both clients. */
export function normalizeRain(value: unknown, siteId: string, now = Date.now()): RainSummary | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as RainSummary;
  if (data.version !== 1 || data.siteId !== siteId || !['ready', 'partial', 'unavailable'].includes(data.status)
    || !data.basin || typeof data.basin.name !== 'string' || data.basin.name.length > 160
    || !Number.isFinite(data.basin.areaSqMi) || data.basin.areaSqMi <= 0
    || !Array.isArray(data.basin.gauge) || data.basin.gauge.length !== 2
    || !data.basin.gauge.every(Number.isFinite) || Math.abs(data.basin.gauge[0]) > 180 || Math.abs(data.basin.gauge[1]) > 85
    || !Array.isArray(data.hourly) || data.hourly.length > 192 || !Array.isArray(data.totals) || data.totals.length > 2) return null;
  const valid = (row: RainInterval) => row && Number.isFinite(Date.parse(row.start)) && Number.isFinite(Date.parse(row.end))
    && Date.parse(row.end) > Date.parse(row.start) && Date.parse(row.end) <= now + 10 * 60_000
    && Number.isFinite(row.coverage) && row.coverage >= 0 && row.coverage <= 1
    && (row.inches === null || typeof row.inches === 'number' && Number.isFinite(row.inches) && row.inches >= 0 && row.inches <= 100);
  if (!data.hourly.every(row => valid(row) && Date.parse(row.end) - Date.parse(row.start) === RAIN_HOUR)
    || !data.totals.every(row => valid(row) && [24, 72].includes(row.hours) && Date.parse(row.end) - Date.parse(row.start) === row.hours * RAIN_HOUR)) return null;
  const safe = (row: RainInterval) => ({ ...row, inches: usableRain(row) ? row.inches : null });
  const fresh = rainIsFresh(data, now);
  return { version: 1, siteId, updatedAt: data.updatedAt, basin: data.basin,
    status: fresh ? data.status : 'unavailable',
    // An old archive is still history, but it must never appear current.
    hourly: data.hourly.map(safe), totals: data.totals.map(row => ({ ...safe(row), hours: row.hours, inches: fresh ? safe(row).inches : null })) };
}
