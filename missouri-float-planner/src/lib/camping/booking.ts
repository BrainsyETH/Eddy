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
  const url = row?.nearby_services?.reservation_url;
  if (!row || !url) return null;

  return { url, source: row.source as CampingSource };
}
