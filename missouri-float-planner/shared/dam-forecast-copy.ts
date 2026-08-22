// shared/dam-forecast-copy.ts
//
// How a district's generation FORECAST is put into words and days. Shared
// between the web dam page and the eddy-ios dam screen for the same reason
// dam-schedule-copy.ts is: every string here is one somebody may wade against,
// and two implementations of the arithmetic is two chances to disagree.
//
// ── Forecast, never schedule ───────────────────────────────────────────────
// SWPA posts a SCHEDULE — a loading plan with a column per project. The Corps'
// celrn-cwms-forecast series is that district's OPERATING FORECAST, their own
// word for it. The two modalities render on the same app under the same
// section shape, so the vocabulary is the only thing keeping them distinct:
// every sentence here says "forecast", exactly as every schedule sentence
// says "scheduled", and neither ever wears the present tense that belongs to
// measurements. See idleWindowSentence for the rule's origin.
//
// ── Instants, not hour-endings ─────────────────────────────────────────────
// Windows arrive as absolute UTC instants (see DamForecastWindow), so nothing
// here does calendar arithmetic that can be wrong in March or November: days
// are discovered by formatting each hour into the dam's zone and watching the
// day key change. A 23- or 25-hour day is just a day with fewer or more hours.
//
// Pure TypeScript, sibling-shared imports only — the same constraint every
// module in this directory is under.

import type { DamForecastWindow } from './dam-types';
import { nextDayKey, scheduleDayLabel } from './dam-schedule-copy';

const HOUR_MS = 3_600_000;

/** The dam's wall clock for an instant: calendar day plus hour label parts. */
function zoneClock(ms: number, timeZone: string): { dayKey: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return {
    dayKey: `${get('year')}-${get('month')}-${get('day')}`,
    hour: Number(get('hour')),
  };
}

/**
 * An instant's clock label in the dam's zone — "3 PM", "noon"-free, matching
 * hourEndingLabel's 12-hour convention. Windows are hour-aligned, so minutes
 * never appear.
 */
