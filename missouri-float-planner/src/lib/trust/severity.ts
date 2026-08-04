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
  'direction_unverified',
  'headwaters_flag_unset',
  'no_gauges_linked',
  'no_gauges_near_geometry',
  'bbox_outside_missouri',
] as const;

export const EDDY_KNOWLEDGE_RULES = [
  'knowledge_file_missing',
  'knowledge_missing_section',
] as const;

export const GAUGE_WIRING_RULES = ['gauge_dual_primary'] as const;

/** Filed by the ledger against itself when a run refuses to reconcile. */
export const LEDGER_RULES = ['reconcile_anomaly'] as const;

export const ALL_TRUST_RULES = [
  ...VALIDATE_RIVER_DATA_RULES,
  ...RIVER_GEOMETRY_RULES,
  ...EDDY_KNOWLEDGE_RULES,
  ...GAUGE_WIRING_RULES,
  ...LEDGER_RULES,
] as const;

const SEVERITY_BY_RULE: Readonly<Record<string, TrustSeverity>> = {
  // ── critical: can change a condition badge or a go/no-go ──────────────
  // The primary gauge is silent and the badge is still quoting it.
  stale_gauge: 'critical',
  // A non-monotonic ladder can classify dangerous water as optimal.
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

  // ── high: wrong, but not toward danger ───────────────────────────────
  // The floatable range collapses; the badge misreports in the safe direction.
  no_too_low_anchor: 'high',
  no_optimal_max_anchor: 'high',
  missing_geometry: 'high',
  gauge_missing_site_id: 'high',
  // A gauge that is primary for two rivers makes find(isPrimary) arbitrary —
  // the misassociation class docs/gauge-alerting-misalignment-audit.md is about.
  gauge_dual_primary: 'high',
  no_gauges_near_geometry: 'high',
  bbox_outside_missouri: 'high',

  // ── medium: wrong numbers downstream of a correct badge ──────────────
  // Bad mileage means a bad float time. It reads medium rather than high
  // because /api/plan returns a range, and floatTime.ts refuses to estimate at
  // all for dangerous water — so the error cannot compound into a go/no-go.
  access_point_offline: 'medium',
  access_point_not_snapped: 'medium',
  mileage_order_mismatch: 'medium',
  mileage_equals_length: 'medium',
  missing_river_type: 'medium',
  missing_characteristics: 'medium',
  // Not a badge problem today, on a Missouri-only product. Both gate correct
  // multi-state behaviour, which is why they are not filed as cosmetic.
  missing_timezone: 'medium',
  missing_state: 'medium',
  missing_length_miles: 'medium',
  coordinate_density_low: 'medium',
  geometry_missing: 'medium',
  geometry_unreadable: 'medium',
  no_gauges_linked: 'medium',

  // ── low: real, visible to nobody in danger ───────────────────────────
  missing_weather_point: 'low',
  missing_alert_terms: 'low',
  knowledge_file_missing: 'low',
  knowledge_missing_section: 'low',
  direction_unverified: 'low',
  headwaters_flag_unset: 'low',
  coordinate_count_very_low: 'low',
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
