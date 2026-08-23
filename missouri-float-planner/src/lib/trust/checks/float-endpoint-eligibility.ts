// src/lib/trust/checks/float-endpoint-eligibility.ts
// `is_float_endpoint` against what the record says it is.
//
// ── Why a check and not a better default ─────────────────────────────────
//
// 20260823120000 added `is_float_endpoint` with DEFAULT FALSE, because the two
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
  river_slug: string | null;
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
        )}) is a place-to-be rather than a place-to-launch, yet it may be chosen as a put-in or take-out. Montauk State Park was exactly this — a headwaters park with its designated canoe access outside the park boundary — and it was offered as a launch until 2026-08-11. Either the roles are incomplete, or is_float_endpoint should be false.`,
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
      .select('id, name, slug, type, types, approved, is_float_endpoint, rivers!inner(slug)')
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
      river_slug: r.rivers?.slug ?? null,
    }));

    // One set-based read, so there is no truncation path and `partial` can never
    // be quietly true. Zero approved points means the table is unreadable, which
    // deserves reconcile.ts's empty_scope refusal rather than a clean sweep.
    return { scopeCount: rows.length, findings: deriveEndpointEligibilityFindings(rows) };
  },
};
