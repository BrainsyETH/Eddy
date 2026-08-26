// src/lib/trust/checks/float-endpoint-eligibility.ts
// `is_float_endpoint` against what the record says it is.
//
// ── Why a check and not a better default ─────────────────────────────────
//
// 20260823190713 added `is_float_endpoint` with DEFAULT FALSE, because the two
// ways of being wrong are not equally bad: a launch wrongly marked ineligible is
// visible-but-unselectable and gets reported the first time somebody looks for
// it, while a park wrongly marked eligible offers a put-in where there is no
// ramp. Opt-in fails toward the safe answer.
//
// The price of that choice is the FIRST direction going unnoticed. Nobody files
// a bug for a put-in that was never offered — it just quietly is not there, and
// the planner looks complete because it is full of other points. So the default
// is not the control; this is. Both directions are reported, and neither is left
// to whoever remembered to set a column.
//
// ── What it deliberately does NOT flag ───────────────────────────────────
//
// 97 approved rows carry an EMPTY `types` array — the roles axis of ADR 0008 is
// about a third unpopulated, which is the whole reason the planner could not be
// gated on roles in the first place. A row that has not said what it is cannot
// be judged against what it says it is, and flagging all 97 would produce a
// permanent wall of findings that says nothing except "the backfill has not
// happened yet". That backfill is tracked work, not a per-row defect.
//
// Nor does it flag every campground: a campground WITH a boat ramp is a launch,
// and plenty are. Only a row whose roles are all non-launch — a park, a
// campground, and nothing you could put a boat in from — is a claim that
// contradicts its own eligibility.
//
// ── Roles are not the only way to be un-launchable ───────────────────────
//
// The roles axis answers "could you get a boat into the water here", and that
// is not the whole question a picker asks. A float trip needs a VEHICLE at both
// ends, so a place you can only arrive at BY river cannot be a put-in or a
// take-out however good its bank is.
//
// The six USFS float camps on the Eleven Point are exactly that: primitive
// boat-in camps, `road_access` "NO ROAD ACCESS", `parking_info` "No vehicle
// access. River only." — and all six were offered as endpoints. Five happened
// to be caught by the roles rule because each carries `campground` alone, but
// that was luck twice over:
//
//   - Adding `gravel_bar` (which is physically true — you land on one) would
//     have silenced the finding and left them in the picker.
//   - The sixth, Greenbriar, was never caught at all. Its `types` is the empty
//     array, so the roles rule correctly declined to judge it, and it sat in
//     the put-in picker beside five neighbours that were being reported daily.
//
// Road reachability is a separate claim from roles, it is recorded on the row,
// and it gets its own rule.
//
// It also runs in the OTHER direction, which is why it is a guard and not just
// a third finding: a boat-in camp that is correctly `is_float_endpoint = false`
// must not be reported as "a launch nobody can choose". It is a launch nobody
// SHOULD choose, and saying otherwise would send somebody to flip the flag.

import type { RawFinding, TrustCheck, TrustCheckContext, TrustCheckResult } from '../types';
// Shared with the importer that writes the column and the admin route that
// offers a default for it. A check that disagreed with the pipeline feeding it
// would open a finding on every correctly-imported row.
import { isLaunchRole } from '@/lib/access-points/launch-roles';

export interface EndpointEligibilityRow {
  id: string;
  name: string;
  slug: string | null;
  type: string | null;
  types: string[] | null;
  approved: boolean | null;
  is_float_endpoint: boolean | null;
  /**
   * Mile from the headwaters, and NULL is the case this file now reports.
   *
   * `toAccessPoint` (src/lib/offline/shapes.ts) maps NULL to 0 because
   * `riverMile: number` is not nullable on the wire and the mapper is shared
   * with the offline bundle. So a missing mile does not read as missing
   * anywhere downstream — it reads as the HEADWATERS, and the row sorts ahead
   * of its whole river.
   */
  river_mile_downstream: number | null;
  river_slug: string | null;
  /** Free text. See isVehicleUnreachable() for why it is read so narrowly. */
  road_access: string | null;
  /** The other field the same declaration lands in. Also free text. */
  parking_info: string | null;
}

