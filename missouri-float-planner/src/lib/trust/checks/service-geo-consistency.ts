// src/lib/trust/checks/service-geo-consistency.ts
// Service pins against the rivers those services actually serve.
//
// ── The habit this replaces ──────────────────────────────────────────────
//
// Every coordinate written into nearby_services in August 2026 was checked by
// hand against the linked river before the migration ran, because a pin that
// lands nowhere near the water a business serves is almost always the wrong
// business. It rejected seven candidates sitting 79 to 236 miles out — matches
// that name similarity alone would have written, including an "Arapaho" 221
// miles from the Arapaho Campground in Steelville.
//
// Run once across the whole table, the same rule found six rows already filed
// against the wrong river, fixed in 20260810003000. It was a good rule that
// depended on somebody remembering to apply it. This is the remembering.
//
// ── Distance is a MIN across links, never per-link ───────────────────────
//
// The single most important property here. A service may serve several rivers
// and four of them legitimately do: Float Eureka is 4.63 miles from the Kings
// and 13.39 from the War Eagle; Wild Bill's is 1.26 from the Buffalo and 10.63
// from Crooked Creek. Judging each link separately would file a permanent
// finding against both — correct data, flagged forever, which is exactly the
// false positive gauge-wiring.ts opens by refusing to create.
//
// trust_service_geo() therefore returns one row per SERVICE with the minimum
// already taken, and `nearestAnyIsLinked` answers the mis-filing question on its
// own rather than by comparing distances.
//
// ── Geometry proposes; the link stays authoritative ──────────────────────
//
// This check never concludes that a river link is wrong. It cannot: a business
// is linked to what it SERVES, not to what it is near. Steve Dally's shop is in
// Cotter on the White River and he guides Crooked Creek. Of the six divergences
// found in August, two were wrong links and four were MISSING ones — resolved by
// adding a river, not by moving one. Deriving the link from distance would also
// delete the independent cross-check that made the geocoding safe, since a wrong
// pin would then silently produce a matching wrong link.
//
// So this raises a question for a human, and the remediation says so.

import { mustRpc } from '../db';
import type { RawFinding, TrustCheck, TrustCheckContext, TrustCheckResult } from '../types';

/** One row of trust_service_geo(). Numerics arrive from PostgREST as strings. */
export interface ServiceGeoRow {
  service_id: string;
  service_name: string;
  service_type: string | null;
  city: string | null;
  state: string | null;
  linked_river_count: number;
  linked_river_names: string[] | null;
  nearest_linked_name: string | null;
  nearest_linked_miles: number | string | null;
  nearest_any_name: string | null;
  nearest_any_miles: number | string | null;
  nearest_any_is_linked: boolean | null;
}

/**
 * How far a service may sit from the nearest river it serves.
 *
 * Not a fresh judgement — it is the bound the WRITE path already uses.
 * geocode-services-mapbox.ts accepts a candidate within ~10 miles of its river,
 * and 20260809120000 wrote 37 rows under it. A check stricter than the writer
 * would file findings for coordinates the pipeline was entitled to write, and
 * nobody could fix them without loosening the writer.
 *
 * Measured headroom: of 138 located services the furthest legitimate one is
 * Eleven Point Cottages at 6.54 miles — a lodge in Alton town. Deliberately no
 * warning tier below this: a 5-mile band would fire on that row permanently.
 */
export const FAR_FROM_RIVER_MILES = 10;

/**
 * How much nearer an unlinked river must be before the filing is questioned.
 *
 * Two miles, and both sides have room. The smallest TRUE positive measured was
 * Buffalo River Float Service at 8.31 − 3.17 = 5.14 miles, so this sits well
 * under the real cases. Below two it would start firing at confluences on
 * correct data — BSC Outdoors sits where the Big Piney meets the Gasconade and
 * serves both — and rivers.geom is simplified at ~50 m, so sub-mile gaps between
 * two centerlines are inside the geometry's own error.
 */
export const NEARER_OTHER_RIVER_MARGIN_MILES = 2;

function toMiles(value: number | string | null): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Where a service is, for a human reading the finding. */
function place(row: ServiceGeoRow): string {
  const town = [row.city, row.state].filter(Boolean).join(', ');
  return town ? ` (${town})` : '';
}

