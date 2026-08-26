// src/lib/trust/severity.ts
// How bad is it, measured at the surface a paddler sees.
//
// ── Why this re-maps rather than trusting the source ─────────────────────
//
// validate_river_data() already returns its own 'error' | 'warning', and using
// it directly would be one less thing to maintain. It is wrong for this purpose,
// and wrong in the unsafe direction.
//
// It grades by CATEGORY OF DEFECT — a missing NOT NULL-ish field is an error, a
// stale row is a warning. Graded that way, `missing_timezone` (a display concern
// on a Missouri-only product) outranks `stale_gauge` (the primary gauge for an
// active river has been silent for over 24 hours, and the condition badge is
// still showing its last reading as though it were current). One of those can
// send someone to a river on yesterday's water. It is not the one marked error.
//
// So severity here is assigned by CONSEQUENCE AT THE SURFACE: anything that can
// change a condition badge or a go/no-go answer is critical, whichever table the
// defect happens to live in. The source's own grade is not discarded — it is
// carried in evidence.sqlSeverity, so a disagreement stays visible.

export type TrustSeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * Every rule validate_river_data() can emit, as of 00164_harden_river_validation.
 * Nine errors and eleven warnings. Listed explicitly so the exhaustiveness test
 * fails when the SQL grows a rule that nobody has classified.
 */
export const VALIDATE_RIVER_DATA_RULES = [
  'missing_timezone',
  'missing_state',
  'missing_river_type',
  'missing_geometry',
  'missing_characteristics',
  'missing_weather_point',
  'missing_alert_terms',
  'ungauged_river',
  'no_primary_gauge',
  'threshold_order',
  'missing_thresholds',
  'no_dangerous_anchor',
  'no_optimal_max_anchor',
  'no_too_low_anchor',
  'stale_gauge',
  'gauge_missing_site_id',
  'access_point_offline',
  'access_point_not_snapped',
  'mileage_order_mismatch',
  'mileage_equals_length',
] as const;

/**
 * Rules the river-geometry check emits.
 *
 * The admin route these came from produced human sentences with values baked in
 * ("Low coordinate density: 3.2 pts/mile"). Those cannot be fingerprinted, so
 * the extracted check emits stable keys and the route renders the sentences back
 * for its existing consumer.
 */
export const RIVER_GEOMETRY_RULES = [
  'geometry_missing',
  'geometry_unreadable',
  'coordinate_count_very_low',
  'coordinate_density_low',
  'missing_length_miles',
  'length_miles_disagrees_geometry',
  'direction_unverified',
  'headwaters_flag_unset',
  'no_gauges_linked',
  'no_gauges_near_geometry',
  // Was bbox_outside_missouri, which named a premise the catalog outgrew.
  // Renaming changes the fingerprint, so the Caddo finding filed under the old
  // key resolves on the next run rather than lingering — correct, since what it
  // alleged (an Arkansas river is in the wrong place) was never true.
  'bbox_outside_state',
] as const;

export const EDDY_KNOWLEDGE_RULES = [
  'knowledge_file_missing',
  'knowledge_missing_section',
] as const;

export const GAUGE_WIRING_RULES = ['gauge_dual_primary'] as const;

/**
 * Rules the usgs_site_drift check emits — the only ones in this file that
 * describe a disagreement with a SOURCE rather than an inconsistency inside
 * Eddy.
 */
export const USGS_SITE_DRIFT_RULES = [
  'usgs_site_unknown',
  'usgs_site_record_ended',
  'usgs_site_moved',
  'usgs_site_renamed',
  'usgs_site_drainage_changed',
] as const;

export const SERVICE_GEO_RULES = [
  'service_far_from_linked_river',
  'service_nearer_unlinked_river',
  'service_no_river_link',
] as const;

/**
 * One per invariant in docs/legacy-schema-security-audit.md, prefixed so a
 * schema assertion can never collide with a river rule.
 */
export const SCHEMA_INVARIANT_RULES = [
  'schema_feedback_rls_enabled',
  'schema_feedback_no_public_insert_policy',
  'schema_feedback_type_check_has_gauge_recalibration',
  'schema_feedback_no_public_mutation_grants',
  'schema_segment_cache_no_public_mutation',
  'schema_admin_policies_use_is_admin',
  'schema_alert_subscription_kind_matches_api',
  // Not an invariant the SQL asserts — a fact about the register that governs
  // them. See src/lib/trust/exceptions.ts.
  'schema_exception_unnecessary',
] as const;

