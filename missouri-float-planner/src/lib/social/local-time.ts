// src/lib/social/local-time.ts
// Timezone-parameterized wall-clock helpers backed by Intl (no hand-rolled
// DST math). Zones are IANA names carried on rivers.timezone and
// social_config.timezone; America/Chicago remains the default for legacy
// callers via central-time.ts.

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

export function getLocalParts(timeZone: string, date: Date = new Date()) {
  const parts = getFormatter(timeZone).formatToParts(date);
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

/** Current day-of-week in the given zone. 0 = Sunday. */
export function getLocalDay(timeZone: string, date: Date = new Date()): number {
  return DAY_INDEX[getLocalParts(timeZone, date).weekday] ?? 0;
}

/** Current minute-of-day in the given zone (0..1439). */
export function getLocalMinutes(timeZone: string, date: Date = new Date()): number {
  const { hour, minute } = getLocalParts(timeZone, date);
  return hour * 60 + minute;
}

/** YYYY-MM-DD of the current date in the given zone. */
export function getLocalDateKey(timeZone: string, date: Date = new Date()): string {
  const { year, month, day } = getLocalParts(timeZone, date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** "Tuesday, July 1, 2026"-style strings for prompts, in the given zone. */
export function getLocalDateStrings(timeZone: string, date: Date = new Date()): {
  dayOfWeek: string;
  dateStr: string;
} {
  return {
    dayOfWeek: date.toLocaleDateString('en-US', { weekday: 'long', timeZone }),
    dateStr: date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone }),
  };
}
