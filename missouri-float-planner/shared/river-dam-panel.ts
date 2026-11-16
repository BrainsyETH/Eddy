// missouri-float-planner/shared/river-dam-panel.ts
// The look ahead for a tailwater river's dam panel when the dam has NO posted
// schedule: the Corps' release forecast, one figure per covered day. Pure, so
// every boundary below is testable with no network.
//
// ── Two sources, and which one a dam gets ──────────────────────────────────
// A HYDROPOWER dam gets SWPA's hourly schedule, drawn exactly as the dam cards
// draw it (GenerationSchedule on web, DamGlance on iOS). It never gets the
// Corps' `Flow-Res Out.Ave.~1Day.1Day.Forecast`, and that is the reason this
// file exists. The panel used to show that series as
// "The Corps' release schedule" under Bull Shoals, and it was wrong three ways
// at once (2026-11-01):
//
//   1. It is a DAILY AVERAGE. A peaking plant that runs minimum flow for
//      twenty-two hours and 6,700 cfs for two averages to a number that
//      describes no hour of the day, and "Rising to about 2,300 cfs by Wed"
//      compared that average against an HOURLY reading.
//   2. It is not the schedule. SWPA had Monday at minimum flow with a two-hour
//      evening peak; the forecast said 2,300 all day. For Sunday it said 1,500;
//      the dam released about 730.
//   3. It was labelled a day late. CWMS stamps a daily value at the END of the
//      day it covers (see coveredDayKey), so the box reading "Mon 11/2" held
//      Sunday's figure.
//
// A FLOOD-CONTROL dam (Clearwater) has no powerhouse and no SWPA schedule, and
// its gate releases hold steady for days, so a daily average is an honest
// description of it. It keeps the forecast, labelled as a daily average and on
// the day it actually covers.

import { centralDayKey, scheduleDayLabel } from './dam-schedule-copy';

const HOUR_MS = 3_600_000;

/** "Today" or "Wed", and "Nov 2", for a Central day key. */
export function dayNames(key: string, now: number): { dayName: string; dateLabel: string } {
  const today = centralDayKey(now);
  // scheduleDayLabel formats the KEY in UTC so the viewer's zone cannot shift
  // it: "Mon, Nov 2".
  const [weekday, dateLabel] = scheduleDayLabel(key).split(', ');
  // The weekday rather than "Tomorrow": these are narrow columns, the same
  // TODAY / MON / TUE the river page's outlook card uses.
  const dayName = key === today ? 'Today' : weekday;
  return { dayName, dateLabel: dateLabel ?? key };
}

/** One day of the Corps' daily-average release forecast. */
export interface DailyForecastDay {
  key: string;
  dayName: string;
  dateLabel: string;
  cfs: number;
}

/**
 * The Central day a CWMS point covers.
 *
 * CWMS stamps a regular-interval average at the END of its interval. For a
 * daily series that is local midnight AFTER the day, so the point stamped
 * 2026-11-02T06:00Z (Monday 00:00 CST) is Sunday's average. Measured, not
 * assumed: Bull Shoals' observed `Res Out.Ave.~1Day.1Day.Regi-Comp`, stamped
 * at each local midnight, equalled the mean of the 24 hourly values for the
 * PRECEDING day on every day from 2026-10-24 to 10-31. Stepping back an hour
 * lands inside the covered day on both sides of a DST change.
 *
 * Hourly series (MVS) carry one point per hour, also period-ending, and
 * stepping back an hour keeps hour ending 24 on its own day too.
 */
export function coveredDayKey(timestamp: number): string {
  return centralDayKey(timestamp - HOUR_MS);
}

/**
 * The release forecast collapsed to one figure per covered day, today onward.
 *
 * A daily series already has one point per day. An hourly one is reduced to
 * the day's PEAK, not its mean: on a regulated river the high-water hour is the
 * one that decides whether you can be out there.
 */
export function dailyForecastDays(
  points: Array<{ at: string; cfs: number }>,
  now: number,
  limit = 7
): DailyForecastDay[] {
  const today = centralDayKey(now);
  const byDay = new Map<string, number>();
  for (const p of points) {
    const t = Date.parse(p.at);
    if (!Number.isFinite(t) || !Number.isFinite(p.cfs)) continue;
    const key = coveredDayKey(t);
    if (key < today) continue;
    const existing = byDay.get(key);
    if (existing === undefined || p.cfs > existing) byDay.set(key, p.cfs);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, limit)
    .map(([key, cfs]) => ({ key, cfs, ...dayNames(key, now) }));
}