/**
 * Anchored on purpose, because `road_access` is prose and both ways of being
 * wrong about it are expensive.
 *
 * The ingestion pipeline writes the disqualifying case as a LEADING
 * declaration — "NO ROAD ACCESS", or "NO ROAD ACCESS. Primary access by river
 * from Riverton." — so matching the head of the string catches every live
 * instance. A loose `includes('no road access')` would also catch "gravel road,
 * no road access issues" and "no road access fee", and a false positive here
 * does two bad things at once: it files a finding asking somebody to pull a
 * real launch out of the planner, and it suppresses `launch_not_selectable` on
 * that same row, hiding the opposite defect behind the mistake.
 *
 * A miss is the cheaper error and is covered: anything this does not catch
 * still falls through to the roles rules, which is how these five were found in
 * the first place.
 *
 * The trailing lookahead is what makes anchoring enough. Without it a leading
 * "No road access fee." matches — the phrase is there, at the front, and the
 * sentence means the opposite. Requiring the declaration to END (at the string,
 * or at punctuation) rather than run on into another word rejects that while
 * still accepting "NO ROAD ACCESS. Primary access by river from Riverton."
 *
 * BOTH fields are read, because the importer puts the declaration in whichever
 * one it has. Greenbriar Float Camp is the row that proves it: `road_access` is
 * NULL, `parking_info` reads "No vehicle access. River only.", `types` is the
 * empty array — so the roles rule could not judge it, a road_access-only guard
 * could not see it, and it sat in the put-in picker while its five identical
 * neighbours were being reported. Reading one field and calling that
 * reachability is the same narrowness that produced the finding in the first
 * place.
 */
const UNREACHABLE_BY_VEHICLE =
  /^\s*(?:no road access|no vehicle access|river access only)(?!\s+\w)/i;

export function isVehicleUnreachable(
  roadAccess: string | null | undefined,
  parkingInfo?: string | null | undefined,
): boolean {
  return [roadAccess, parkingInfo].some(
    (field) => typeof field === 'string' && UNREACHABLE_BY_VEHICLE.test(field),
  );
}