/** Pure. Turns one row per service into zero or more findings. */
export function deriveServiceGeoFindings(rows: ServiceGeoRow[]): RawFinding[] {
  const findings: RawFinding[] = [];

  for (const row of rows) {
    // The service uuid, never the name.
    //
    // The fingerprint is sha256(checkId|entityType|entityKey|ruleKey), so a key
    // that can be edited is an identity that can be lost. This table renames:
    // 20260809120000 corrected "Three Rivers Outfitters" to "Three River
    // Outfitter" and five other rows in one migration. Under a name key each of
    // those would have resolved the open finding as fixed and opened an
    // identical new one with the recurrence count back at 1.
    const entityKey = row.service_id;
    const linked = row.linked_river_names ?? [];
    const nearestLinkedMiles = toMiles(row.nearest_linked_miles);
    const nearestAnyMiles = toMiles(row.nearest_any_miles);

    if (row.linked_river_count === 0) {
      // Returned by the SQL rather than filtered out on purpose: a service with
      // a pin and no link is invisible to /api/rivers/[slug]/services, so
      // dropping it from scope would let a clean sweep be reported over a
      // population that excludes the rows most likely to be wrong.
      findings.push({
        entityType: 'service',
        entityKey,
        ruleKey: 'service_no_river_link',
        title: `${row.service_name}${place(row)} has a pin but no river`,
        detail: `This service has coordinates and is linked to no river, so it appears in no river's directory and on no map layer that is fetched per river. ${
          row.nearest_any_name
            ? `Its pin is ${nearestAnyMiles?.toFixed(2)} miles from the ${row.nearest_any_name}, which is a candidate rather than an answer — link it to the water it actually serves.`
            : 'No river in the catalog is near its pin, so check the coordinate as well as the link.'
        }`,
        evidence: {
          serviceId: row.service_id,
          serviceName: row.service_name,
          serviceType: row.service_type,
          nearestRiver: row.nearest_any_name,
          nearestRiverMiles: nearestAnyMiles,
        },
      });
      continue;
    }

    if (nearestLinkedMiles !== null && nearestLinkedMiles > FAR_FROM_RIVER_MILES) {
      findings.push({
        entityType: 'service',
        entityKey,
        ruleKey: 'service_far_from_linked_river',
        title: `${row.service_name}${place(row)} is ${nearestLinkedMiles.toFixed(2)} mi from the nearest river it serves`,
        detail: `Nearest linked river is the ${row.nearest_linked_name} at ${nearestLinkedMiles.toFixed(
          2,
        )} miles; it is linked to ${linked.join(', ')}. The write path accepts a coordinate within ${FAR_FROM_RIVER_MILES} miles of a linked river, so either the pin is wrong or the business serves water it is not linked to. Do not assume the pin: of the six divergences found in August 2026, two were the link.`,
        evidence: {
          serviceId: row.service_id,
          serviceName: row.service_name,
          linkedRivers: linked,
          nearestLinkedRiver: row.nearest_linked_name,
          nearestLinkedMiles,
          nearestRiver: row.nearest_any_name,
          nearestRiverMiles: nearestAnyMiles,
          thresholdMiles: FAR_FROM_RIVER_MILES,
        },
      });
    }

    // Deliberately not an `else`: a service can be both too far from everything
    // it is linked to AND sitting on something it is not. Those are two
    // different questions with two different fixes, and the shared entityKey is
    // what lets the console show them as one business with two problems.
    const margin =
      nearestLinkedMiles !== null && nearestAnyMiles !== null
        ? nearestLinkedMiles - nearestAnyMiles
        : null;

    if (
      row.nearest_any_is_linked === false &&
      margin !== null &&
      margin > NEARER_OTHER_RIVER_MARGIN_MILES
    ) {
      findings.push({
        entityType: 'service',
        entityKey,
        ruleKey: 'service_nearer_unlinked_river',
        title: `${row.service_name}${place(row)} sits closer to the ${row.nearest_any_name} than to anything it is linked to`,
        detail: `${nearestAnyMiles?.toFixed(2)} miles from the ${row.nearest_any_name}, which it is NOT linked to, against ${nearestLinkedMiles?.toFixed(
          2,
        )} miles from the ${row.nearest_linked_name}, which it is. Geometry is raising a question, not answering one — a business is linked to the water it serves, not the water it is near, and an outfitter in town may serve neither of the closest. Decide whether this is a missing link or a wrong one.`,
        evidence: {
          serviceId: row.service_id,
          serviceName: row.service_name,
          linkedRivers: linked,
          nearestLinkedRiver: row.nearest_linked_name,
          nearestLinkedMiles,
          nearestRiver: row.nearest_any_name,
          nearestRiverMiles: nearestAnyMiles,
          marginMiles: Number(margin.toFixed(2)),
        },
      });
    }
  }

  // Deterministic, so a run's detail does not churn on row order and
  // last_seen_at keeps meaning "this was still true then". Ruled second so a
  // service with both problems always lists them the same way round.
  return findings.sort(
    (a, b) => a.title.localeCompare(b.title) || a.ruleKey.localeCompare(b.ruleKey),
  );
}

export const serviceGeoConsistencyCheck: TrustCheck = {
  id: 'service_geo_consistency',
  title: 'Service pins against the rivers they serve',
  cadence: 'daily',

  async run(ctx: TrustCheckContext): Promise<TrustCheckResult> {
    const rows = await mustRpc<ServiceGeoRow[] | null>(
      ctx.supabase.rpc('trust_service_geo'),
      'could not read trust_service_geo() for service_geo_consistency',
    );
    const scoped = rows ?? [];

    // One set-based query, so there is no truncation path and `partial` can
    // never be quietly true. Scope is every located service the directory
    // still stands behind; zero means the directory is unreadable or empty,
    // and both deserve reconcile.ts's empty_scope refusal rather than a
    // reported clean sweep.
    return { scopeCount: scoped.length, findings: deriveServiceGeoFindings(scoped) };
  },
};
