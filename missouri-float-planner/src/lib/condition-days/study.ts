import { classifyReading, type ConditionThresholds } from '@shared/condition-ladder';
import { CONDITION_SYSTEM, type ConditionCode } from '@shared/condition-system';
import catalog from '@/data/condition-days/stations.json';

export const REPORT_TITLE = 'River Conditions by Month';
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
  const weekends = MONTHS.map(() => ({ starts: 0, held: 0, dipped: 0, rose: 0 }));
  const annual = counts();
  const measuredYears: number[] = [];
  let fullYears = 0;
  const years = archive.map((days, index) => {
    const year = FIRST_YEAR + index;
    const recorded = counts();
    const seen = new Set<number>();
    for (const [i, value] of days.entries()) {
      if (value == null) continue;
      const level = grade(value, thresholds);
      if (level === 'unknown') continue;
      const date = new Date(Date.UTC(year, 0, i + 1));
      const month = date.getUTCMonth();
      if (date.getUTCDay() === 5 && isFloatDay(level)) {
        // A Friday owns its weekend even across month and year boundaries.
        const nextDay = (offset: number) => i + offset < days.length
          ? days[i + offset] : archive[index + 1]?.[i + offset - days.length];
        const saturday = nextDay(1);
        const sunday = nextDay(2);
        if (saturday != null && sunday != null) {
          const rest = [grade(saturday, thresholds), grade(sunday, thresholds)];
          if (!rest.includes('unknown')) {
            const weekend = weekends[month];
            weekend.starts++;
            const changed = rest.find(l => !isFloatDay(l));
            if (!changed) weekend.held++;
            else if (changed === 'too_low' || changed === 'low') weekend.dipped++;
            else weekend.rose++;
          }
        }
      }
      months[month].levels[level]++;
      months[month].total++;
      recorded[level]++;
      seen.add(month);
    }
    for (const month of seen) months[month].years++;
    const total = Object.values(recorded).reduce((a, b) => a + b, 0);
    if (total) measuredYears.push(year);
    if (total && total >= days.length * 0.9) {
      fullYears++;
      for (const level of LEVELS) annual[level] += 365 * recorded[level] / total;
    }
    const cfs = nearDate(archive, year, day.slice(5));
    return { year, cfs, level: cfs == null ? 'unknown' as const : grade(cfs, thresholds) };
  });
  if (fullYears) for (const level of LEVELS) annual[level] /= fullYears;
  return { months, annual, fullYears, years, weekends, measuredYears };
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

export interface Season { days: Record<string, number>; through: string; year: number }

// Use one historical cohort for the entire curve. A missing date, including
// Feb 29 in a non-leap year, disqualifies that year from the comparison.
export function seasonHistory(archive: Archive, thresholds: ConditionThresholds, season: Season) {
  const dates = Object.keys(season.days).sort();
  const months = MONTHS.slice(0, dates.length ? Number(season.through.slice(5, 7)) : 0).map((_, i) => {
    const last = new Date(Date.UTC(season.year, i + 1, 0)).toISOString().slice(0, 10);
    return { end: last < season.through ? last : season.through, recorded: 0, floatDays: 0, total: 0, lastFloat: null as string | null, typical: null as number | null };
  });
  for (const day of dates) {
    const month = months[Number(day.slice(5, 7)) - 1];
    month.recorded++;
    if (isFloatDay(grade(season.days[day], thresholds))) {
      month.floatDays++;
      month.lastFloat = day;
    }
  }
  months.forEach((m, i) => { m.total = (months[i - 1]?.total ?? 0) + m.floatDays; });
  const cohorts: number[][] = [];
  if (dates.length) archive.forEach((days, y) => {
    const year = FIRST_YEAR + y;
    if (year >= season.year) return;
    const totals = months.map(() => 0);
    for (const day of dates) {
      const month = Number(day.slice(5, 7)) - 1;
      const date = new Date(Date.UTC(year, month, Number(day.slice(8))));
      if (date.getUTCMonth() !== month) return;
      const cfs = days[(date.getTime() - Date.UTC(year, 0, 1)) / 86400000];
      if (cfs == null) return;
      if (isFloatDay(grade(cfs, thresholds))) totals[month]++;
    }
    for (let i = 1; i < totals.length; i++) totals[i] += totals[i - 1];
    cohorts.push(totals);
  });
  // A single year's total is not a typical season.
  if (cohorts.length >= 3) months.forEach((m, i) => { m.typical = median(cohorts.map(y => y[i])); });
  return { months, years: cohorts.length };
}
export type SeasonHistory = ReturnType<typeof seasonHistory>;
