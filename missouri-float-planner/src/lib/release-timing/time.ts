// src/lib/release-timing/time.ts
// Times on the findings page are Central, written the way the dam pages write them.

const ZONE = 'America/Chicago';
const clock = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, hour: 'numeric', minute: '2-digit' });
const weekday = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, weekday: 'short', month: 'short', day: 'numeric' });
const short = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, month: 'short', day: 'numeric' });
const dated = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, month: 'short', day: 'numeric', year: 'numeric' });
const long = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, month: 'long', day: 'numeric', year: 'numeric' });

const FIVE_MINUTES = 300_000;

/** "4:15 AM" */
export const clockTime = (ms: number): string => clock.format(ms);
/** To the nearest five minutes: a scaled or interpolated time is not known to the minute. */
export const roundedClockTime = (ms: number): string => clock.format(Math.round(ms / FIVE_MINUTES) * FIVE_MINUTES);
/** "Sat, Oct 24" */
export const weekdayDate = (ms: number): string => weekday.format(ms);
/** "Oct 24" */
export const shortDate = (ms: number): string => short.format(ms);
/** "Oct 24, 2026" */
export const datedDay = (ms: number): string => dated.format(ms);
/** "October 24, 2026" */
export const longDate = (ms: number): string => long.format(ms);

/** "3:20 to 4:30 AM", or "11:40 PM to 1:10 AM" across noon or midnight. */
export function timeSpan(fromMs: number, toMs: number, format: (ms: number) => string = clockTime): string {
  const from = format(fromMs);
  const to = format(toMs);
  return from.slice(-2) === to.slice(-2) ? `${from.slice(0, -3)} to ${to}` : `${from} to ${to}`;
}

/** "40 minutes", "1 hour 5 minutes", "2 hours". */
export function durationText(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  const h = hours === 0 ? '' : `${hours} hour${hours === 1 ? '' : 's'}`;
  const m = rest === 0 && hours > 0 ? '' : `${rest} minute${rest === 1 ? '' : 's'}`;
  return [h, m].filter(Boolean).join(' ');
}