/** Pure. Rows in, findings out — no database, so the rule is testable alone. */
export function deriveEndpointEligibilityFindings(
  rows: readonly EndpointEligibilityRow[],
): RawFinding[] {
  const findings: RawFinding[] = [];

  for (const row of rows) {
    if (row.approved !== true) continue;

    // The uuid, never the slug. supabase/migrations/20260815000000 exists
    // because access-point slugs have drifted between environments, and a
    // finding keyed on something editable loses its history the moment somebody
    // edits it — the same trap gauge_missing_site_id fell into.
    const entityKey = row.id;
    const where = row.river_slug ? ` on the ${row.river_slug}` : '';
    const roles = (row.types ?? []).filter((t): t is string => typeof t === 'string' && t.length > 0);
    const launchRoles = roles.filter(isLaunchRole);

    // First, and regardless of roles: you cannot shuttle to a place with no
    // road. This both raises its own finding and — by returning here — keeps
    // `launch_not_selectable` off a boat-in camp that is correctly excluded.
    if (isVehicleUnreachable(row.road_access, row.parking_info)) {
      if (row.is_float_endpoint === true) {
        const said = (
          isVehicleUnreachable(row.road_access) ? row.road_access : row.parking_info
        )?.trim();
        findings.push({
          entityType: 'access_point',
          entityKey,
          ruleKey: 'unreachable_offered_as_endpoint',
          title: `"${row.name}"${where} is offered as a put-in but has no road to it`,
          detail: `This point declares "${said?.slice(0, 60)}", so a party cannot leave a vehicle here — yet it may be chosen as a put-in or take-out, and every trip built on it strands its own shuttle. A float needs a road at BOTH ends, which is a separate question from whether the bank is launchable: this fires whatever the roles say, because a boat-in camp genuinely does have a gravel bar. If the note is wrong, fix it; otherwise set is_float_endpoint = false and the point keeps its page, its pin and its place on the map.`,
          evidence: {
            accessPointId: row.id,
            slug: row.slug,
            roles,
            roadAccess: row.road_access,
            parkingInfo: row.parking_info,
          },
        });
      }
      continue;
    }

    // ── A point the picker OFFERS must know where it is ─────────────────
    //
    // Checked before the roles rules and independently of them, because it is
    // a different kind of wrong. The roles rules ask whether a place COULD be
    // a launch; this asks whether a place the planner already offers can be
    // ordered against its neighbours at all.
    //
    // It fails silently in a way the others do not. An ineligible launch is
    // absent from the picker, which somebody eventually notices. A launch with
    // no mile is PRESENT and confidently wrong: NULL becomes 0, 0 is the
    // headwaters, and the point sorts ahead of every access on its river. Van
    // Buren City Access sat at mile 0 rather than 85.9 that way, which made
    // the entire Current read as downstream of it.
    if (row.is_float_endpoint === true && row.river_mile_downstream == null) {
      findings.push({
        entityType: 'access_point',
        entityKey,
        ruleKey: 'endpoint_without_river_mile',
        title: `"${row.name}"${where} is offered as a put-in with no river mile`,
        detail: `This point is approved and is_float_endpoint, so the planner offers it — but river_mile_downstream is NULL. Nothing downstream treats that as unknown: toAccessPoint maps it to 0 (src/lib/offline/shapes.ts, where riverMile is a non-nullable wire field shared with the offline bundle), and 0 is the headwaters. So the point sorts to the top of its river, every other access compares as downstream of it, and the access-point sheet asks getGaugeStatus for the gauge nearest mile 0. Set river_mile_downstream to the point's actual mile from the headwaters; do not make the wire field nullable to describe one row.`,
        evidence: {
          accessPointId: row.id,
          slug: row.slug,
          river: row.river_slug,
          riverMileDownstream: null,
        },
      });
      continue;
    }

    if (row.is_float_endpoint !== true && launchRoles.length > 0) {
      findings.push({
        entityType: 'access_point',
        entityKey,
        ruleKey: 'launch_not_selectable',
        title: `"${row.name}"${where} is a launch nobody can choose`,
        detail: `This point carries the ${launchRoles.join(', ')} role${
          launchRoles.length > 1 ? 's' : ''
        } and is approved, so it is drawn on the map and has a public page — but is_float_endpoint is false, so it is missing from the put-in and take-out pickers and /api/plan refuses any trip built on it. Eligibility is opt-in by design; this is what that costs when a row is added or approved without setting it. If it really is a launch, set is_float_endpoint = true.`,
        evidence: { accessPointId: row.id, slug: row.slug, roles, launchRoles },
      });
      continue;
    }

    // An empty roles array is a row that has not said what it is. Unjudgeable,
    // not wrong — see the header.
    if (row.is_float_endpoint === true && roles.length > 0 && launchRoles.length === 0) {
      findings.push({
        entityType: 'access_point',
        entityKey,
        ruleKey: 'non_launch_offered_as_endpoint',
        title: `"${row.name}"${where} is offered as a put-in but claims no launch`,
        detail: `Every role on this point (${roles.join(
          ', ',
        )}) is a place-to-be rather than a place-to-launch, yet it may be chosen as a put-in or take-out. Either the roles are incomplete — a campground whose boat ramp was never recorded — or is_float_endpoint should be false. Check the ground before the boundary line: Montauk State Park was reclassified as a non-launch on a park-boundary reading in 2026-08 and is in fact the Current's first put-in.`,
        evidence: { accessPointId: row.id, slug: row.slug, type: row.type, roles },
      });
    }
  }

  // Deterministic, so a run's detail does not churn on row order and
  // last_seen_at keeps meaning "this was still true then".
  return findings.sort(
    (a, b) => a.title.localeCompare(b.title) || a.ruleKey.localeCompare(b.ruleKey),
  );
}

export const floatEndpointEligibilityCheck: TrustCheck = {
  id: 'float_endpoint_eligibility',
  title: 'Float-endpoint eligibility against declared roles',
  cadence: 'daily',

  async run(ctx: TrustCheckContext): Promise<TrustCheckResult> {
    const { data, error } = await ctx.supabase
      .from('access_points')
      .select(
        'id, name, slug, type, types, approved, is_float_endpoint, river_mile_downstream, road_access, parking_info, rivers!inner(slug)',
      )
      .eq('approved', true);

    if (error) {
      throw new Error(
        `could not read access_points for float_endpoint_eligibility: ${error.message}`,
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: EndpointEligibilityRow[] = (data ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      slug: r.slug ?? null,
      type: r.type ?? null,
      types: r.types ?? null,
      approved: r.approved ?? null,
      is_float_endpoint: r.is_float_endpoint ?? null,
      river_mile_downstream:
        r.river_mile_downstream != null ? Number(r.river_mile_downstream) : null,
      river_slug: r.rivers?.slug ?? null,
      road_access: r.road_access ?? null,
      parking_info: r.parking_info ?? null,
    }));

    // One set-based read, so there is no truncation path and `partial` can never
    // be quietly true. Zero approved points means the table is unreadable, which
    // deserves reconcile.ts's empty_scope refusal rather than a clean sweep.
    return { scopeCount: rows.length, findings: deriveEndpointEligibilityFindings(rows) };
  },
};
