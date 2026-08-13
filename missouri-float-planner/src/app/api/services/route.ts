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
  /**
   * The access point this row is the same place as, or null.
   *
   * `same_place` only — see IDENTITY_RELATIONSHIP. The app prefers this over its
   * proximity radius and collapses the two into one marker, so a row that
   * reaches the phone with a merely-nearby id here erases a real place from the
   * map. That is why the filter is server-side: an older build cannot re-apply
   * it.
   */
  accessPointId: string | null;
  description: string | null;
  servicesOffered: string[];
  /**
   * The rivers this service serves, by slug.
   *
   * ── Why the statewide route carries this at all ─────────────────────────
   *
   * The header above says this response is "a pin and a callout, not the river
   * screen's directory record", and that is still true — this is not the
   * directory record arriving by the back door, it is the ONE fact a pin cannot
   * be grouped by without.
   *
   * The map sheet's river tab lists the campgrounds and outfitters on the river
   * you tapped, and that sheet's whole contract is that it makes no request:
   * tapping a river is the cheapest interaction on the map and has to stay that
   * way. Without a river on the row, answering "who serves the Meramec" from a
   * response the app already holds is impossible, and the alternatives are both
   * worse — 25 per-river requests for what one call already returned, or
   * guessing from proximity, which would put a Current River outfitter on the
   * Jacks Fork wherever the two run close.
   *
   * SLUGS rather than ids, because the slug is what every client-side surface
   * keys a river by. Sending ids would make the app hold a second lookup to
   * answer a question the server can answer once.
   *
   * Possibly EMPTY, and that is not a defect: `service_rivers` is curated, and a
   * row nobody has linked yet simply belongs to no river tab. It still draws as
   * a pin and still appears in the statewide layers, exactly as before.
   */
  riverSlugs: string[];
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

/**
 * The one relationship that means "the same physical place you drive to".
 *
 * `located_at` and `nearby` are deliberately excluded, and the distinction is
 * load-bearing rather than pedantic. `located_at` says a campground and an
 * access point belong to one facility — true of Meramec State Park, whose two
 * rows are 2 956 m apart. Shipping that here would have the app collapse them
 * into one marker, which does not merely merge two pins: it removes the
 * campground's real location from the map and sends anybody looking for it to a
 * boat ramp three kilometres away. A duplicate pin is the lesser harm.
 *
 * So the app is told about identity and nothing else, and the two weaker
 * relationships stay server-side where they can route availability without
 * touching a marker.
 */
const IDENTITY_RELATIONSHIP = 'same_place';

interface IdentityLinkRow {
  access_point_id: string;
  nearby_service_id: string;
}

/**
 * service id → the access point it is the same place as.
 *
 * ── A SEPARATE READ, and a cast, both for stated reasons ─────────────────
 *
 * Separate rather than embedded in SELECT_COLUMNS because that has to stay one
 * string literal for supabase-js to infer the row type, and an embedded
 * resource inside it would widen every field on the service row through the
 * join. Two small reads behind a ten-minute edge cache is the cheaper trade.
 *
 * Cast because `access_point_services` is newer than the last `db:gen-types`
 * run, so the typed client does not know the table. The row shape is declared
 * above and asserted at this one call site; hand-editing the generated
 * `database.ts` is what CLAUDE.md forbids and the next regeneration would undo.
 *
 * ── AND verified_at IS ASKED FOR TWICE, ON PURPOSE ──────────────────────
 *
 * A `same_place` row without a verified_at cannot exist — the database rejects
 * it (access_point_services_same_place_is_verified). This filter is therefore
 * asking for something already guaranteed, which is exactly when a filter is
 * worth having: it is the half that survives the constraint being dropped, a
 * restore from a backup that predates it, or a future relationship value added
 * without thinking this through. The cost is one predicate; the failure it
 * guards against is a marker silently deleted from the map.
 *
 * ── FAILURE IS DEGRADATION, NOT A 500 ────────────────────────────────────
 *
 * A missing or unreadable link table returns an empty map and the app falls
 * back to its proximity radius, which is exactly how it behaved before these
 * links existed. The map going down because an identity table is unavailable
 * would be strictly worse than the duplicate pins it prevents — but it is
 * logged, because silently drawing two pins for one place is the bug this whole
 * path exists to fix and it must not become invisible.
 */