export function forecastClockLabel(iso: string, timeZone: string): string {
  const { hour } = zoneClock(Date.parse(iso), timeZone);
  const suffix = hour < 12 ? 'AM' : 'PM';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display} ${suffix}`;
}

/** "12 AM" reads better as the boundary it is. Mirrors windowLabel's rule. */
function midnightAware(label: string): string {
  return label === '12 AM' ? 'midnight' : label;
}

/** One same-state stretch of a single calendar day, ready to render. */
export interface ForecastDaySpan {
  generating: boolean;
  /** "9 AM – midnight" — clock labels in the dam's zone, hour-aligned. */
  label: string;
  /** "~15,800 cfs peak", or null on idle spans. Forecast magnitude, hedged. */
  peakLabel: string | null;
}

export interface ForecastDay {
  /** Calendar day in the dam's zone, YYYY-MM-DD. */
  dayKey: string;
  /** "Fri, Aug 15" — same formatter the schedule cards use. */
  dayLabel: string;
  spans: ForecastDaySpan[];
}

/**
 * Windows regrouped into calendar days in the dam's zone, split at midnight.
 *
 * A window that crosses midnight contributes a span to both days — "9 PM –
 * midnight" and "midnight – 6 AM" — because a reader scans by day, and a
 * span filed only under the day it started in would leave tomorrow morning
 * looking unforecast. Walked hour by hour against the formatted day key, so
 * DST days group correctly with no arithmetic on the calendar at all.
 */
export function forecastDays(
  windows: DamForecastWindow[],
  timeZone: string
): ForecastDay[] {
  const days: ForecastDay[] = [];
  const dayFor = (dayKey: string): ForecastDay => {
    const last = days[days.length - 1];
    if (last && last.dayKey === dayKey) return last;
    const day: ForecastDay = { dayKey, dayLabel: scheduleDayLabel(dayKey), spans: [] };
    days.push(day);
    return day;
  };

  for (const w of windows) {
    const start = Date.parse(w.startUtc);
    const end = Date.parse(w.endUtc);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;

    // Walk the window's interior hours, cutting a span whenever the day key
    // changes, then flush the tail. A boundary that lands exactly on midnight
    // is an END, not an interior hour, so the closing span stays on the day
    // it belongs to and reads "… – midnight".
    let spanStart = start;
    let spanDay = zoneClock(start, timeZone).dayKey;
    for (let t = start + HOUR_MS; t < end; t += HOUR_MS) {
      const dayKey = zoneClock(t, timeZone).dayKey;
      if (dayKey !== spanDay) {
        pushSpan(dayFor(spanDay), w, spanStart, t, timeZone);
        spanStart = t;
        spanDay = dayKey;
      }
    }
    pushSpan(dayFor(spanDay), w, spanStart, end, timeZone);
  }

  return days;
}

function pushSpan(
  day: ForecastDay,
  w: DamForecastWindow,
  startMs: number,
  endMs: number,
  timeZone: string
): void {
  const startLabel = midnightAware(forecastClockLabel(new Date(startMs).toISOString(), timeZone));
  const endLabel = midnightAware(forecastClockLabel(new Date(endMs).toISOString(), timeZone));
  day.spans.push({
    generating: w.generating,
    label: `${startLabel} – ${endLabel}`,
    // The "~" is the hedge: a forecast peak is the plan's number, not a
    // measurement, and the rounding already stripped false precision.
    peakLabel:
      w.generating && w.peakCfs !== null
        ? `~${w.peakCfs.toLocaleString('en-US')} cfs peak`
        : null,
  });
}

/**
 * The next forecast flip, as one sentence — the forecast's counterpart to
 * nextScheduleChangeSentence, under the same rules: absolute clock times
 * (a countdown decays into a false claim under ISR and app caches), null
 * whenever nothing can be said, and the midnight-tonight correction.
 *
 * ── Fails closed, twice ────────────────────────────────────────────────────
 * Null when no window contains `now` — a forecast that has gone stale or has
 * a gap at the present hour cannot say what the dam is forecast to be doing,
 * and this line anchors on that claim. And null when the flip is not
 * CONTIGUOUS with the current window: across a gap, "stops at 9 PM" would be
 * read off hours the source said nothing about.
 */
export function nextForecastChangeSentence(
  windows: DamForecastWindow[],
  timeZone: string,
  now = Date.now()
): string | null {
  const index = windows.findIndex(
    (w) => Date.parse(w.startUtc) <= now && now < Date.parse(w.endUtc)
  );
  if (index === -1) return null;

  const current = windows[index];
  const next = windows[index + 1];
  if (!next || next.startUtc !== current.endUtc) return null;

  const boundary = Date.parse(current.endUtc);
  const clock = midnightAware(forecastClockLabel(current.endUtc, timeZone));

  const today = zoneClock(now, timeZone).dayKey;
  const boundaryDay = zoneClock(boundary, timeZone).dayKey;
  // Calendar arithmetic, not clock arithmetic: now + 24h lands on today again
  // each November and can misname a day each March — nextDayKey exists for
  // exactly this. See its comment in dam-schedule-copy.ts.
  const tomorrow = nextDayKey(today);

  let when: string;
  if (boundaryDay === today) when = clock;
  else if (boundaryDay === tomorrow) {
    // Midnight at the start of tomorrow is the midnight at the END of today —
    // the one a reader at 9 PM is three hours from. "midnight tomorrow" moves
    // it a day out, in the dangerous direction. Same correction, same reason,
    // as nextScheduleChangeSentence.
    when = clock === 'midnight' ? 'midnight tonight' : `${clock} tomorrow`;
  } else {
    // Midnight belongs to the day it CLOSES, not the day it opens — the same
    // correction as the tomorrow branch above, which is where it stopped. A
    // boundary at midnight on Monday is Sunday night.
    const midnight = clock === 'midnight';
    const [y, m, d] = boundaryDay.split('-').map(Number);
    const named = Date.UTC(y, m - 1, d) - (midnight ? 86_400_000 : 0);

    // ── A bare weekday cannot carry a ten-day horizon ──────────────────────
    // This phrasing was inherited from nextScheduleChangeSentence, where it is
    // safe because SWPA posts at most three days ahead. The forecast runs to
    // FORECAST_HORIZON_HOURS — ten days — and Wolf Creek can generate
    // continuously for weeks in flood operations, so the flip can legitimately
    // land eight or nine days out. "Saturday" then names two Saturdays and a
    // reader takes the nearer one, planning to wade a day the district
    // forecasts full generation.
    //
    // Seven days out the weekday is today's own name, which is worse than
    // ambiguous. So past six days the date is spelled out, matching the
    // day-grouped list below rather than inventing a third format.
    const [ty, tm, td] = today.split('-').map(Number);
    const daysOut = Math.round((named - Date.UTC(ty, tm - 1, td)) / 86_400_000);
    const label = new Date(named).toLocaleDateString('en-US', {
      ...(daysOut >= 6
        ? { weekday: 'short' as const, month: 'short' as const, day: 'numeric' as const }
        : { weekday: 'long' as const }),
      timeZone: 'UTC',
    });
    when = `${clock} ${label}`;
  }

  return next.generating
    ? `Generation forecast to start at ${when}`
    : `Generation forecast to stop at ${when}`;
}

/**
 * How far ahead the plan still reaches, in hours. Null when there is none.
 *
 * The last window's end IS the last forecast point, so this needs nothing the
 * wire does not already carry.
 */
export function forecastHorizonHours(
  windows: readonly DamForecastWindow[],
  now = Date.now()
): number | null {
  const last = windows[windows.length - 1];
  if (!last) return null;
  const end = Date.parse(last.endUtc);
  if (!Number.isFinite(end)) return null;
  return Math.max(0, (end - now) / 3_600_000);
}

/**
 * Below this the plan has stopped being refreshed, or the district has changed
 * what it publishes. Either way it is no longer "a plan, refreshed daily".
 *
 * ── Why the CONTENT has to be asked, and not the fetch ─────────────────────
 * `retrievedAt` is the Date header of EDDY'S OWN request. It says when we last
 * looked, never when Nashville last wrote — CWMS publishes no write time for a
 * series. So the only staleness signal that existed said "fetched four minutes
 * ago" about a plan that could have been written a week earlier, and
 * `scheduleIsStale` could not fire on a forecast whose job had died.
 *
 * What a dead job actually looks like is a SHRINKING HORIZON. LRN publishes
 * about nine days ahead and rewrites daily; if the writer stops, the existing
 * future points stay readable and the horizon falls by 24 hours a day. So the
 * plan quietly ages under a fresh badge for up to nine days, on a card people
 * wade against.
 *
 * Five days is the bar: comfortably under LRN's normal nine even allowing for
 * a short publish, and reached about four days after a writer dies. It cannot
 * catch a dead job on day one — nothing in the data can — but it stops the
 * card insisting the plan is current all the way to the end.
 */
export const FORECAST_MIN_HORIZON_HOURS = 5 * 24;

/**
 * Whether the plan itself looks stale, independent of when Eddy fetched it.
 *
 * False when there are no windows: an absent forecast renders nothing, and
 * "stale" is a claim about something on screen.
 */
export function forecastPlanStale(
  windows: readonly DamForecastWindow[],
  now = Date.now()
): boolean {
  const horizon = forecastHorizonHours(windows, now);
  if (horizon === null) return false;
  return horizon < FORECAST_MIN_HORIZON_HOURS;
}

/**
 * The plan's own extent, said plainly: "Planned through Sat, Aug 22".
 *
 * Shown beside the retrieval line because the two answer different questions —
 * when Eddy looked, and how far what it found actually reaches. The second is
 * the one a reader deciding whether to trust a nine-day-old plan needs, and it
 * was not on the card at all.
 */
export function forecastHorizonSentence(
  windows: readonly DamForecastWindow[],
  timeZone: string
): string | null {
  const last = windows[windows.length - 1];
  if (!last) return null;
  const end = Date.parse(last.endUtc);
  if (!Number.isFinite(end)) return null;
  // The last window's end is EXCLUSIVE, so a plan running to midnight belongs
  // to the day that closes — the same correction forecastDays makes.
  const dayKey = zoneClock(end - 1, timeZone).dayKey;
  return `Planned through ${scheduleDayLabel(dayKey)}`;
}