/** Filed by the ledger against itself when a run refuses to reconcile. */
export const LEDGER_RULES = [
  'reconcile_anomaly',
  'check_not_running',
  'known_defect_regressed',
] as const;

/**
 * Emitted by float-endpoint-eligibility.ts. Two rules for the two directions of
 * being wrong about whether a place is a launch, and a third for the question
 * roles cannot answer: whether a vehicle can get there at all.
 */
export const FLOAT_ENDPOINT_RULES = [
  'launch_not_selectable',
  'non_launch_offered_as_endpoint',
  'unreachable_offered_as_endpoint',
] as const;

/**
 * Emitted by dam-freshness.ts. Two keys for one condition, split at a
 * threshold, because the fingerprint hashes the rule key: one rule whose
 * severity moved would rewrite a finding in place and lose the date it froze.
 */
export const DAM_FRESHNESS_RULES = ['dam_history_stale', 'dam_history_frozen'] as const;

export const ALL_TRUST_RULES = [
  ...VALIDATE_RIVER_DATA_RULES,
  ...RIVER_GEOMETRY_RULES,
  ...EDDY_KNOWLEDGE_RULES,
  ...GAUGE_WIRING_RULES,
  ...USGS_SITE_DRIFT_RULES,
  ...SERVICE_GEO_RULES,
  ...FLOAT_ENDPOINT_RULES,
  ...DAM_FRESHNESS_RULES,
  ...SCHEMA_INVARIANT_RULES,
  ...LEDGER_RULES,
] as const;

