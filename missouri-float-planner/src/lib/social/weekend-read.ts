import { conditionChip } from '@shared/condition-system';
import { reportStamp } from '@shared/social-editorial';
import { STALE_READING_HOURS } from '@shared/reading-staleness';
import { formatWeatherChip, weatherChip, type WeatherSummary } from '@/lib/weather/openweather';
import { riverDisplayLong } from './river-display';
import { weekendWeather } from './weekend-weather';
import { getLocalDateKey, getLocalDay, getLocalMinutes } from './local-time';

export const WEEKEND_READ_TIME = '17:00';

/** Same 35-minute catch-up window as other social formats. Preview ignores the
 * clock, not the Thursday day or the explicit off switch. */
export function weekendReadDue(enabled: unknown, now = new Date(), skipTimeCheck = false, zone = 'America/Chicago'): boolean {
  if ((enabled !== 'video' && enabled !== 'image') || getLocalDay(zone, now) !== 4) return false;
  const [hour, minute] = WEEKEND_READ_TIME.split(':').map(Number);
  const minutes = getLocalMinutes(zone, now) - (hour * 60 + minute);
  return skipTimeCheck || (minutes >= 0 && minutes < 35);
}


export interface WeekendReadSource {
  river_slug: string;
  condition_code: string;
  gauge_height_ft: number | null;
  summary_text?: string | null;
  quote_text?: string | null;
  generated_at: string;
  reading_timestamp?: string | null;
  snapshot_id?: string | null;
  weather?: WeatherSummary | null;
}

/** Compact prose stays intact: prefer a complete saved summary, never an
 * arbitrary slice of a full report that could omit a qualification. */
export function weekendReadSummary(row: WeekendReadSource): string | null {
  const summary = row.summary_text?.trim();
  if (summary && summary.length <= 280) return summary;
  return null;
}

/** Prefer useful float options but allow a factual low/high-water comparison.
 * Rotate equally suitable rivers by week, so ties don't always pick Current.
 * Require a reconciled fresh gauge and retained prose; no stale-read revival. */
export function selectWeekendReads<T extends WeekendReadSource>(rows: T[], now = new Date()): T[] {
  const seen = new Set<string>();
  const eligible = rows.filter(row => {
    const age = now.getTime() - Date.parse(row.reading_timestamp ?? '');
    if (seen.has(row.river_slug) || !row.snapshot_id || !Number.isFinite(age) || age < 0 ||
      age > STALE_READING_HOURS * 3_600_000 || row.condition_code === 'unknown' || !weekendReadSummary(row)) return false;
    seen.add(row.river_slug);
    return true;
  }).sort((a, b) => a.river_slug.localeCompare(b.river_slug));
  if (eligible.length < 2) return [];
  const day = Date.parse(`${getLocalDateKey('America/Chicago', now)}T12:00:00Z`);
  const week = Math.floor(day / (7 * 86_400_000));
  const rank = (row: T) => ['flowing', 'good'].includes(row.condition_code) ? 0 : row.condition_code === 'low' ? 1 : 2;
  const ranked = [0, 1, 2].flatMap(priority => {
    const group = eligible.filter(row => rank(row) === priority);
    if (!group.length) return [];
    const offset = week % group.length;
    return [...group.slice(offset), ...group.slice(0, offset)];
  });
  return ranked.slice(0, 3);
}

/** This is explicitly today's Read plus weekend WEATHER, not a prediction of
 * weekend water levels. The same text goes to narration and the caption. */
export function weekendReadText(rows: WeekendReadSource[], now = new Date()): string {
  return rows.map(row => {
    const forecast = weekendWeather(row.weather, now);
    const wx = formatWeatherChip(weatherChip(forecast));
    return `${riverDisplayLong(row.river_slug)} — ${conditionChip(row.condition_code).label} now.\n` +
      `Latest Read: ${weekendReadSummary(row)}\n` +
      (wx ? `Weekend weather: ${wx}.` : 'Weekend weather unavailable.');
  }).join('\n\n');
}

export function weekendReadCaption(rows: WeekendReadSource[], now = new Date()) {
  return [
    'Eddy’s Read — this weekend',
    `Prepared ${reportStamp(now)}. Current water conditions; weekend weather is a forecast.`,
    weekendReadText(rows, now),
    ...rows.map(row => `${riverDisplayLong(row.river_slug)} · Read ${reportStamp(new Date(row.generated_at))} · Gauge ${reportStamp(new Date(row.reading_timestamp!))}`),
    'Check your stretch’s latest conditions before you launch. Plan it on Eddy: https://eddy.guide',
  ].join('\n\n');
}
