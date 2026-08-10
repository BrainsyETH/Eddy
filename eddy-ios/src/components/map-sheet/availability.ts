// eddy-ios/src/components/map-sheet/availability.ts
// Everything the availability UI decides, with nothing drawn.
//
// Pure on purpose, and free of `@/` and `.tsx` imports: the Expo app has no
// test runner, so the web suite type-checks and runs this file directly — the
// same arrangement tabs.ts and placeSymbol.ts already have. The rules below are
// the substance of the feature and they are the part worth asserting.
//
// ── The distinction the whole strip rests on ──────────────────────────────
//
// FOUR things produce a bar with no fill, and three of them mean different
// things to a person deciding whether to keep looking:
//
//   full     every site is booked        → keep refreshing for a cancellation
//   closed   shut for the season         → go somewhere else
//   nyr      not yet released            → come back when booking opens
//   unknown  Eddy did not measure it     → say nothing at all
//
// A colour-blind reader, a reader in bright sun, and a reader at 20% brightness
// must all be able to tell them apart, so none of it rests on hue — see the
// `mark` field. Collapsing any of these into "0 open" would be a lie in a
// different direction each time.

import type { CampsiteAvailabilitySummary, CampsiteNightSummary } from '@eddy/types';

/** Sunday-first, matching Date#getUTCDay. */
const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/**
 * How a night's bar is drawn.
 *
 * `fill` alone cannot carry the four zero-states, so `mark` says which SHAPE to
 * draw and `fill` says how tall. Hue is never part of it.
 *
 *   bar      a filled column, `fill` high
 *   empty    a drawn-but-empty track — a container with nothing in it
 *   dash     a baseline rule — there is nothing here to fill
 *   none     nothing drawn at all
 */
export type NightMark = 'bar' | 'empty' | 'dash' | 'none';

export interface NightBar {
  date: string;
  /**
   * `T`, `F`, `S`.
   *
   * NO LONGER WHAT THE STRIP PRINTS — see `dayOfMonth`. Kept because it is the
   * cheap form of the same fact and the spoken label may yet want it; a caller
   * that needs a word rather than an initial has `spokenWeekday`.
   */
  weekday: string;
  /**
   * Day of the month, which is what the ruler under the bars draws.
   *
   * A fortnight contains each weekday twice, so initials repeat — two Mondays
   * both read `M`, and a reader counting columns to find next Saturday has to
   * count twice to know which one they landed on. `nightChoices` already made
   * this call one tab down, where the chips read `Fri 8`.
   */
  dayOfMonth: number;
  /** 0..1 of the track's height. Never 0 when a single site is free. */
  fill: number;
  mark: NightMark;
  isToday: boolean;
  /** Friday and Saturday, the two nights most people are actually asking about. */
  isWeekend: boolean;
  sitesOpen: number;
  sitesReservable: number;
}

/** Day of week for a `YYYY-MM-DD`, 0 = Sunday. Parsed as UTC so it cannot drift. */
function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/**
 * The reader's own calendar date, as `YYYY-MM-DD`.
 *
 * The DEVICE's day, not the server's. The horizon is stored in America/Chicago
 * because that is where the rivers are, and a phone an hour either side of it
 * would otherwise label a column with a day its owner is not living in. Where
 * the two disagree the edge night simply has no row and draws as a gap, which
 * is the honest rendering of "not measured" and needs no special case.
 *
 * en-CA because it renders ISO-ordered dates, which is the whole reason to use
 * it — the same trick the server's window.ts uses.
 */
export function localToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function addDays(date: string, days: number): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/**
 * The smallest fill a free site may draw.
 *
 * Alley Spring has 197 sites. One of them free is 0.5% of the track, which
 * rounds to nothing and reads as "fully booked" — the opposite of the truth,
 * and the exact case somebody hunting a cancellation is looking for.
 */
const MIN_VISIBLE_FILL = 0.12;

/**
 * The strip, one entry per night of the horizon.
 *
 * Built from the DATES rather than from the array, because the array is sparse:
 * a season ending mid-horizon leaves a real tail of unmeasured nights, and
 * walking the payload would silently shorten the strip instead of showing the
 * gap. `nights` is the length the caller asked for, always.
 */
export function nightBars(
  availability: CampsiteAvailabilitySummary | null | undefined,
  today: string,
  count = 14,
): NightBar[] {
  const measured = new Map<string, CampsiteNightSummary>();
  for (const night of availability?.nights ?? []) measured.set(night.date, night);

  const bars: NightBar[] = [];

  for (let i = 0; i < count; i++) {
    const date = addDays(today, i);
    const day = weekdayOf(date);
    const night = measured.get(date);

    let mark: NightMark = 'none';
    let fill = 0;

    if (night) {
      if (night.status === 'closed' || night.status === 'not_yet_released') {
        // Nothing to fill — the campground is not offering these nights at all.
        mark = 'dash';
      } else if (night.sitesOpen > 0 && night.sitesReservable > 0) {
        mark = 'bar';
        fill = Math.max(MIN_VISIBLE_FILL, night.sitesOpen / night.sitesReservable);
      } else {
        // Every site booked. A drawn, empty track — the inventory exists.
        mark = 'empty';
      }
    }

    bars.push({
      date,
      weekday: WEEKDAY_INITIALS[day],
      // Sliced rather than parsed through Date: `date` is already the ISO day
      // this row is about, and re-parsing it would reintroduce the timezone
      // question localToday exists to have settled.
      dayOfMonth: Number(date.slice(8, 10)),
      fill: Math.min(1, fill),
      mark,
      isToday: i === 0,
      isWeekend: day === 5 || day === 6,
      sitesOpen: night?.sitesOpen ?? 0,
      sitesReservable: night?.sitesReservable ?? 0,
    });
  }

  return bars;
}