const SEVERITY_BY_RULE: Readonly<Record<string, TrustSeverity>> = {
  // ── critical: can change a condition badge or a go/no-go ──────────────
  // The primary gauge is silent and the badge is still quoting it.
  stale_gauge: 'critical',
  // A non-monotonic ladder can classify dangerous water as optimal.
  //
  // Verified against production 2026-08-04: all three live instances are the
  // MILD shape — adjacent values equal rather than inverted (Meramec Cook
  // Station and Sullivan both have level_high == level_dangerous; Jacks Fork
  // has level_low == level_optimal_min). None of them currently misgrades a
  // reading, because classifyReading() (shared/condition-ladder.ts:103-111)
  // tests dangerous first with >=, and starts the High band at
  // level_optimal_max — so level_high is not consulted at all while
  // optimal_max is set.
  //
  // Kept critical anyway, because the rule covers the inverted shape too and
  // that one does misgrade. The equal-value cases are a latent trap rather than
  // a live one: null out an optimal_max and level_high starts being read, at
  // which point a High band equal to the Dangerous line vanishes silently.
  // If the triaged count of mild cases ever outgrows the inverted ones, split
  // the SQL rule rather than downgrading this.
  threshold_order: 'critical',
  // computeCondition() has no flood-stage fallback, so the badge caps below
  // "Dangerous" and the worst water the river produces is unreachable.
  no_dangerous_anchor: 'critical',
  missing_thresholds: 'critical',
  no_primary_gauge: 'critical',
  ungauged_river: 'critical',
  // The ledger declining to believe itself. Filed at the top because it means
  // every other severity on this check is currently unverified.
  reconcile_anomaly: 'critical',
  // A check that stopped running reports nothing, and nothing reads as health.
  // Same severity as the ledger refusing to believe itself, for the same
  // reason: everything that check covers is currently unverified.
  check_not_running: 'critical',
  // A repair that did not hold. The one signal the Trust MVP gate treats as
  // disqualifying, and the reason it is filed separately from the rule that
  // detects the underlying condition — see checks/known-regressions.ts.
  known_defect_regressed: 'critical',
  // RLS off means every policy on the table is inert RIGHT NOW, with nothing
  // behind it. An INSERT policy reappearing means the publishable key — which
  // Metro inlines into the shipped bundle by design — can write again.
  schema_feedback_rls_enabled: 'critical',
  schema_feedback_no_public_insert_policy: 'critical',
  schema_segment_cache_no_public_mutation: 'critical',

  // ── high: wrong, but not toward danger ───────────────────────────────
  // The floatable range collapses; the badge misreports in the safe direction.
  no_too_low_anchor: 'high',
  no_optimal_max_anchor: 'high',
  missing_geometry: 'high',
  gauge_missing_site_id: 'high',
  // A gauge that is primary for two rivers makes find(isPrimary) arbitrary —
  // the misassociation class docs/gauge-alerting-misalignment-audit.md is about.
  gauge_dual_primary: 'high',
  // A stored site id USGS has no record of. Nothing will ever read from it, so
  // the gauge is inert whatever the rest of the row says.
  usgs_site_unknown: 'high',
  // USGS's published flow/stage record for a wired station is over. High rather
  // than critical on purpose: the surface consequence is a badge quoting a dead
  // gauge, and stale_gauge already owns that at critical, so two criticals here
  // would double-count one condition in every gate that counts them. What this
  // adds is not earlier warning — stale_gauge fires within a day and this waits
  // a fortnight — but the distinction between a transient outage and a station
  // that is not coming back.
  usgs_site_record_ended: 'high',
  no_gauges_near_geometry: 'high',
  bbox_outside_state: 'high',
  // Defence in depth that is currently redundant — RLS is holding the line —
  // which is exactly why it reads high rather than critical. The argument for
  // fixing it is the one 20260731223406 makes: a table protected by one
  // mechanism is one accidental permissive policy away from exposure.
  schema_feedback_no_public_mutation_grants: 'high',
  // An inlined user_roles lookup is not is_admin(). is_admin() is SECURITY
  // DEFINER and bypasses RLS on user_roles; the inline form works only while
  // that table's SELECT policy keeps its `user_id = auth.uid()` branch. Tighten
  // it and every inline check silently returns false — locking admins out,
  // quietly, on tables that still look correctly gated.
  schema_admin_policies_use_is_admin: 'high',
  // Narrower than the API union rejects valid input; wider accepts values no
  // client can render.
  schema_alert_subscription_kind_matches_api: 'high',
  schema_feedback_type_check_has_gauge_recalibration: 'high',

  // ── medium: wrong numbers downstream of a correct badge ──────────────
  // Bad mileage means a bad float time. It reads medium rather than high
  // because /api/plan returns a range, and floatTime.ts refuses to estimate at
  // all for dangerous water — so the error cannot compound into a go/no-go.
  access_point_offline: 'medium',
  access_point_not_snapped: 'medium',
  // A station that has physically moved beyond survey noise. It puts the map
  // pin in the wrong place and shifts the station relative to the river line,
  // which is the input no_gauges_near_geometry judges — but it does not change
  // what the gauge reads, so the badge stays correct.
  usgs_site_moved: 'medium',
  mileage_order_mismatch: 'medium',
  mileage_equals_length: 'medium',
  missing_river_type: 'medium',
  missing_characteristics: 'medium',
  // Not a badge problem today, on a Missouri-only product. Both gate correct
  // multi-state behaviour, which is why they are not filed as cosmetic.
  missing_timezone: 'medium',
  missing_state: 'medium',
  missing_length_miles: 'medium',
  // Same band as the other mileage rules, and for the reason stated above them:
  // mile markers are `length_miles * ST_LineLocatePoint(...)`, so a drifting
  // column scales every marker on the river and the float distances read off
  // them. It stops short of high because /api/plan returns a range and
  // floatTime.ts refuses to estimate at all for dangerous water, so the error
  // cannot compound into a go/no-go answer.
  length_miles_disagrees_geometry: 'medium',
  coordinate_density_low: 'medium',
  geometry_missing: 'medium',
  geometry_unreadable: 'medium',
  no_gauges_linked: 'medium',
  // A service pin somebody plans a drive around, too far from any water that
  // business serves. Not high: services are deliberately left out of the
  // offline bundle ("a campground you cannot reach is an inconvenience; a low
  // water dam you cannot see is not"), and mappableService already gates what
  // is drawn — so a misplaced outfitter cannot move a badge or a go/no-go the
  // way a stale gauge can. Not low either, because a pin IS a claim: the
  // near-misses this rule exists to catch were real, different businesses 35 to
  // 71 miles away.
  service_far_from_linked_river: 'medium',
  // A located service linked to no river is in no per-river directory and on no
  // layer fetched per river. Nothing is ambiguous here — the join is missing.
  service_no_river_link: 'medium',
  // Eddy is offering a put-in at a place whose own roles say there is nowhere to
  // put in. This is the direction that ends with somebody towing a boat to a
  // park boundary, which is why `is_float_endpoint` defaults to false — but the
  // default only covers rows nobody touched.
  non_launch_offered_as_endpoint: 'high',
  // The same ending — a party towing a boat to a place they cannot reach —
  // arrived at through the axis roles do not cover. Worse than its sibling in
  // one respect: a bad put-in still leaves you standing next to your vehicle,
  // while a take-out with no road strands the shuttle at the END of the float,
  // in the dark, on a river people run in one day.
  unreachable_offered_as_endpoint: 'high',
  // The opposite miss, and a quiet one: a real launch that is drawn on the map
  // and cannot be selected. Nobody reports a put-in that was never offered, so
  // this rule is the only thing that will say so. Not a safety defect — the
  // planner is incomplete, not wrong.
  launch_not_selectable: 'medium',

  // A dam whose recorded history has stopped advancing entirely. High rather
  // than critical: no badge and no go/no-go moves, because the dam pages read
  // CWMS live and never touch this table — that independence is precisely why
  // the 2026-08-22 freeze was invisible for 53 hours. What it costs is the
  // pattern strip, permanently, for every hour that falls out of CWMS's
  // rolling window before somebody looks. Filed above the mileage band because
  // those defects wait patiently to be fixed and this one does not.
  dam_history_frozen: 'high',
  // The same condition inside a window where one skipped cron run explains it.
  // Medium, because the recorder repairs itself by re-reading 48 hours on the
  // next pass, so most of these close without anyone acting.
  dam_history_stale: 'medium',

  // ── low: real, visible to nobody in danger ───────────────────────────
  // Geometry has raised a question about an editorial fact, and the answer may
  // well be that the link is right: a business is linked to the water it
  // SERVES, not the water it is near, and an outfitter's storefront can sit on
  // a different river from the one it guides. Filing it above low would put a
  // question in the same list as defects.
  service_nearer_unlinked_river: 'low',
  missing_weather_point: 'low',
  missing_alert_terms: 'low',
  knowledge_file_missing: 'low',
  knowledge_missing_section: 'low',
  direction_unverified: 'low',
  headwaters_flag_unset: 'low',
  coordinate_count_very_low: 'low',
  // A rename is usually cosmetic and the stored name is what people match
  // against on the USGS site, so it is a signal rather than a defect — but it
  // is also how a station re-designation first appears, which is why it is
  // recorded rather than ignored.
  usgs_site_renamed: 'low',
  // Drainage area feeds the scaling estimate for flow at an ungauged reach.
  // src/lib/usgs/drainage.ts has no callers today, so nothing downstream is
  // wrong yet; when it acquires one this belongs a band higher.
  usgs_site_drainage_changed: 'low',
  // Nothing is broken — the invariant passes. But an exception left behind is a
  // standing permission to break it again with the finding arriving
  // pre-accepted, so it belongs in the list rather than in nobody's memory.
  schema_exception_unnecessary: 'low',
};

/**
 * Unmapped rules resolve to 'high', not 'low'.
 *
 * An unclassified rule is one nobody has triaged, and the two ways to be wrong
 * about it are not symmetric: filing it low buries it in a list the operator
 * skims, filing it high puts it in front of them once and gets it classified.
 * The exhaustiveness test means this should only ever be reachable in the window
 * between a new SQL rule landing and someone naming it here.
 */
export function severityForRule(ruleKey: string): TrustSeverity {
  return SEVERITY_BY_RULE[ruleKey] ?? 'high';
}

export function isRuleClassified(ruleKey: string): boolean {
  return ruleKey in SEVERITY_BY_RULE;
}

const RANK: Record<TrustSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/** Worst first, for the console and the run summary. */
export function compareSeverity(a: TrustSeverity, b: TrustSeverity): number {
  return RANK[a] - RANK[b];
}
