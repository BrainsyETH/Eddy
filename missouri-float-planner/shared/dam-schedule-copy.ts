// shared/dam-schedule-copy.ts
//
// How a generation schedule is put into words. Shared between the web dam page
// and the eddy-ios dam screen, because getting any of it wrong is a safety
// problem rather than a cosmetic one.
//
// ── Why this is shared and not reimplemented per platform ───────────────────
// SWPA posts in "hour ending" terms: hour 14 is the release running 1:00pm to
// 2:00pm. src/components/dam/GenerationSchedule.tsx says it plainly — an
// off-by-one here "puts an angler in the water an hour early". Two independent
// implementations of that arithmetic is two chances to make that mistake, and
// only one of them would be caught by this repo's tests. The same reasoning
// that put the condition ladder in shared/ applies with more force here.
//
// Pure TypeScript, no imports — the same constraint condition-system.ts and
// flow-band.ts are under, so Metro, tsx and Next can all consume it.

/**
 * "hour ending 14" -> "1 PM": the hour the water actually starts moving.
 *
 * Kept in SWPA's own terms rather than silently renormalised, so a reader
 * comparing Eddy against the posted schedule sees the same numbers.
 */
export function hourEndingLabel(hourEnding: number): string {
  const startHour = (hourEnding - 1) % 24;
  const suffix = startHour < 12 ? 'AM' : 'PM';
  const display = startHour % 12 === 0 ? 12 : startHour % 12;
  return `${display} ${suffix}`;
}

/** A window given as hour-ending bounds -> "midnight – 6 AM". */
export function windowLabel(from: number, to: number): string {
  const start = hourEndingLabel(from);
  const end = hourEndingLabel(to + 1);
  return `${start === '12 AM' ? 'midnight' : start} – ${end === '12 AM' ? 'midnight' : end}`;
}

/**
 * The one sentence a tailwater angler is actually looking for.
 *
 * Rests only on the on/off pattern, which measured EXACT against CWMS turbine
 * flow — not on the cfs estimate, which is ~±10% at steady state and worse on a
 * ramp hour. An empty list means the units run all day, and saying so plainly
 * is better than printing nothing and letting it read as "no data".
 */
export function idleWindowSentence(idle: Array<{ from: number; to: number }>): string {
  if (idle.length === 0) return 'Generating every hour — no break in the schedule.';
  return `Water off: ${idle.map((w) => windowLabel(w.from, w.to)).join(', ')}`;
}

/**
 * A schedule's calendar day, formatted without letting the viewer's timezone
 * shift it. SWPA schedules are Central-time days; parsing "2026-07-27" as an
 * instant and formatting it locally would render it as the 26th west of Central.
 */
export function scheduleDayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * SWPA's timezone, and the only one a schedule ever means.
 *
 * `hours[i]` is Central, `scheduleDate` is a Central calendar day, and the
 * "hour ending" convention is Central. Every clock question below is asked in
 * this zone and never in the viewer's — a phone in Denver reading a Table Rock
 * schedule is asking what the water is doing at the dam, not at the phone.
 */
const CENTRAL_TIME_ZONE = 'America/Chicago';

/**
 * The wall clock at the dam right now, as `{ dayKey, hoursElapsed }`.
 *
 * `hoursElapsed` is a FRACTION of the day (13.5 = half past one in the
 * afternoon) rather than an integer hour, because the thing it positions is a
 * marker sliding across 24 bars, and snapping it to the hour would put it on a
 * boundary for 59 minutes out of every 60.
 */
function centralClock(now: number): { dayKey: string; hoursElapsed: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CENTRAL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(now));

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return {
    dayKey: `${get('year')}-${get('month')}-${get('day')}`,
    hoursElapsed: Number(get('hour')) + Number(get('minute')) / 60,
  };
}

/** Today's calendar date at the dam, as the `YYYY-MM-DD` a schedule is keyed by. */
export function centralDayKey(now = Date.now()): string {
  return centralClock(now).dayKey;
}

/**
 * How far through `scheduleDate` the dam's clock is, or NULL when that date is
 * not today in Central time.
 *
 * Null is the important half. A three-day schedule renders three identical
 * rows, and a "now" marker drawn on tomorrow's would be a claim about a river
 * at a time that has not happened. Only one row can ever carry it.
 */
export function scheduleHoursElapsed(
  scheduleDate: string,
  now = Date.now()
): number | null {
  const clock = centralClock(now);
  return clock.dayKey === scheduleDate ? clock.hoursElapsed : null;
}

/**
 * Which SWPA hour the dam is in right now, in their own 1-24 "hour ending"
 * terms, so it can be matched against `ScheduledHour.hourEnding` directly.
 *
 * The +1 is the whole convention: at 13:30 Central the water running is the
 * release SWPA posted as hour ending 14. Getting this backwards puts somebody
 * in the water an hour early, which is why it is computed once, here, and not
 * at each call site.
 */
export function hourEndingNow(hoursElapsed: number): number {
  return Math.floor(hoursElapsed) + 1;
}

/**
 * How long ago an ISO timestamp was, phrased for a person.
 *
 * Coarse on purpose past a day: "31 hours ago" reads as precision the number
 * does not deserve. Mirrors readingAge() in eddy-ios/src/lib/readingCopy.ts so
 * the app has one voice for freshness.
 */
export function relativeAge(iso: string | null | undefined, now = Date.now()): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;

  const minutes = (now - ms) / 60_000;
  // Clock skew between us and a CDN edge can put a timestamp slightly ahead.
  // "in 30 seconds" would be nonsense; treat anything not yet past as current.
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${Math.round(minutes)} minutes ago`;
  const hours = minutes / 60;
  if (hours < 2) return 'an hour ago';
  if (hours < 24) return `${Math.round(hours)} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/**
 * How stale a scrape has to be before it is called out rather than just stated.
 *
 * SWPA's own edge caches for 600s and Eddy revalidates at 1800s, so anything
 * inside 90 minutes is the system working normally. Past that, something is
 * wrong — a failing fetch, a format change, a frozen cache — and a schedule
 * someone may wade against should say so rather than presenting a quiet
 * timestamp nobody reads.
 */
export const SCHEDULE_STALE_AFTER_MINUTES = 90;

export function scheduleIsStale(
  iso: string | null | undefined,
  now = Date.now()
): boolean {
  if (!iso) return false; // Absent is not stale — it renders nothing at all.
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return false;
  return (now - ms) / 60_000 > SCHEDULE_STALE_AFTER_MINUTES;
}

/**
 * The retrieval line itself.
 *
 * The subject is EDDY, deliberately. SWPA publishes no timestamp of any kind
 * (verified against the live page and its headers), so "last updated" would
 * attribute a freshness claim to a source that never made one. Null in, null
 * out — an unknown retrieval renders nothing.
 */
export function retrievalSentence(
  iso: string | null | undefined,
  now = Date.now()
): string | null {
  const age = relativeAge(iso, now);
  if (!age) return null;
  const base = `Eddy last checked ${age}.`;
  return scheduleIsStale(iso, now) ? `${base} It may have been revised since.` : base;
}
