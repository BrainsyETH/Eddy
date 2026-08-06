// src/lib/camping/live-index.ts
// Which places Eddy can read live campsite availability for, as two id sets.
//
// ── Why this is a query and shapes.ts holds the rest ──────────────────────
//
// `buildLiveAvailabilityIndex` and the index type live in lib/offline/shapes.ts,
// beside `toAccessPoint`, which is the only thing that consumes them. That file
// is pure shaping with no data access and is worth keeping that way, so the
// fetch lives here with the rest of the campsite reads instead.
//
// ── The untyped client is deliberate, and it is the house style ───────────
//
// The campsite tables postdate the last `npm run db:gen-types`, so they are
// absent from src/types/database.ts and a generically-typed client rejects
// `.from('campsite_facilities')` outright. Every other reader of these tables
// takes a bare SupabaseClient for exactly this reason — see loadFacilitySites in
// ./sites.ts. Regenerating the database types is the real fix and is a job of
// its own; borrowing the existing convention is not a new debt.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildLiveAvailabilityIndex,
  LIVE_AVAILABILITY_SELECT,
  NO_LIVE_AVAILABILITY,
  type LiveAvailabilityIndex,
  type LiveAvailabilityRow,
} from '@/lib/offline/shapes';

/**
 * One row per enabled facility, folded into the two keys an access point can be
 * reached by.
 *
 * Answers NO_LIVE_AVAILABILITY on failure rather than throwing. Both callers are
 * map payloads: a campground losing its booking card is a smaller failure than a
 * river losing its put-ins, and neither endpoint should 500 over a flag.
 */
export async function loadLiveAvailabilityIndex(
  supabase: SupabaseClient,
): Promise<LiveAvailabilityIndex> {
  const { data, error } = await supabase
    .from('campsite_facilities')
    .select(LIVE_AVAILABILITY_SELECT)
    .eq('enabled', true);

  if (error) return NO_LIVE_AVAILABILITY;
  return buildLiveAvailabilityIndex(data as LiveAvailabilityRow[] | null);
}