async function loadIdentityLinks(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Map<string, string>> {
  const byService = new Map<string, string>();
  try {
    const { data, error } = await (
      supabase as unknown as {
        from: (table: string) => {
          select: (columns: string) => {
            eq: (
              column: string,
              value: string,
            ) => {
              not: (
                column: string,
                operator: string,
                value: null,
              ) => Promise<{
                data: IdentityLinkRow[] | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      }
    )
      .from('access_point_services')
      .select('access_point_id, nearby_service_id')
      .eq('relationship', IDENTITY_RELATIONSHIP)
      .not('verified_at', 'is', null);

    if (error) {
      console.error('[services] Could not read access_point_services:', error.message);
      return byService;
    }
    for (const link of data ?? []) {
      if (link.nearby_service_id && link.access_point_id) {
        byService.set(link.nearby_service_id, link.access_point_id);
      }
    }
  } catch (err) {
    console.error('[services] Could not read access_point_services:', err);
  }
  return byService;
}

interface ServiceRiverRow {
  service_id: string;
  rivers: { slug: string } | { slug: string }[] | null;
}

/**
 * service id → the slugs of the rivers it serves.
 *
 * ── A SEPARATE READ, for the reason loadIdentityLinks is ─────────────────
 *
 * SELECT_COLUMNS has to stay one string literal for supabase-js to infer the
 * row type, and an embedded resource inside it widens every field on the
 * service row through the join. Two small reads behind a ten-minute edge cache
 * is the same trade already made above, and it keeps the pin's own columns
 * narrow.
 *
 * ── FAILURE IS DEGRADATION, NOT A 500 ───────────────────────────────────
 *
 * An unreadable join returns an empty map, every service arrives with no
 * rivers, and the river sheet's services tab simply does not qualify — while
 * every pin, every layer and every count on the map behaves exactly as it did
 * before this field existed. A tab that is absent is the documented failure
 * mode; a map that will not load is not. Logged, because a silently empty tab
 * on every river is otherwise indistinguishable from a directory nobody has
 * filled in.
 */
async function loadRiverSlugs(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Map<string, string[]>> {
  const byService = new Map<string, string[]>();
  try {
    const { data, error } = await supabase
      .from('service_rivers')
      .select('service_id, rivers(slug)');

    if (error) {
      console.error('[services] Could not read service_rivers:', error.message);
      return byService;
    }
    for (const link of (data ?? []) as unknown as ServiceRiverRow[]) {
      if (!link.service_id || !link.rivers) continue;
      // PostgREST returns an embedded to-one as an object and a to-many as an
      // array depending on how it reads the foreign key, so both are accepted
      // rather than assuming the shape that happens to come back today.
      const rivers = Array.isArray(link.rivers) ? link.rivers : [link.rivers];
      const slugs = rivers.map((river) => river?.slug).filter((slug): slug is string => !!slug);
      if (!slugs.length) continue;
      const existing = byService.get(link.service_id);
      if (existing) existing.push(...slugs.filter((slug) => !existing.includes(slug)));
      else byService.set(link.service_id, slugs);
    }
  } catch (err) {
    console.error('[services] Could not read service_rivers:', err);
  }
  return byService;
}

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

    // Independent reads over independent tables — one round trip, not two.
    const [accessPointByService, riverSlugsByService] = await Promise.all([
      loadIdentityLinks(supabase),
      loadRiverSlugs(supabase),
    ]);

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
        accessPointId: accessPointByService.get(s.id) ?? null,
        description: s.description ?? null,
        servicesOffered: s.services_offered ?? [],
        riverSlugs: riverSlugsByService.get(s.id) ?? [],
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
