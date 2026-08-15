// shared/dam-schedule-copy.ts
//
// How a generation schedule — and the readings shown beside it — are put into
// words. Shared between the web dam page and the eddy-ios dam screen, because
// getting any of it wrong is a safety problem rather than a cosmetic one.
//
// ── The rule this file exists to enforce ───────────────────────────────────
// SAY WHAT THE SOURCE SAID, AT THE PLACE IT SAID IT.
//
// Two ways that gets violated, and both shipped here before being caught:
//   - Wrong SUBJECT. "Water off at 10 PM" turns a fact about a powerhouse into
//     a claim about a river twenty miles downstream. See idleWindowSentence.
//   - Missing TIME. Movement rendered in place of a reading's age presents a
//     window that closed hours ago as if it closed now. See
//     tailwaterMovementSentence.
// Both are the same mistake as an hour-ending off-by-one: a true number,
// attached to the wrong place or the wrong moment.
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
 * ramp hour. An empty list means the units are scheduled all day, and saying so
 * plainly is better than printing nothing and letting it read as "no data".
 *
 * ── Why every branch says "scheduled" ──────────────────────────────────────
 * This reads a SCHEDULE and nothing else. It said "Generation off:" and
 * "Generating every hour", both present-tense claims about a powerhouse Eddy
 * has not looked at — and on iOS this string renders in THREE places, one of
 * them directly beneath a hero that may be reporting a measured "No turbine
 * generation observed". Two lines flatly contradicting each other, one of them
 * sourced from a plan.
 *
 * The web schedule card carried the corrected wording inline while this
 * function did not, which is how the two platforms came to describe the same
 * day differently. Both render from here now.
 *
 * ── Why "Generation off" and not "Water off" ───────────────────────────────
 * Because the schedule establishes the first and not the second. SWPA says when
 * the UNITS run at the DAM. It says nothing about the river at an access twenty
 * miles down, where the water arrives late on a start and — the dangerous half —
 * stays high long after a stop, riding the recession limb. "Water off" invites a
 * reader standing downstream to treat a machinery fact as a river fact, and this
 * is the string they read before deciding to wade.
 *
 * The naming discipline is the same one hourEndingLabel enforces on the clock:
 * say precisely what the source said, and let the reader do the extrapolating
 * knowingly. Travel time is what would let Eddy make that claim honestly, and it
 * is not built — see docs/TAILWATER_PLAN.md.
 */
