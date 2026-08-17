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
  /**
   * `Sep`, on the first column of a month the horizon crosses INTO.
   *
   * Null everywhere else, including on the first column — a strip that opens on
   * the 1st has crossed nothing and needs no marker. Bare numbers are unique
   * within a month and ambiguous across one: `30 · 31 · 1 · 2` does not say
   * which 1st, and a fortnight crosses a boundary about half the time.
   *
   * The marker REPLACES that column's number rather than sitting beside it.
   * There is no room beside it — a column is about 24pt — and the day it hides
   * is the only one in the strip a reader can infer without being told, because
   * a month starts on its first.
   */
  monthLabel: string | null;
  /** 0..1 of the track's height. Never 0 when a single site is free. */
  fill: number;
  mark: NightMark;
  isToday: boolean;
  /** Friday and Saturday, the two nights most people are actually asking about. */
  isWeekend: boolean;
  sitesOpen: number;
  sitesReservable: number;
  /**
   * The night's own status, or null when the night was never measured.
   *
   * `mark` cannot carry this: `dash` is drawn for a closed night AND for one
   * whose inventory has not been released, because both are "nothing here to
   * fill" — but they are opposite instructions to a reader ("go somewhere
   * else" versus "come back when booking opens"), which is the distinction
   * this module's header opens with. The SHAPE folds them; the words must not,
   * so the words get the raw status.
   */
  status: CampsiteNightSummary['status'] | null;
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
    // Sliced rather than parsed through Date: `date` is already the ISO day this
    // row is about, and re-parsing it would reintroduce the timezone question
    // localToday exists to have settled.
    const dayOfMonth = Number(date.slice(8, 10));

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
      dayOfMonth,
      // `i > 0` is the whole of "crossed INTO": a strip whose first column is
      // the 1st has not crossed anything.
      monthLabel: i > 0 && dayOfMonth === 1 ? MONTHS[Number(date.slice(5, 7)) - 1] : null,
      fill: Math.min(1, fill),
      mark,
      isToday: i === 0,
      isWeekend: day === 5 || day === 6,
      sitesOpen: night?.sitesOpen ?? 0,
      sitesReservable: night?.sitesReservable ?? 0,
      status: night?.status ?? null,
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
 * The hero: ONE NIGHT, the one the reader is standing in.
 *
 * ── Why this stopped describing the weekend ───────────────────────────────
 *
 * It used to read `status`/`sitesOpen` straight off the summary, and those
 * fields describe `window` — the coming weekend, folded server-side by
 * summarizeWindow, which takes the MINIMUM across the nights of the stay
 * because "8 open Fri–Sun" has to mean eight you can book for both nights.
 *
 * That fold is right for a stay and wrong for a peek. Cedargrove on a Monday:
 * one site free Friday, none Saturday, five Sunday — a two-night minimum of
 * zero, so the card led with "Fully booked" over a strip whose bars were
 * mostly green, including tonight's. Every one of those numbers was true and
 * the headline still told a reader to give up on a campground with room in it
 * for the next four nights.
 *
 * So the hero now speaks for a single night and NAMES it. A single night has
 * no minimum to take, which is the whole of the fix: the number over the strip
 * is the number in the column under it, and the two can no longer disagree.
 *
 * ── Tonight, or the next night Eddy measured ─────────────────────────────
 *
 * Tonight is the question a map pin is being asked — somebody is looking at
 * where they are, now. When tonight was not measured the anchor walks FORWARD
 * to the first night that was, the same direction defaultNight walks and for
 * the same reason: an answer about a night already behind the reader is not an
 * answer. The caption always says which night it is, so the walk is never
 * silent.
 *
 * ── The weekend fold is still the fallback, not a rival ──────────────────
 *
 * A facility with fewer than seven measured nights is sent `nights: []` on
 * purpose (see MIN_STRIP_NIGHTS in the server's camping/read.ts), and there is
 * no night to anchor on. That case keeps the old wording verbatim, weekend
 * label and all — see `windowHero`. It is the only path that still folds.
 *
 * The one-line form on the river screen (`campsiteAvailabilityLine`) and the
 * website's chip still describe the weekend, and that is not a drift: those
 * surfaces are answering "can I book the weekend", this one is answering "what
 * is this pin doing tonight". Both name their window in the words, which is
 * what keeps two true sentences from reading as a contradiction.
 */
export function availabilityHero(
  availability: CampsiteAvailabilitySummary | null | undefined,
  today: string,
  name?: string,
): AvailabilityHero | null {
  if (!availability) return null;

  const bars = nightBars(availability, today);
  // bars[0] IS tonight, so a hit at 0 is the common case and the walk forward
  // costs nothing when it is not needed.
  const index = bars.findIndex((bar) => bar.mark !== 'none');
  if (index === -1) return windowHero(availability, name);

  const bar = bars[index];
  const when = nightLabel(bar.date, index);

  // The next night with room. A booked-out tonight that points at Thursday is
  // still an answer; one that only says "no" sends the reader back to the map
  // to tap the same pin again on a different day.
  const nextIndex = bars.findIndex((b, i) => i > index && b.mark === 'bar');
  const withNext = (caption: string) =>
    nextIndex === -1 ? caption : `${caption} · next open ${nightLabel(bars[nextIndex].date, nextIndex)}`;

  if (bar.mark === 'bar') {
    if (availability.kind === 'backcountry_district') {
      return {
        count: bar.sitesOpen,
        // A district's number means nothing without the district — the permit
        // covers gravel bars twenty river miles apart — so the name rides in
        // the caption where there is one. The night leads it: a caption is one
        // line and truncates from the right, and the day is the part that must
        // survive.
        headline: bar.sitesOpen === 1 ? 'backcountry site' : 'backcountry sites',
        detail: null,
        caption: name ? `${when} · ${name}` : when,
      };
    }
    return {
      count: bar.sitesOpen,
      headline: 'open',
      // This night's own denominator, not the window's. nightBars only marks
      // 'bar' when both counts are above zero, so it is always real here.
      detail: `of ${bar.sitesReservable} sites`,
      caption: when,
    };
  }

  if (bar.mark === 'empty') {
    return { count: null, headline: 'Fully booked', detail: null, caption: withNext(when) };
  }

  // 'dash' — nothing here to fill, and WHY is the whole distinction. A reader
  // who takes a seasonal closure for a booked-out night refreshes for a
  // cancellation that is not coming, and one who takes an unreleased night for
  // a closure drives somewhere else the day before it opens.
  if (bar.status === 'not_yet_released') {
    return { count: null, headline: 'Not yet bookable', detail: null, caption: withNext(when) };
  }
  // Shut for every night Eddy holds is a season, not a night. Said without a
  // date because there is no date to give: the fortnight ends before it reopens.
  if (bars.every((b) => b.mark === 'none' || b.status === 'closed')) {
    return { count: null, headline: 'Closed for the season', detail: null, caption: '' };
  }
  return { count: null, headline: 'Closed', detail: null, caption: withNext(when) };
}

/**
 * The old hero, kept for the one case that has no night to stand on.
 *
 * Verbatim in wording — this is what `campsiteAvailabilityLine` says, split
 * into fields — because a facility below the strip floor is exactly the one
 * whose card and whose river-screen line sit closest together.
 */
function windowHero(
  availability: CampsiteAvailabilitySummary,
  name?: string,
): AvailabilityHero | null {
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
  const hero = availabilityHero(availability, today, name);
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
  /** `Tonight`, `Tomorrow`, or `Fri 8`. Sized for a chip. */
  label: string;
  /**
   * `Tonight`, `Tomorrow`, or `Friday, Aug 14`. Sized for the status line.
   *
   * Two forms of one fact rather than two facts: both are derived here, from
   * the same date, so the line above the list and the chip that selects it
   * cannot name different days. A chip has a row to share and abbreviates; the
   * status line is the sentence that says what the reader is looking at, and
   * `Fri 8` is not a sentence.
   */
  longLabel: string;
  /** Sites open that night, or null when it was not measured. */
  count: number | null;
  /** Sites the night offers at all — the denominator behind `count`. */
  total: number;
  /**
   * How this night's bar is drawn.
   *
   * Carried so a caller can phrase a ZERO correctly. `count: 0` is three
   * different facts — every site taken, the campground shut, the night not yet
   * released — and "0 sites open" is only true of the first.
   */
  mark: NightMark;
  isWeekend: boolean;
  /** The night's own status, or null when it was not measured. See NightBar. */
  status: NightBar['status'];
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
      label: nightLabel(bar.date, index),
      longLabel:
        index === 0
          ? 'Tonight'
          : index === 1
            ? 'Tomorrow'
            : `${WEEKDAY_NAMES[weekdayOf(bar.date)]}, ${MONTHS[month - 1]} ${day}`,
      count: bar.mark === 'none' ? null : bar.sitesOpen,
      total: bar.sitesReservable,
      mark: bar.mark,
      isWeekend: bar.isWeekend,
      status: bar.status,
    };
  });
}

