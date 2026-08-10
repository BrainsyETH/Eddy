// eddy-ios/src/components/map-sheet/campgroundFacts.ts
// The campground's fixed inventory, as two lines instead of nine rows.
//
// ── NINE ROWS FOR NINE NUMBERS ────────────────────────────────────────────
//
// "About this campground" spent a labelled row on each of Sites, Reservable,
// First come, Tent only, RV only, Electric, Group and Walk or boat in. Every
// one of them is a single integer, every one carried a 96pt label column, and
// on a site that breaks its inventory down they stacked into most of a screen
// of scrolling to say what fits on two lines. The reader arrives at this table
// having already decided they want the place; it is reference, not the decision,
// and reference that costs a screen gets skipped.
//
// They also collapse along two natural axes rather than one, which is why this
// is two functions and not a single "summary":
//
//   what the sites ARE      52 · tent 12 · RV 1 · electric 42 · group 8
//   how you GET one         42 reservable · 10 first come
//
// Splitting them the other way — "52 sites, 42 of them reservable, 12 of them
// tents" — reads as one sentence about overlapping sets, and they do overlap:
// an electric site can be reservable and the numbers do not add up to the total.
// Two lines under two labels make no claim about how the sets intersect.
//
// ── ZERO AND ABSENT ARE BOTH LEFT OUT ─────────────────────────────────────
//
// This is the rule the old `countOrNull` already applied per row and it moves
// here intact: "RV only: 0" is a sentence about the database, not about the
// campground. The NPS record leaves most of these fields empty, so a line that
// printed its zeroes would be mostly zeroes.
//
// ── A pure .ts module, on purpose ─────────────────────────────────────────
//
// The web suite type-checks and runs this file (the Expo app has no runner of
// its own) and resolves `@/*` to its OWN src/, so nothing here may import
// through the app alias or from a .tsx. Same constraint as tabs.ts, peekSlot.ts
// and availability.ts — see their headers.

import type { NpsCampgroundSummary } from '@eddy/types';

/** A count worth printing, or nothing. Zero is not a fact about a campground. */
function counted(count: number | null | undefined, label: string): string | null {
  return count && count > 0 ? `${label} ${count}` : null;
}

/**
 * The site breakdown, most general first.
 *
 * The total leads and stands alone — it is the only one of these that is not a
 * subset — and the named kinds follow in the order that changes a plan most:
 * whether a tent is welcome, whether a camper fits, whether there is power,
 * whether a group can be together, and last whether you have to carry in.
 *
 * Returns null when the record breaks nothing down and has no total, which is
 * every campground with no NPS row at all. `Fact` already renders nothing for a
 * null value, so the row simply does not appear.
 */
export function siteMixLine(nps: NpsCampgroundSummary | null | undefined): string | null {
  if (!nps) return null;

  const parts = [
    nps.totalSites > 0 ? String(nps.totalSites) : null,
    counted(nps.sitesTentOnly, 'tent'),
    counted(nps.sitesRvOnly, 'RV'),
    counted(nps.sitesElectrical, 'electric'),
    counted(nps.sitesGroup, 'group'),
    counted(nps.sitesWalkBoatTo, 'walk or boat in'),
  ].filter(Boolean);

  return parts.length ? parts.join(' · ') : null;
}

/**
 * How the sites are taken, when the record says.
 *
 * Kept off the line above because it answers a different question and because
 * the two sets overlap — see the header. A site that is neither reservable nor
 * first-come exists (day-use, host, closed loop), so these are not required to
 * sum to the total and nothing here pretends they do.
 */
export function bookingLine(nps: NpsCampgroundSummary | null | undefined): string | null {
  if (!nps) return null;

  const parts = [
    nps.sitesReservable > 0 ? `${nps.sitesReservable} reservable` : null,
    nps.sitesFirstCome > 0 ? `${nps.sitesFirstCome} first come` : null,
  ].filter(Boolean);

  return parts.length ? parts.join(' · ') : null;
}
