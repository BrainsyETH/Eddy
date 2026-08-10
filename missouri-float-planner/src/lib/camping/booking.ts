// src/lib/camping/booking.ts
// The one link that takes a booking, for a campground Eddy also lists as an
// access point.
//
// ── WHY THIS IS A SEPARATE READ FROM AVAILABILITY ─────────────────────────
//
// Both answers come off the same `campsite_facilities` row, so folding this
// into loadAvailability would save a query. It would also make the booking
// button blink out whenever this weekend's numbers went stale.
//
// loadAvailability drops a facility for reasons that are all about the CALENDAR
// — nights older than MAX_AGE_MS, a weekend the sync did not cover, nothing
// reservable in the window. None of those are reasons to stop telling somebody
// where to book. A campground's reservation URL is a property of the place and
// changes about as often as the place does, so it must not ride on the freshest
// three days of scraped inventory.
//
// So: one small query, keyed by the access point, gated by the caller on the
// row being a campground at all.
//
// ── WHY `nearby_services.reservation_url` AND NOT `official_site_url` ─────
//
// This is the field PR #1173 said it would take, and the distinction it drew is
// the whole reason this file exists. `official_site_url` is a park page in every
// row Eddy holds — mostateparks.com/park/meramec-state-park and its siblings —
// and a button promising a booking that lands on a description page spends the
// one affordance the Camping tab has. `reservation_url` is a purpose-built
// column ('Direct booking/reservation URL', migration 00082); reading it is a
// schema read, not an inference about where a URL probably points.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CampingSource } from './types';

/* ── The URL has to be the provider the button names ──────────────────────── */

/**
 * Which hosts each provider actually books through.
 *
 * ── WHY AN ALLOWLIST AND NOT A SANITY CHECK ───────────────────────────────
 *
 * The button says "Book on Recreation.gov". That is a CLAIM ABOUT THE
 * DESTINATION, and #1173 exists because a claim like it went unchecked: a URL
 * that reads as a reservation link, labelled with a provider, landing on a page
 * that takes no bookings. Requiring https and a well-formed URL would not have
 * caught that — `https://mostateparks.com/park/meramec-state-park` is both.
 * Only the host answers the question the label is asking.
 *
 * The column makes this concrete rather than theoretical. `reservation_url`
 * across the whole directory holds fareharbor.com, vrbo.com, hipcamp.com,
 * roverpass.com, reserve.arkansasstateparks.com and one private LLC's website —
 * every one of them a legitimate booking link for the OUTFITTER it belongs to,
 * and every one of them a lie under a button reading "Book on Recreation.gov".
 * Only a facility link separates those rows from these today, so the invariant
 * is one join away from being wrong.
 *
 * ── THE COST, STATED ──────────────────────────────────────────────────────
 *
 * A provider that moves to a new host loses its button until this table learns
 * the host. That is the same conservative default the rest of this file picks —
 * no button beats a button that lies — and it is logged rather than silent. The
 * "Official site" and "Campground page" rows still render, so the reader keeps
 * a way through.
 *
 * `usedirect.com` is here because icampmo.com is a redirect to
 * `icampmo.usedirect.com/MSPWeb/` — the same booking system under the name it
 * resolves to, which is what a row would hold if anybody ever stored the
 * resolved URL.
 */
const PROVIDER_HOSTS: Record<CampingSource, readonly string[]> = {
  recreation_gov: ['recreation.gov'],
  mo_state_parks: ['icampmo.com', 'usedirect.com'],
};

/** `recreation.gov` and `www.recreation.gov`, but never `notrecreation.gov`. */
function servedBy(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * A reservation URL fit to put behind a button that names its provider, or null.
 *
 * Rejects, in order: anything unparseable, anything not https, anything
 * carrying embedded credentials, and anything hosted somewhere this provider
 * does not book.
 *
 * HTTPS RATHER THAN HTTP-OR-HTTPS. Every stored reservation URL is already
 * https, so this costs nothing today, and the one thing this button is for is
 * sending somebody to type payment details. A cleartext page is not a
 * destination Eddy should promote, and silently upgrading the scheme would be
 * inventing a URL nobody verified.
 *
 * `user:pass@host` is refused because a credentialed URL is a phishing shape
 * before it is anything else, and no booking system needs one.
 */
export function bookingUrlFor(
  source: CampingSource,
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    console.error(`[camping] reservation URL is not a URL: ${raw}`);
    return null;
  }

  if (url.protocol !== 'https:' || url.username || url.password) {
    console.error(`[camping] refusing reservation URL, not a plain https link: ${raw}`);
    return null;
  }

  const allowed = PROVIDER_HOSTS[source];
  if (!allowed?.some((domain) => servedBy(url.hostname.toLowerCase(), domain))) {
    // Loud, because this is a data defect and not a user's problem: the row
    // claims a provider it does not point at. Fix it in the row.
    console.error(
      `[camping] reservation URL host ${url.hostname} does not book through ${source}: ${raw}`,
    );
    return null;
  }

  return raw;
}

/**
 * Where to book, and which system it is.
 *
 * `source` comes off `campsite_facilities.source`, which a CHECK constrains to
 * two values — NOT off `nearby_services.booking_platform`, which is free text
 * and holds 26 distinct spellings including both `fareharbor` and `FareHarbor`,
 * both `recreation_gov` and `recreation.gov`, and one row whose "platform" is a
 * hostname. A label rendered from that column would eventually print one of
 * them at a reader.
 */
export interface BookingLink {
  url: string;
  source: CampingSource;
}

interface FacilityRow {
  source: string;
  // PostgREST embeds a to-one FK as an object; typed loosely because the
  // generated row type does not describe embeds.
  nearby_services: { reservation_url: string | null } | null;
}

/**
 * The booking link for the campground this access point IS, or null.
 *
 * Null is the common answer and not an error: 64 of Eddy's 95 campground access
 * points have no facility row at all, and a facility can be linked for
 * availability while its directory row holds no reservation URL.
 *
 * At most one row can match — `campsite_facilities_access_point_unique` is a
 * unique index on `access_point_id` — so this is a `maybeSingle`.
 */
export async function loadBookingLink(
  supabase: SupabaseClient,
  accessPointId: string,
): Promise<BookingLink | null> {
  const { data, error } = await supabase
    .from('campsite_facilities')
    .select('source, nearby_services(reservation_url)')
    .eq('access_point_id', accessPointId)
    .eq('enabled', true)
    .maybeSingle();

  if (error) {
    // A booking button is an enhancement. A page that cannot read this renders
    // exactly as it did before the button existed, rather than 500.
    console.error('[camping] booking link read failed:', error.message);
    return null;
  }

  const row = data as unknown as FacilityRow | null;
  if (!row) return null;

  const source = row.source as CampingSource;
  // Checked, not merely present: the label this URL is about to appear under
  // names a provider, and nothing upstream guarantees the row agrees.
  const url = bookingUrlFor(source, row.nearby_services?.reservation_url);
  if (!url) return null;

  return { url, source };
}