export function idleWindowSentence(idle: Array<{ from: number; to: number }>): string {
  if (idle.length === 0) return 'Generation scheduled every hour — no break in the schedule.';
  return `No generation scheduled: ${idle.map((w) => windowLabel(w.from, w.to)).join(', ')}`;
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
 * The wall clock at the dam for any instant, as `{ dayKey, hoursElapsed }`.
 *
 * `hoursElapsed` is a FRACTION of the day (13.5 = half past one in the
 * afternoon) rather than an integer hour, because the thing it positions is a
 * marker sliding across 24 bars, and snapping it to the hour would put it on a
 * boundary for 59 minutes out of every 60. `Math.floor` it when what you want
 * is which Central hour an observation landed in.
 *
 * Exported for the history bucketer, which has to place a UTC timestamp on a
 * Central calendar day and hour. Doing that conversion anywhere else is how
 * weekdayFileFor once read the server's zone and blanked every schedule after
 * 7pm Central.
 */
export function centralClock(now: number): { dayKey: string; hoursElapsed: number } {
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
 * The calendar day after `dayKey`, both as `YYYY-MM-DD`.
 *
 * Exported for dam-generation.ts, which walks the same schedule array looking
 * for load changes as well as on/off flips and is under the same
 * consecutive-days-only rule. Two implementations of this arithmetic is two
 * chances to skip a day each March.
 */
export function nextDayKey(dayKey: string): string {
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
 * The qualifier that MUST render adjacent to a scheduled-change line.
 *
 * Three claims are packed in, and each is load-bearing:
 *
 * - "at the dam" — the transition is a fact about the powerhouse, not about the
 *   river where somebody is standing.
 * - "subject to change" — WATER_REGIMES_STRATEGY.md requires SWPA's own
 *   disclaimer to travel with the schedule EVERYWHERE it appears, and /dams
 *   renders these lines with no schedule block and therefore no other caveat on
 *   the page at all.
 * - "downstream water lags" — the travel-time gap. Asymmetric, and the reason
 *   this is not merely pedantic: a START understates when water arrives
 *   downstream, so a reader who leaves early is still safe, but a STOP
 *   overstates when downstream is safe to stand in, because the recession limb
 *   keeps the river up well after the units come off.
 */
export const SCHEDULE_CHANGE_NOTE = 'at the dam · subject to change · downstream water lags';

/**
 * The one forward-looking line a tailwater angler wants: when generation changes.
 *
 * ── Why the subject is GENERATION and not WATER ────────────────────────────
 * "Water off at 10 PM" is a claim about a river, and the schedule cannot
 * support it — see idleWindowSentence. The subject here is the plant, the
 * modality ("scheduled") is inside the sentence so it survives even if a caller
 * drops SCHEDULE_CHANGE_NOTE, and the note carries location and lag.
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
  else if (dayOffset === 1) {
    // ── "midnight tomorrow" NAMES THE WRONG MIDNIGHT ────────────────────────
    //
    // Tomorrow's hour ending 1 is the release running from 00:00 tomorrow —
    // which is the midnight at the END of today, the one a reader at 9 PM is
    // three hours away from. "midnight tomorrow" reads as the midnight that
    // closes tomorrow, so the sentence quietly moved a flip 24 hours out.
    //
    // The direction is the dangerous one. Every other hedge in this file errs
    // towards getting somebody OUT of the water early; this one told a wading
    // angler they had a day before the units came on when they had an evening.
    //
    // Only hour ending 1 is affected: it is the single hour whose start time
    // falls on the boundary between the two days, so it is the only label whose
    // day word and clock word can disagree about which night they mean.
    when = clock === 'midnight' ? 'midnight tonight' : `${clock} tomorrow`;
  } else {
    const [y, m, d] = scheduleDate.split('-').map(Number);
    const weekday = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
      weekday: 'long',
      timeZone: 'UTC',
    });
    when = `${clock} ${weekday}`;
  }

  return generating
    ? `Generation scheduled to start at ${when}`
    : `Generation scheduled to stop at ${when}`;
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
 * How far the tailwater moved, as a signed number in feet.
 *
 * ── Why a number and not "rising" / "falling" ──────────────────────────────
 * Measured over 7 days of hourly stage at Table Rock, Bull Shoals, Norfork,
 * Greers Ferry and Beaver (2026-08-12): the 3-hour change while the units were
 * IDLE reached 4.0 ft at p99 — the recession limb after a shutdown — while 25%
 * of GENERATING hours moved under 0.23 ft, because steady generation holds the
 * tailwater high and flat. The distributions overlap across the whole range a
 * threshold could sit in, so any verdict would be confidently wrong a good part
 * of the time.
 *
 * The rounding IS the threshold. A change that rounds to 0.0 ft returns null and
 * renders nothing, so there is no invented "steady" band to be wrong about.
 *
 * Feet is hardcoded because the only metric carrying a trend is tailwater
 * elevation. Widen deliberately if that changes — a signed number with the wrong
 * unit is worse than no number.
 */
export function tailwaterMovementLabel(
  trend: { hours: number; delta: number } | undefined | null
): string | null {
  if (!trend) return null;
  const rounded = Math.round(trend.delta * 10) / 10;
  if (rounded === 0) return null;
  const sign = rounded > 0 ? '+' : '−';
  return `${sign}${Math.abs(rounded).toFixed(1)} ft over ${trend.hours}h`;
}

/** Bands for how live a reading is. Same vocabulary the wire uses. */
export type ReadingStaleness = 'fresh' | 'lagging' | 'stale';

/** Past this many hours a reading is no longer "now". */
export const READING_LAGGING_AFTER_HOURS = 2;
/** Past this many hours it describes a river that has since changed. */
export const READING_STALE_AFTER_HOURS = 6;

/**
 * How live a reading is, computed HERE from its own timestamp.
 *
 * ── Why not DamMetricValue.staleness ───────────────────────────────────────
 * Because that field is stamped when the SERVER assembles the snapshot and then
 * frozen on the wire, while the reader's clock keeps moving. The iOS dam screen
 * fetches once in a useEffect with no refetch on focus and no AppState
 * listener, so a screen opened, backgrounded and resumed renders that same
 * payload hours later. Its age is computed on the device and is therefore
 * correct and live; its band is not. The two disagree, and the disagreement
 * lands on exactly the guard meant to suppress movement:
 *
 *   "+2.1 ft over 3h · 9 hours ago"   — band still says fresh, so it printed
 *
 * The wire field is retained because installed clients read it, but nothing in
 * this repo should display from it. Derive from `at`, which cannot go stale
 * because it describes an instant rather than a duration.
 *
 * Null when the timestamp cannot be read at all — never a guess.
 */
export function readingStaleness(
  at: string | number,
  now = Date.now()
): ReadingStaleness | null {
  const ms = typeof at === 'number' ? at : Date.parse(at);
  if (!Number.isFinite(ms)) return null;
  const hours = (now - ms) / (60 * 60 * 1000);
  // A timestamp slightly ahead of us (CDN clock skew) is current, not ancient.
  if (hours <= READING_LAGGING_AFTER_HOURS) return 'fresh';
  if (hours <= READING_STALE_AFTER_HOURS) return 'lagging';
  return 'stale';
}

/**
 * The line under the tailwater reading: how far it moved AND how old it is.
 *
 * ── Why the age can never be dropped ───────────────────────────────────────
 * changeOver() is correct by construction — it measures the window ending at the
 * LATEST OBSERVATION, and returns null rather than silently shrinking the window
 * when the series cannot support it. What it cannot know is how long ago that
 * observation was. Rendering the movement in place of the age (which is what
 * this surface did first) presents a window that ended hours ago as if it ended
 * now, on a number someone wades against.
 *
 * So the three staleness bands read differently, and none of them is silent:
 *
 *   fresh   (<=2h)  "+2.1 ft over 3h · 18 minutes ago"
 *   lagging (<=6h)  "+2.1 ft over 3h ending 4 hours ago"   — window located
 *   stale   (>6h)   "6 hours ago"                          — movement dropped
 *
 * ── Why the band is NOT a parameter ────────────────────────────────────────
 * `staleness` used to be read off the reading, and a caller passing a
 * DamMetricValue straight through was handing over a band the server stamped
 * hours earlier — see readingStaleness. Both halves of this sentence now come
 * from the same clock, so they cannot contradict each other. The band is
 * deliberately absent from the parameter type rather than merely ignored, so
 * the mistake cannot be made a second time by someone wiring it back up.
 *
 * Null only when the timestamp itself cannot be read. That renders nothing at
 * all rather than movement without an age, which is the failure this exists to
 * prevent.
 */
export function tailwaterMovementSentence(
  reading: { at: string; trend?: { hours: number; delta: number } },
  now = Date.now()
): string | null {
  const age = relativeAge(reading.at, now);
  if (!age) return null;

  const movement = tailwaterMovementLabel(reading.trend);
  const band = readingStaleness(reading.at, now);
  if (!movement || band !== 'fresh') {
    // `lagging` still shows movement, but only with the window LOCATED. Any
    // other band — stale, or a timestamp too broken to classify — drops it.
    if (movement && band === 'lagging') return `${movement} ending ${age}`;
    return age;
  }
  return `${movement} · ${age}`;
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
 * The oldest `retrievedAt` across a schedule's days, or null when no day
 * carries one.
 *
 * A schedule block is only as fresh as its OLDEST day: each day is a separate
 * file (mon.htm, tue.htm) with its own cache age, so taking the newest would
 * overstate the set. That fold had been written five times across three
 * packages — which is five places a change to the freshness rule could miss —
 * so it lives here, beside scheduleIsStale, which is what its result feeds.
 *
 * ISO-8601 UTC strings order lexically, which is what makes the string
 * comparison correct.
 */
export function oldestRetrievedAt(
  schedule: Array<{ retrievedAt: string | null }>
): string | null {
  return schedule.reduce<string | null>((oldest, day) => {
    if (!day.retrievedAt) return oldest;
    return !oldest || day.retrievedAt < oldest ? day.retrievedAt : oldest;
  }, null);
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
