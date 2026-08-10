// src/app/api/services/route.ts
// GET /api/services — every outfitter, campground and shuttle Eddy lists that
// can actually be put on a map.
//
// ── Why this exists next to /api/rivers/[slug]/services ────────────────────
//
// That route answers "who serves THIS river" and returns the full directory
// record — booking platform, site counts, fee range, season, NPS campgrounds
// pulled in through access points. It is what the river screen renders, and it
// is the right shape for a page about one river.
//
// The map wants the opposite: every service in the state, and almost none of
// the fields. It draws a pin, and the callout behind it holds a name, a type, a
// town and a phone number. Fetching the per-river directory once per river to
// assemble that would be 25 requests for a layer of pins.
//
// ── Why not in the offline bundle ──────────────────────────────────────────
//
// Because the bundle says so, and its reasoning holds: services are "a
// commercial listing rather than something you navigate or avoid", so they earn
// no place in a payload whose job is to keep a phone useful in a canyon. A
// campground you cannot reach is an inconvenience; a low-water dam you cannot
// see is not. See src/lib/offline/bundle.ts.
//
// ── EVERY ROW, AND THE APP DECIDES WHAT TO DRAW ────────────────────────────
//
// This used to return only rows that were `active` AND already geocoded — 28 of
// 156 — on the argument that "a map layer whose rows have no position would be a
// promise the pins cannot keep". That was right about pins and wrong about the
// response, and filtering here broke three things at once:
//
//   1. THE MAP COULD NOT SAY WHAT IT WAS NOT SHOWING. The layers sheet prints
//      "13 of 81 have a confirmed location" under a tier, which needs the
//      denominator. Rows filtered out server-side cannot be counted client-side,
//      so that note could never render at all.
//
//   2. PROVENANCE WAS INVISIBLE. `geocode_precision` was not selected, so
//      every row arrived with it undefined and no client could tell a
//      corroborated coordinate from a legacy one. Trust is enforced when the
//      backfill WRITES a coordinate (corroborated against the service's
//      river), so the column is provenance, not a render-time filter — but it
//      still has to reach the client to be worth anything.
//
//   3. THE SERVER HELD A SECOND, STRICTER POLICY. `.eq('status', 'active')`
//      dropped 11 `unverified` rows that `serviceEligible` in @eddy/types says
//      to draw — unverified means nobody has re-confirmed the listing, not that
//      the business is gone. So the map and the planner, which reads the
//      per-river route, saw different populations of one table. That is exactly
//      the many-consumers-disagreeing problem the shared predicate was written
//      to end, and it was hiding in the one consumer that fetches from here.
//
// So: every row, plus the two columns the app needs to judge them —
// `status` and `geocode_precision`. Eligibility and mappability are decided in
// one place now (@eddy/types and map/mappable.ts), and this route's job is to
// deliver the facts those functions read.
//
// The payload goes from 28 rows to ~156 — around 30 KB, on a route already
// cached ten minutes at the edge with a day of stale-while-revalidate. The
// fields stay narrow for the reason the header above gives: this is a pin and a
// callout, not the river screen's directory record.

import { NextRequest, NextResponse } from 'next/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { createClient } from '@/lib/supabase/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { toNum } from '@/lib/utils/num';

export const dynamic = 'force-dynamic';

/**
 * Declared here rather than imported from @eddy/types, which is where the app
 * reads the identical shape.
 *
 * Vercel's root directory is missouri-float-planner/, so shippable web code
 * cannot import from packages/ — see CLAUDE.md. The two definitions are checked
 * against each other by the app's own typecheck the moment this response is
 * parsed into a RiverService.
 */
interface MappedService {
  id: string;
  name: string;
  type: string;
  /**
   * Whether the business is still trading, for `serviceEligible`.
   *
   * The app drops `permanently_closed` and `temporarily_closed` and keeps
   * `unverified`. That decision belongs on the client, with every other
   * eligibility rule, rather than half here and half there.
   */
  status: string | null;
  phone: string | null;
  website: string | null;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  /**
   * How the coordinates were obtained (`exact` / `approximate` / null for
   * legacy rows). Provenance only — trust is enforced when a coordinate is
   * written, not at render. See the header for why it must still ship.
   */
  geocodePrecision: string | null;
  description: string | null;
  servicesOffered: string[];
}

interface ServicesResponse {
  services: MappedService[];
}

/**
 * Ten minutes at the edge, a day of stale-while-revalidate.
 *
 * The directory changes when somebody edits it in the admin, which is to say
 * rarely and never urgently — an outfitter's phone number reaching a phone ten
 * minutes late has cost nobody anything.
 */
const S_MAXAGE = 600;
const STALE_WHILE_REVALIDATE = 86400;

const SELECT_COLUMNS =
  'id, name, type, status, phone, website, city, state, latitude, longitude, geocode_precision, description, services_offered';

export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimit(`services-all:${getClientIp(request)}`, 60, 60 * 1000);
    if (limited) return limited;

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('nearby_services')
      // ONE STRING LITERAL, never a concatenation: supabase-js infers the row
      // type by parsing it at compile time, and a `+` collapses it to `string`,
      // which degrades every field below to GenericStringError.
      .select(SELECT_COLUMNS)
      // No status or coordinate filter — see the header. The app decides both,
      // and it needs the rows it decides against in order to count them.
      .order('display_order', { ascending: true, nullsFirst: false });

    if (error) {
      console.error('[services] Error listing services:', error);
      return NextResponse.json({ error: 'Could not fetch services' }, { status: 500 });
    }

    const response: ServicesResponse = {
      services: (data ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        status: s.status ?? null,
        phone: s.phone ?? null,
        website: s.website ?? null,
        city: s.city ?? null,
        state: s.state ?? null,
        // numeric(9,6) arrives as a string over PostgREST, and a string
        // longitude reaches a map as NaN rather than as an error.
        latitude: toNum(s.latitude),
        longitude: toNum(s.longitude),
        geocodePrecision: s.geocode_precision ?? null,
        description: s.description ?? null,
        servicesOffered: s.services_offered ?? [],
      })),
    };

    return NextResponse.json(response, {
      headers: cdnCacheHeaders(S_MAXAGE, STALE_WHILE_REVALIDATE),
    });
  } catch (error) {
    console.error('[services] Error listing services:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
