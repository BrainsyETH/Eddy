import type { HistoryWindowRequest } from '@/hooks/useGaugeHistory';

export type HistoryRange =
  { kind: 'days'; days: number } | { kind: 'custom'; from: string; to: string };

function calendarDay(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) &&
    new Date(ms).toISOString().slice(0, 10) === value
    ? ms
    : null;
}

export function historyRangeDays(range: HistoryRange): number {
  return range.kind === 'days'
    ? range.days
    : Math.round((Date.parse(range.to) - Date.parse(range.from)) / 86_400_000) +
        1;
}

export function validateHistoryDates(
  from: string,
  to: string,
  maxDays: number,
  now = new Date(),
): string | null {
  const start = calendarDay(from);
  const end = calendarDay(to);
  if (start === null || end === null)
    return 'Choose a valid start and end date.';
  if (end < start) return 'Choose an end date on or after the start date.';
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  if (end > today) return 'Choose today or an earlier date.';
  if ((end - start) / 86_400_000 + 1 > maxDays)
    return `Choose a range of ${maxDays} days or fewer.`;
  return null;
}

export function historyRequest(range: HistoryRange): {
  days: number;
  window: HistoryWindowRequest | null;
} {
  if (range.kind === 'days') return { days: range.days, window: null };
  // Date fields represent the reader's calendar days, including DST changes.
  return {
    days: 30,
    window: {
      from: new Date(`${range.from}T00:00:00`).toISOString(),
      to: new Date(`${range.to}T23:59:59.999`).toISOString(),
      resolution: 'auto',
    },
  };
}
