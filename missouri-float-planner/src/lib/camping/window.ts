// src/lib/camping/window.ts
// Resolving "next weekend" — the one date decision this feature makes.
//
// Eddy has no trip date. `float_plans` records what the river was doing when a
// plan was built, not when anybody intends to float, so there is nothing to
// key availability off. Rather than introduce a date picker, the server picks
// the window every client will show and ships explicit dates plus a rendered
// label, so neither the web app nor iOS does date arithmetic and the two can
// never disagree about which weekend they are describing.
//
// ── Nights versus days ─────────────────────────────────────────────────────
//
// A weekend trip is an arrival and a departure: leave Friday, drive home
// Sunday. That is TWO nights — Friday's and Saturday's — even though it spans
// three calendar days, and both providers key availability by the night
// occupied. Getting this wrong reads a Sunday night nobody asked about and
// under-reports the weekend whenever a campground closes Sunday, which several
// Ozark campgrounds do: Pulltite shuts 49 of 56 sites on Sunday nights.

const ZONE = 'America/Chicago';

/** The weekend Eddy is currently talking about. */
export interface CampingWindow {
  /** Arrival date, `YYYY-MM-DD`. */
  startDate: string;
  /** Departure date, `YYYY-MM-DD`. Not an occupied night. */
  endDate: string;
  /** Occupied nights, `YYYY-MM-DD`, ascending. Always `endDate - startDate`. */
  nights: string[];
  /** Rendered for display, e.g. `Fri–Sun, Aug 7–9`. */
  label: string;
}

const MS_PER_DAY = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The calendar date in Chicago at a given instant, as `YYYY-MM-DD`. */
export function localDate(instant: Date): string {
  // en-CA renders ISO-ordered dates, which is the whole reason to use it here.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/** Day of week for a `YYYY-MM-DD`, 0 = Sunday. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function addDays(date: string, days: number): string {
  const at = new Date(`${date}T00:00:00Z`).getTime() + days * MS_PER_DAY;
  return new Date(at).toISOString().slice(0, 10);
}

function nightsBetween(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  for (let d = startDate; d < endDate; d = addDays(d, 1)) out.push(d);
  return out;
}

function formatLabel(startDate: string, endDate: string): string {
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);

  const from = `${WEEKDAYS[weekdayOf(startDate)]}–${WEEKDAYS[weekdayOf(endDate)]}`;
  const span =
    sm === em && sy === ey
      ? `${MONTHS[sm - 1]} ${sd}–${ed}`
      : `${MONTHS[sm - 1]} ${sd}–${MONTHS[em - 1]} ${ed}`;

  return `${from}, ${span}`;
}

/**
 * The weekend to display, given an instant.
 *
 * Monday through Thursday looks ahead to the coming Friday. Friday and Saturday
 * show what is left of the weekend already underway, because someone checking
 * on Saturday morning is still deciding where to sleep that night. Sunday rolls
 * forward to the next weekend: the only night left is tonight, that is a
 * same-day booking rather than a plan, and a card offering it would be stale by
 * the time most people read it.
 */
export function resolveWeekend(now: Date = new Date()): CampingWindow {
  const today = localDate(now);
  const dow = weekdayOf(today);

  // Days from today to the arrival Friday. Friday (5) and Saturday (6) are
  // already inside a weekend and arrive today; Sunday (0) waits five days.
  const toFriday = dow === 5 || dow === 6 ? 0 : (5 - dow + 7) % 7;

  const startDate = addDays(today, toFriday);
  // Departure is the Sunday that closes the arrival's weekend. From a Saturday
  // arrival that is tomorrow; from a Friday or a look-ahead it is Friday + 2.
  const endDate = addDays(startDate, weekdayOf(startDate) === 6 ? 1 : 2);

  return {
    startDate,
    endDate,
    nights: nightsBetween(startDate, endDate),
    label: formatLabel(startDate, endDate),
  };
}

/**
 * The `YYYY-MM-01` month starts a window touches.
 *
 * Recreation.gov's availability endpoint is month-locked and insists on the
 * first of the month, so a weekend straddling month-end costs two requests
 * instead of one. Roughly one weekend in five: Oct 31 2026 is a Saturday.
 */
export function monthsSpanned(window: CampingWindow): string[] {
  const seen = new Set<string>();
  for (const night of window.nights) seen.add(`${night.slice(0, 7)}-01`);
  return [...seen].sort();
}
