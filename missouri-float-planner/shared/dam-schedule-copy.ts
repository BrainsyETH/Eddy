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

/** The calendar day after `dayKey`, both as `YYYY-MM-DD`. */
function nextDayKey(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  // UTC arithmetic on a bare calendar date. Adding 24h to a Central-time
  // instant would land on the same day twice each November and skip one each
  // March; a calendar day has no DST because it has no clock attached.
  const next = new Date(Date.UTC(y, m - 1, d) + 86_400_000);
  return next.toISOString().slice(0, 10);
}

/** A scheduled flip between generating and idle. */
export interface ScheduleChange {
  /** SWPA hour-ending the new state begins at. Render with hourEndingLabel. */
  hourEnding: number;
  /** The Central calendar day it falls on, `YYYY-MM-DD`. */
  scheduleDate: string;
  /** 0 = today at the dam, 1 = tomorrow, 2 = the day after. */
  dayOffset: number;
  /** The state the dam moves INTO. */
  generating: boolean;
}

export interface ScheduleState {
  /** True when SWPA has load scheduled for the hour running right now. */
  generating: boolean;
  /** The next flip, or NULL when the posted schedule never flips again. */
  change: ScheduleChange | null;
}

/**
 * What SWPA has the units doing right now, and when that next changes.
 *
 * ── Scheduled, not observed ────────────────────────────────────────────────
 * This reads the SCHEDULE. `DamSnapshot.generating` reads CWMS turbine flow and
 * is an OBSERVATION. They can legitimately disagree — a unit trips, a schedule
 * is revised after Eddy fetched it — so the two must never be presented as one
 * fact. The card states the observation; this states the plan.
 *
 * ── Fails closed, twice ────────────────────────────────────────────────────
 * Null when today's schedule is not in `schedule` at all, and null when the
 * current hour is missing from it. Both mean "we do not know what the dam is
 * doing", which is not the same as "the dam is idle" — and this feeds a line
 * someone may wade against.
 *
 * Days are only walked while they are CONSECUTIVE. `fetchProjectSchedule` drops
 * a day whose file has not refreshed yet, so `schedule` can hold today and the
 * day after tomorrow with a hole between them. Walking across that hole would
 * report Thursday's 6 AM start as Wednesday's.
 */
export function scheduleStateNow(
  schedule: Array<{ scheduleDate: string; hours: Array<{ hourEnding: number; megawatts: number }> }>,
  now = Date.now()
): ScheduleState | null {
  const today = centralDayKey(now);
  const startIndex = schedule.findIndex((d) => d.scheduleDate === today);
  if (startIndex === -1) return null;

  const elapsed = scheduleHoursElapsed(today, now);
  if (elapsed === null) return null;
  const startHour = hourEndingNow(elapsed);

  const currentHour = schedule[startIndex].hours.find((h) => h.hourEnding === startHour);
  if (!currentHour) return null;
  const generating = currentHour.megawatts > 0;

  let expectedDate = today;
  for (let i = startIndex; i < schedule.length; i += 1) {
    const day = schedule[i];
    if (day.scheduleDate !== expectedDate) break; // A gap — see the note above.
    // Walked by hour NUMBER rather than array order: the first flip has to be
    // the earliest one, and reading it off iteration order would quietly depend
    // on the parser emitting 1..24 sorted.
    const from = i === startIndex ? startHour : 1;
    for (let h = from; h <= 24; h += 1) {
      const hour = day.hours.find((x) => x.hourEnding === h);
      if (!hour) continue;
      if (hour.megawatts > 0 !== generating) {
        return {
          generating,
          change: {
            hourEnding: h,
            scheduleDate: day.scheduleDate,
            // Index offset equals calendar-day offset because the walk stops
            // at the first non-consecutive date.
            dayOffset: i - startIndex,
            generating: !generating,
          },
        };
      }
    }
    expectedDate = nextDayKey(expectedDate);
  }

  return { generating, change: null };
}

/**
 * The one forward-looking line a tailwater angler wants: when the water changes.
 *
 * ── Why a clock time and never a countdown ─────────────────────────────────
 * Both dam surfaces are ISR'd at 300 seconds, so this string can be up to five
 * minutes old by the time it is read — and the iOS app can hold a cached
 * response far longer. "in 2 hours" silently decays into a false claim; "at
 * 3 PM" stays true no matter how stale the render is. The worst this can be is
 * up to five minutes late announcing a flip that already happened, which is the
 * failure direction that leaves someone waiting on the bank rather than
 * standing in the river.
 *
 * Returns null when nothing can be said — no schedule for today, or no flip
 * left in it. A caller renders nothing; the schedule section below carries the
 * full picture either way.
 */
export function nextScheduleChangeSentence(
  schedule: Array<{ scheduleDate: string; hours: Array<{ hourEnding: number; megawatts: number }> }>,
  now = Date.now()
): string | null {
  const state = scheduleStateNow(schedule, now);
  if (!state?.change) return null;

  const { hourEnding, scheduleDate, dayOffset, generating } = state.change;
  // hourEndingLabel gives the hour the water STARTS moving, which is exactly
  // the instant the flip happens — hour ending 16 is the release running from
  // 3 PM, so the change is at 3 PM.
  const time = hourEndingLabel(hourEnding);
  const clock = time === '12 AM' ? 'midnight' : time;

  let when: string;
  if (dayOffset === 0) when = clock;
  else if (dayOffset === 1) when = `${clock} tomorrow`;
  else {
    const [y, m, d] = scheduleDate.split('-').map(Number);
    const weekday = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
      weekday: 'long',
      timeZone: 'UTC',
    });
    when = `${clock} ${weekday}`;
  }

  return generating ? `Water on at ${when}` : `Water off at ${when}`;
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
  if (minutes < 60) {
    const whole = Math.round(minutes);
    return whole === 1 ? 'a minute ago' : `${whole} minutes ago`;
  }
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