/** The number the hero prints, or null when there is nothing to say. */
export interface AvailabilityHero {
  /** Absent when the headline is a phrase rather than a count. */
  count: number | null;
  /** `open`, or the whole phrase when count is null. */
  headline: string;
  /** `of 54 sites`, when a denominator is meaningful. */
  detail: string | null;
  /** The nights the count describes — `Fri–Sun, Aug 7–9`. */
  caption: string;
}

/**
 * The hero, derived from the same fields campsiteAvailabilityLine reads.
 *
 * Deliberately NOT a second copy of that sentence. The line is one string for
 * places that have room for one string; this splits the same facts so the count
 * can be set at display size. Both must agree, which is why both read
 * `sitesOpen`/`sitesReservable`/`status` and neither recomputes anything.
 *
 * The count describes `window` — the weekend — and never the fortnight. The
 * server folds it that way for a reason: a minimum taken across fourteen nights
 * reports a campground with forty free sites on twelve of them as fully booked.
 */
export function availabilityHero(
  availability: CampsiteAvailabilitySummary | null | undefined,
  name?: string,
): AvailabilityHero | null {
  if (!availability) return null;

  const { status, sitesOpen, sitesReservable, window, kind } = availability;

  switch (status) {
    case 'closed':
      return { count: null, headline: 'Closed for the season', detail: null, caption: '' };
    case 'not_yet_released':
      return { count: null, headline: 'Not yet bookable', detail: null, caption: window.label };
    case 'full':
      return { count: null, headline: 'Fully booked', detail: null, caption: window.label };
    case 'open':
      if (kind === 'backcountry_district') {
        return {
          count: sitesOpen,
          headline: sitesOpen === 1 ? 'backcountry site' : 'backcountry sites',
          detail: null,
          caption: name ?? window.label,
        };
      }
      return {
        count: sitesOpen,
        headline: 'open',
        detail: `of ${sitesReservable} sites`,
        caption: window.label,
      };
    default:
      return null;
  }
}

/**
 * What VoiceOver says about the strip, as ONE utterance.
 *
 * Fourteen focusable bars would be fourteen stops on the way to the button
 * underneath, which is a worse experience than the sighted one rather than an
 * equivalent to it. So the strip is a single element and this is its label.
 */
export function availabilityVoiceOver(
  availability: CampsiteAvailabilitySummary | null | undefined,
  today: string,
  name?: string,
): string | null {
  const hero = availabilityHero(availability, name);
  if (!hero) return null;

  const headline =
    hero.count === null
      ? `${hero.headline}${hero.caption ? `, ${hero.caption}` : ''}`
      : `${hero.count} ${hero.headline}${hero.detail ? ` ${hero.detail}` : ''}, ${hero.caption}`;

  const bars = nightBars(availability, today);
  const withRoom = bars.filter((bar) => bar.mark === 'bar').length;
  const measured = bars.filter((bar) => bar.mark !== 'none').length;

  if (measured === 0) return headline;

  return `${headline}. Next ${bars.length} nights: ${withRoom} with sites open.`;
}

/** A night the selector offers, in the Camping tab. */
export interface NightChoice {
  date: string;
  /** `Tonight`, `Tomorrow`, or `Fri 8`. */
  label: string;
  /** Sites open that night, or null when it was not measured. */
  count: number | null;
  isWeekend: boolean;
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * The night chips.
 *
 * A chip per night rather than a tappable bar, because fourteen bars across a
 * sheet is about twenty points each and nothing that small may be a control —
 * the audit that produced PlaceHead caught exactly that mistake costing a
 * wrong action rather than a near miss. Chips are a real 44pt row, they carry a
 * count, and FilterChips already draws them.
 */
export function nightChoices(
  availability: CampsiteAvailabilitySummary | null | undefined,
  today: string,
  count = 14,
): NightChoice[] {
  return nightBars(availability, today, count).map((bar, index) => {
    const [, month] = bar.date.split('-').map(Number);
    const day = bar.dayOfMonth;

    return {
      date: bar.date,
      // The first two nights are named rather than dated: somebody scanning for
      // a bed tonight should not have to work out which weekday today is.
      label:
        index === 0
          ? 'Tonight'
          : index === 1
            ? 'Tomorrow'
            : // The month only earns its place when the chip crosses into one.
              `${longWeekday(bar.date)} ${day === 1 || index === 2 ? `${MONTHS[month - 1]} ` : ''}${day}`,
      count: bar.mark === 'none' ? null : bar.sitesOpen,
      isWeekend: bar.isWeekend,
    };
  });
}

/** `Fri`. Three letters, because a single initial is ambiguous on a chip. */
function longWeekday(date: string): string {
  return WEEKDAY_NAMES[weekdayOf(date)].slice(0, 3);
}

/** The full weekday, for VoiceOver. */
export function spokenWeekday(date: string): string {
  return WEEKDAY_NAMES[weekdayOf(date)];
}
