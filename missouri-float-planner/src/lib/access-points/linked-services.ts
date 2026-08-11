// src/lib/access-points/linked-services.ts
// The directory rows an access point is linked to, and what they are allowed to
// bring with them.
//
// ── WHY THIS EXISTS ────────────────────────────────────────────────────────
//
// `access_point_services` recorded a relationship and routed nothing. The map
// read `same_place` to decide which marker to draw, and that was the whole of
// it: availability and booking still resolved through `campsite_facilities`, so
// the eight verified links changed no sheet and answered no question. A
// relationship table nothing reads is a claim about the future.
//
// It also left the marker resolver holding a trade it could not close.
// Absorbing a service carries its MARKS and never its CONTENT — a phone number
// attached to the wrong campground is worse than no phone number, and ~200 m is
// evidence rather than proof (ADR 0008). So the winning pin drew for a place
// whose phone, booking link and description sat on the record it had just
// dropped. Proximity cannot fix that, because proximity is the thing that is
// not proof. A verified link is.
//
// ── WHICH RELATIONSHIPS ROUTE CONTENT, AND WHY BOTH ───────────────────────
//
// `same_place` and `located_at`, and deliberately not `nearby`.
//
//   same_place   one arrival point. The service IS this access point, so its
//                content is this place's content.
//   located_at   one facility, two destinations. Meramec's campground is 3 km
//                from its river access and keeps its own marker — but its
//                booking link is still the answer to "can I sleep at Meramec
//                State Park", asked from either end.
//   nearby       a fact about geography. Routing content on it would put a
//                neighbouring business's phone number on a put-in, which is the
//                exact harm the relationship split exists to prevent.
//
// This is what makes `located_at` do something. Alley Spring, Round Spring and
// Washington State Park each have a facility row naming their directory service
// and no `access_point_id`, so their availability could not reach the sheet a
// reader taps. It reaches it through here.
//
// ── ONE READ, GATED BY THE CALLER ─────────────────────────────────────────
//
// Every access point that is campgroundish pays for this; a plain put-in does
// not. Same gate as availability and booking, for the same reason.

import type { SupabaseClient } from '@supabase/supabase-js';

/** The relationships that say this service's content belongs to this place. */
const CONTENT_RELATIONSHIPS = ['same_place', 'located_at'];

/**
 * A linked directory row, as much of one as the sheet renders.
 *
 * Deliberately narrow. This is not the river screen's directory record — it is
 * the handful of fields an access point's sheet has somewhere to put, and a
 * wider select would invite the next reader to render a field the sheet has no
 * slot for.
 */
export interface LinkedService {
  id: string;
  name: string;
  type: string;
  phone: string | null;
  website: string | null;
  reservationUrl: string | null;
  description: string | null;
  /** Which claim brought it here. `same_place` is this place; `located_at` is its facility. */
  relationship: string;
}

interface LinkRow {
  relationship: string;
  nearby_services: {
    id: string;
    name: string;
    type: string;
    phone: string | null;
    website: string | null;
    reservation_url: string | null;
    description: string | null;
    status: string | null;
  } | null;
}

/**
 * The directory rows linked to this access point, closed businesses dropped.
 *
 * ── FAILURE IS ABSENCE, NOT AN ERROR ──────────────────────────────────────
 *
 * An unreadable link table returns an empty list and the sheet renders exactly
 * as it did before this file existed. A detail page that 500s because a
 * relationship table is unavailable would be a strictly worse outcome than the
 * content it was fetching — but it is logged, because silence here is a sheet
 * quietly missing a booking button.
 */
export async function loadLinkedServices(
  supabase: SupabaseClient,
  accessPointId: string,
): Promise<LinkedService[]> {
  const { data, error } = await supabase
    .from('access_point_services')
    .select(
      'relationship, nearby_services(id, name, type, phone, website, reservation_url, description, status)',
    )
    .eq('access_point_id', accessPointId)
    .in('relationship', CONTENT_RELATIONSHIPS);

  if (error) {
    console.error('[access-points] linked services read failed:', error.message);
    return [];
  }

  const rows = (data ?? []) as unknown as LinkRow[];
  return rows
    .filter((row) => row.nearby_services != null)
    .filter(
      // The same eligibility rule every other consumer of this table applies.
      // A permanently closed business is not a fact about this place worth
      // putting on its sheet, and `unverified` stays — it means nobody has
      // re-confirmed the listing, not that the business is gone.
      (row) =>
        row.nearby_services!.status !== 'permanently_closed' &&
        row.nearby_services!.status !== 'temporarily_closed',
    )
    .map((row) => ({
      id: row.nearby_services!.id,
      name: row.nearby_services!.name,
      type: row.nearby_services!.type,
      phone: row.nearby_services!.phone,
      website: row.nearby_services!.website,
      reservationUrl: row.nearby_services!.reservation_url,
      description: row.nearby_services!.description,
      relationship: row.relationship,
    }));
}

/**
 * The directory's vocabulary, in the embedded entry's.
 *
 * `nearby_services.type` is the Postgres enum — outfitter, campground,
 * cabin_lodge — and `NearbyService.type` is the hand-curated JSONB's, which
 * spells the third one `lodging`. Mapping rather than passing through, because
 * an entry typed `cabin_lodge` reaches `serviceTiers` through the embedded
 * vocabulary and falls to the kind floor under the wrong name.
 *
 * Unknown values become `outfitter`, which is the same visible-but-generically-
 * labelled fallback the tier classifier takes, for the same reason: a service
 * under a broad heading beats a service nobody can see.
 */
function embeddedType(directoryType: string): string {
  if (directoryType === 'campground') return 'campground';
  if (directoryType === 'cabin_lodge') return 'lodging';
  return 'outfitter';
}

/**
 * The embedded service list an access point's sheet renders, with its linked
 * rows folded in.
 *
 * ── WHY MERGE RATHER THAN ADD A SECOND FIELD ──────────────────────────────
 *
 * The sheet already groups `nearbyServices` by tier and renders each group —
 * Overview's "Camping nearby", Place's outfitters and lodging sections. A
 * parallel `linkedServices` field would need every one of those surfaces to
 * learn about it, and the two lists answer the same question: what else is at
 * this place. So the canonical rows join the list the sheet already draws, and
 * no component changes.
 *
 * It is also the direction horizon 2d is going. `access_points.nearby_services`
 * is a hand-curated duplicate slated for deletion once its entries become
 * references to canonical rows; this is what a reference looks like when it
 * arrives.
 *
 * ── THE CANONICAL ROW WINS A COLLISION ────────────────────────────────────
 *
 * Matched on name, case- and space-insensitively, because that is how the
 * embedded entries were curated and `db:check-services` measured the result:
 * of 27 matched entries, 27 were strict SUBSETS of their directory row and 0
 * contradicted it. Every embedded copy knows strictly less, so replacing one
 * loses nothing — which is the strongest argument for 2d that script can print,
 * and the reason this is a replace rather than a merge of fields.
 */
export function withLinkedServices(
  embedded: readonly { name: string; type: string; phone?: string; website?: string }[],
  linked: readonly LinkedService[],
): { name: string; type: string; phone?: string; website?: string }[] {
  const key = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');
  const linkedKeys = new Set(linked.map((service) => key(service.name)));

  const fromLinks = linked.map((service) => ({
    name: service.name,
    type: embeddedType(service.type),
    ...(service.phone ? { phone: service.phone } : {}),
    ...(service.website ? { website: service.website } : {}),
  }));

  return [...fromLinks, ...embedded.filter((entry) => !linkedKeys.has(key(entry.name)))];
}