/**
 * One night, named — `Tonight`, `Tomorrow`, `Sat Aug 8`, `Fri 21`.
 *
 * ONE definition, shared by the chips in the Camping tab and by the hero on
 * the card above them, so the headline and the chip a reader taps to check it
 * can never name the same night differently.
 *
 * The first two nights are named rather than dated: somebody scanning for a bed
 * tonight should not have to work out which weekday today is.
 */
function nightLabel(date: string, index: number): string {
  if (index === 0) return 'Tonight';
  if (index === 1) return 'Tomorrow';

  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  // The month earns its place on the first dated night — which has no named
  // neighbour to take its bearing from — and wherever the run crosses into one.
  const withMonth = day === 1 || index === 2 ? `${MONTHS[month - 1]} ` : '';

  return `${longWeekday(date)} ${withMonth}${day}`;
}

/**
 * What the Camping tab says about the night it is showing.
 *
 * ── WHY THIS IS NOT `${count} sites open` ─────────────────────────────────
 *
 * Because three of the four marks produce a zero and only one of them means
 * "every site is taken". A campground shut for the season and a night whose
 * inventory has not been released yet both report `sitesOpen: 0`, and printing
 * that as "0 sites open" tells a reader to keep refreshing for a cancellation
 * that is not coming. The strip already keeps these four apart in SHAPE — see
 * NightStrip — and this is the same distinction in words.
 *
 * Null when the night was never measured, which is the one case with nothing
 * honest to say: the caller draws the day and stops there.
 */
