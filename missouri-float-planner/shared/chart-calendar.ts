const formatterCache = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string, kind: 'date' | 'parts' | 'stamp' | 'stampDate') {
  const key = `${timeZone}:${kind}`;
  let value = formatterCache.get(key);
  if (!value) {
    const options: Intl.DateTimeFormatOptions =
      kind === 'date' || kind === 'parts'
        ? {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            ...(kind === 'parts'
              ? ({
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hourCycle: 'h23',
                } as const)
              : {}),
          }
        : {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            ...(kind === 'stamp'
              ? ({ hour: 'numeric', minute: '2-digit', timeZoneName: 'short' } as const)
              : {}),
          };
    value = new Intl.DateTimeFormat('en-US', { timeZone, ...options });
    if (formatterCache.size >= 128) formatterCache.delete(formatterCache.keys().next().value!);
    formatterCache.set(key, value);
  }
  return value;
}
/** Daily values are calendar dates; instants are formatted in the station zone. */
export function stationDate(time: number, timeZone: string): string {
  const parts = formatter(timeZone, 'date').formatToParts(time);
  const get = (key: string) => parts.find((p) => p.type === key)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
/** Noon avoids ambiguous/nonexistent DST transition hours. No device-local arithmetic. */
export function stationNoon(date: string, timeZone: string): number {
  return stationTime(date, timeZone, '12:00:00');
}
export function stationTime(date: string, timeZone: string, clock = '00:00:00'): number {
  const target = Date.parse(`${date}T${clock}Z`);
  let result = target;
  for (let i = 0; i < 3; i++) {
    const parts = formatter(timeZone, 'parts').formatToParts(result);
    const get = (key: string) => parts.find((p) => p.type === key)!.value;
    const rendered = Date.parse(
      `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}Z`,
    );
    result += target - rendered;
  }
  return result;
}
export function chartStamp(time: string | number, timeZone: string, dateOnly = false): string {
  if (typeof time === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(time)) return time;
  const value = typeof time === 'number' ? time : Date.parse(time);
  if (!Number.isFinite(value)) return 'Unavailable';
  return formatter(timeZone, dateOnly ? 'stampDate' : 'stamp').format(value);
}

export function stationDayWindow(from: string, to: string, timeZone: string) {
  return {
    from: new Date(stationTime(from, timeZone)).toISOString(),
    to: new Date(stationTime(to, timeZone, '23:59:59')).toISOString(),
  };
}
