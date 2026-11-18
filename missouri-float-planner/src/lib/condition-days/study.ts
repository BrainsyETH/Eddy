import { classifyReading, type ConditionThresholds } from '@shared/condition-ladder';
import { CONDITION_SYSTEM, type ConditionCode } from '@shared/condition-system';
import catalog from '@/data/condition-days/stations.json';

export const REPORT_PATH = '/blog/research/river-conditions';
export const stations = catalog;
export type Station = (typeof stations)[number];
export const DEFAULT_SITE = '07065495';
export const FIRST_YEAR = 2006;
export const LAST_YEAR = 2025;
export const SNAPSHOT_THROUGH = '2026-11-16';
export const LEVELS = ['too_low', 'low', 'good', 'flowing', 'high', 'dangerous'] as const;
export type Level = (typeof LEVELS)[number];
export const MONTHS = Array.from({ length: 12 }, (_, i) =>
  new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(Date.UTC(2000, i, 1)));
export type Archive = (number | null)[][];
export type Counts = Record<Level, number>;
export const grade = (cfs: number, thresholds: ConditionThresholds) =>
  classifyReading(null, { ...thresholds, thresholdUnit: 'cfs' }, cfs, { strictUnit: true });
export const isFloatDay = (level: ConditionCode) => level === 'good' || level === 'flowing';
export const levelName = (level: Level) => CONDITION_SYSTEM[level].label;
export function counts(): Counts {
  return { too_low: 0, low: 0, good: 0, flowing: 0, high: 0, dangerous: 0 };
}
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
export function dayLabel(key: string, withYear = false) {
  return new Date(key + 'T12:00:00Z').toLocaleDateString('en-US', {
    timeZone: 'UTC', month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}),
  });
}
export function offsetDay(key: string, offset: number) {
  return new Date(Date.parse(key + 'T00:00:00Z') + offset * 86400000).toISOString().slice(0, 10);
}
function nearDate(archive: Archive, year: number, monthDay: string) {
  const center = year + '-' + monthDay;
  // February 29 has no counterpart in a non-leap year.
  if (offsetDay(center, 0) !== center) return null;
  const window: number[] = [];
  for (let delta = -3; delta <= 3; delta++) {
    const key = offsetDay(center, delta);
    const y = Number(key.slice(0, 4));
    const index = (Date.parse(key) - Date.UTC(y, 0, 1)) / 86400000;
    const value = archive[y - FIRST_YEAR]?.[index];
    if (value != null) window.push(value);
  }
  return window.length >= 4 ? median(window) : null;
}
export function summarize(archive: Archive, thresholds: ConditionThresholds, day: string) {
  const months = MONTHS.map(() => ({ levels: counts(), total: 0, years: 0 }));
  const annual = counts();
  let fullYears = 0;
  const years = archive.map((days, index) => {
    const year = FIRST_YEAR + index;
    const recorded = counts();
    const seen = new Set<number>();
    for (const [i, value] of days.entries()) {
      if (value == null) continue;
      const level = grade(value, thresholds);
      if (level === 'unknown') continue;
      const month = new Date(Date.UTC(year, 0, i + 1)).getUTCMonth();
      months[month].levels[level]++;
      months[month].total++;
      recorded[level]++;
      seen.add(month);
    }
    for (const month of seen) months[month].years++;
    const total = Object.values(recorded).reduce((a, b) => a + b, 0);
    if (total >= days.length * 0.9) {
      fullYears++;
      for (const level of LEVELS) annual[level] += 365 * recorded[level] / total;
    }
    const cfs = nearDate(archive, year, day.slice(5));
    return { year, cfs, level: cfs == null ? 'unknown' as const : grade(cfs, thresholds) };
  });
  if (fullYears) for (const level of LEVELS) annual[level] /= fullYears;
  return { months, annual, fullYears, years };
}
export type Summary = ReturnType<typeof summarize>;

export function pairedDays(a: Archive, b: Archive, first: ConditionThresholds, other: ConditionThresholds) {
  const months = MONTHS.map(() => ({ low: 0, floatable: 0 }));
  a.forEach((days, y) => days.forEach((value, i) => {
    const second = b[y]?.[i];
    if (value == null || second == null || grade(value, first) !== 'too_low') return;
    const month = months[new Date(Date.UTC(FIRST_YEAR + y, 0, i + 1)).getUTCMonth()];
    month.low++;
    if (isFloatDay(grade(second, other))) month.floatable++;
  }));
  return months;
}

export function closingStreak(days: Record<string, number>, through: string, thresholds: ConditionThresholds) {
  if (days[through] == null) return null;
  const level = grade(days[through], thresholds);
  let start = through;
  while (true) {
    const prior = offsetDay(start, -1);
    if (days[prior] == null || grade(days[prior], thresholds) !== level) break;
    start = prior;
  }
  return { start, level, length: Math.round((Date.parse(through) - Date.parse(start)) / 86400000) + 1 };
}
