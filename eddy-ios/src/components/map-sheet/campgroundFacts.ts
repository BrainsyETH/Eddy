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

import type { CampsiteAvailabilitySummary, NpsCampgroundSummary } from '@eddy/types';

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

/* ── The one link that takes a booking ────────────────────────────────────── */

/**
 * Where the reader goes, and what to call it.
 *
 * ── A BUTTON NEEDS EXACTLY ONE DESTINATION ────────────────────────────────
 *
 * "Book" was a section of up to three LinkRows — the reservation system, the
 * park's own website, and the NPS campground page — and only the first of them
 * takes a booking. Three rows of equal weight under one heading make the reader
 * pick which is the way to pay, on the tab whose whole purpose is that they can.
 * So the booking link becomes the tab's button and the other two stay rows.
 *
 * ── NAMING THE DESTINATION IS NOT DECORATION ──────────────────────────────
 *
 * This leaves the app. A button that says "Book" and hands somebody to Safari
 * has told them nothing about where they are going or which account they will
 * need; "Book on Recreation.gov" is the difference between a link and a
 * surprise. `source` is a closed union of exactly two providers, so the name is
 * always one Eddy actually knows.
 */
export interface BookingAction {
  url: string;
  label: string;
}

/** How each provider is named in a sentence, preposition and all. */
const PROVIDER: Record<CampsiteAvailabilitySummary['source'], string> = {
  recreation_gov: 'on Recreation.gov',
  mo_state_parks: 'at Missouri State Parks',
};

export function bookingAction(
  nps: NpsCampgroundSummary | null | undefined,
  source: CampsiteAvailabilitySummary['source'] | null | undefined,
): BookingAction | null {
  // A real reservation URL always wins. It is the only field in the record that
  // is a booking system rather than a page about one.
  if (nps?.reservationUrl) {
    return {
      url: nps.reservationUrl,
      label: source ? `Book ${PROVIDER[source]}` : 'Book a site',
    };
  }

  // ── THE STATE-PARK CASE WAS A GUESS, AND THE DATA SAYS IT WAS WRONG ─────
  //
  // This used to return `officialSiteUrl` with a "Book at Missouri State Parks"
  // label whenever `source === 'mo_state_parks'`, arguing that live inventory
  // from a provider proves the official site is that provider's booking system.
  // The inference is wrong, and every row in the database disproves it: the two
  // state parks Eddy holds carry
  // `https://mostateparks.com/park/meramec-state-park` and its Onondaga twin,
  // which are park DESCRIPTION pages. Missouri's actual reservation system is
  // https://icampmo.com, and Eddy already knows that — it is stored as
  // `nearby_services.reservation_url` with `booking_platform = 'icampmo'`
  // (migration 00084). It has simply never been on the wire.
  //
  // Reading live inventory out of a provider is evidence that the PROVIDER
  // takes bookings. It is not evidence about where a particular URL points, and
  // those are the two different claims this conflated. A button promising a
  // booking and landing on a park page is worse than no button: the reader has
  // spent the one affordance the tab exists for and arrives somewhere that
  // cannot take their money.
  //
  // So: no button without a real reservation URL. The official site still
  // renders, as the "Official site" row it always was — see the Camping tab,
  // where `showOfficialSite` is gated only on the URL differing from the
  // button's, so removing the button reveals the row rather than losing the
  // link.
  //
  // TO BRING THE BUTTON BACK, plumb `nearby_services.reservation_url` and
  // `booking_platform` through the access-detail response. That is a schema
  // read and an API field, not a heuristic, and it is the only thing that
  // turns this into a promise Eddy can keep. `officialSiteUrl` is no longer a
  // parameter, because a function that takes a URL it must not use invites
  // somebody to use it.
  return null;
}