export function nightPhrase(choice: NightChoice): string | null {
  if (choice.mark === 'none') return null;
  if (choice.mark === 'dash') {
    // The shape folds closed and unreleased together because both are "nothing
    // here to fill"; the words must not, and the hero above says the same two
    // things the same way. `not_yet_released` tells a reader to come back when
    // booking opens, which "not offered" would have talked them out of.
    return choice.status === 'not_yet_released' ? 'Not yet bookable' : 'Not offered this night';
  }
  if (choice.mark === 'empty') return 'Fully booked';
  // `bar` is the only mark left, and nightBars only assigns it when BOTH counts
  // are above zero — so the denominator is always real here and needs no guard.
  return `${choice.count ?? 0} of ${choice.total} sites open`;
}

/**
 * Which night the Camping tab opens on.
 *
 * ── ON OR AFTER THE WINDOW, NEVER MERELY "THE FIRST MEASURED" ─────────────
 *
 * The tab wants the weekend the peek's card is describing, because that is the
 * question the reader was answering when they tapped the pin. But an unmeasured
 * night has no chip to select — offering one is a promise the tab cannot keep,
 * which is the rule tabs.ts states — so the preferred date is not always
 * available to open on.
 *
 * Falling back to the first measured night ANYWHERE would walk backwards, and
 * usually all the way back to tonight: the reader would come for a weekend
 * three days out and land on a Tuesday, with the peek above still describing
 * the weekend. So the search runs FORWARD from the window and only gives up
 * backwards when there is nothing ahead of it at all.
 *
 * ISO dates compare correctly as plain strings, which is why the horizon is
 * `YYYY-MM-DD` everywhere in this module and never a Date.
 */
export function defaultNight(
  nights: NightChoice[],
  preferred: string | null | undefined,
): string | null {
  const measured = nights.filter((night) => night.mark !== 'none');
  if (measured.length === 0) return null;
  if (!preferred) return measured[0].date;
  return (measured.find((night) => night.date >= preferred) ?? measured[0]).date;
}

/** `Fri`. Three letters, because a single initial is ambiguous on a chip. */
function longWeekday(date: string): string {
  return WEEKDAY_NAMES[weekdayOf(date)].slice(0, 3);
}

/** The full weekday, for VoiceOver. */
export function spokenWeekday(date: string): string {
  return WEEKDAY_NAMES[weekdayOf(date)];
}
