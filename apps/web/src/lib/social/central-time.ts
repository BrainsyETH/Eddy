// src/lib/social/central-time.ts
// Central Time helpers backed by Intl (no hand-rolled DST math).

const CT_ZONE = 'America/Chicago';

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CT_ZONE,
  hour12: false,
  weekday: 'short',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

function getCtParts(date: Date = new Date()) {
  const parts = partsFormatter.formatToParts(date);
  const byType = new Map(parts.map((p) => [p.type, p.value]));
  return {
    weekday: byType.get('weekday') || '',
    year: Number(byType.get('year')),
    month: Number(byType.get('month')),
    day: Number(byType.get('day')),
    hour: Number(byType.get('hour') === '24' ? '0' : byType.get('hour')),
    minute: Number(byType.get('minute')),
  };
}

const DAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/** Current day-of-week in Central Time. 0 = Sunday. */
export function getCentralDay(date: Date = new Date()): number {
  return DAY_INDEX[getCtParts(date).weekday] ?? 0;
}

/** Current minute-of-day in Central Time (0..1439). */
export function getCentralMinutes(date: Date = new Date()): number {
  const { hour, minute } = getCtParts(date);
  return hour * 60 + minute;
}

/** YYYY-MM-DD of the current Central-Time date. */
export function getCentralDateKey(date: Date = new Date()): string {
  const { year, month, day } = getCtParts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
