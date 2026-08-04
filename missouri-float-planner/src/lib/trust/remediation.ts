// src/lib/trust/remediation.ts
// What to actually do about a finding.
//
// ── Why this is per-RULE and derived, not per-finding and stored ─────────
//
// The advice belongs to the rule, not to the row. Storing it on each finding
// would freeze whatever we knew when the finding was raised, so improving the
// guidance would only reach findings raised afterwards — and the ones that have
// been open longest, which are exactly the ones somebody is stuck on, would keep
// showing the oldest advice.
//
// Deriving it at render time means the console always shows current guidance,
// there is no column to migrate, and the advice is reviewed in the same pull
// request as the check that emits the rule.
//
// ── The honest part ─────────────────────────────────────────────────────
//
// Most of these are `judgment`, and that is not a gap to be closed later. The
// worked example is migration 20260803170000: resolving two threshold findings
// took MOHERP observed-versus-estimated ratings, USGS day-of-year percentiles
// over a 105-year record, and a mass-balance check that turned up a USGS sensor
// fault and caused three more gauges to be deliberately deferred. Nothing
// generates that. What this file can do is say which method applies, so the
// person doing it starts from the right place instead of from the finding text.

export type RemediationKind =
  /** Deterministic. A command or a script exists and re-running it is safe. */
  | 'mechanical'
  /** Needs domain knowledge or a decision. No command will produce the answer. */
  | 'judgment'
  /** Not a fix. Find out what is true before deciding whether anything is wrong. */
  | 'investigate'
  /** Known, and deliberately not being fixed yet. Snooze with the reason. */
  | 'deferred'
  /** The finding is probably wrong. Fix the check, not the data. */
  | 'check_bug';

export interface Remediation {
  kind: RemediationKind;
  /** One line: what to do. */
  action: string;
  /** Where: an admin path, a command, or a file. */
  where?: string;
  /** How to derive the right value, when that is the hard part. */
  method?: string;
}

const REMEDIATION_BY_RULE: Readonly<Record<string, Remediation>> = {
  // ── condition ladder — never mechanical ──────────────────────────────
  threshold_order: {
    kind: 'judgment',
    action: 'Make the ladder strictly increasing on the named gauge.',
    where: '/admin/gauges',
    method:
      'Check which line is actually wrong before moving anything. classifyReading() tests dangerous first with >= and starts the High band at level_optimal_max, so level_high is not read at all while optimal_max is set — an equal high/dangerous pair is a latent trap rather than a live misgrade. An INVERTED pair is a live misgrade. See shared/condition-ladder.ts.',
  },
  no_dangerous_anchor: {
    kind: 'judgment',
    action: 'Set level_dangerous on the primary gauge.',
    where: '/admin/gauges',
    method:
      'Prefer the NWS flood stage where one exists (nws_lid / flood_stage_ft, backfilled by 00165). Where NWPS publishes no flood category, an editorial anchor is acceptable but must be recorded in threshold_source_url.',
  },
  no_too_low_anchor: {
    kind: 'judgment',
    action: 'Set level_too_low on the primary gauge.',
    where: '/admin/gauges',
    method:
      'Anchor to the gauge\'s own day-of-year percentiles, not to a neighbouring river: level_too_low ~ p5 of summer flow, level_low ~ p25. That is the method 20260803170000 used, and the reason it caught ladders whose floors sat above the median August day.',
  },
  no_optimal_max_anchor: {
    kind: 'judgment',
    action: 'Set level_optimal_max on the primary gauge.',
    where: '/admin/gauges',
    method: 'p75 of summer flow, cross-checked against MOHERP observed ratings where they exist.',
  },
  missing_thresholds: {
    kind: 'judgment',
    action: 'Build a full condition ladder for the primary gauge before this river goes live.',
    where: 'scripts/ingestion/update-thresholds.ts (dry-run by default)',
    method: 'docs/RIVER_SCALING_PLAYBOOK.md — percentiles cross-referenced with outfitter knowledge.',
  },

  // ── gauge wiring ─────────────────────────────────────────────────────
  stale_gauge: {
    kind: 'investigate',
    action:
      'Find out whether the gauge stopped reporting or the ingest stopped writing. Do not touch thresholds.',
    where: 'Check the provider first, then /api/cron/update-gauges output',
    method:
      'If the provider has data and we do not, the fault is ingestion. If the provider is dark too, the gauge is down and the river needs a different primary or an honest "no live gauge" state — src/lib/alerts/gate.ts already refuses to alert on it.',
  },
  ungauged_river: {
    kind: 'judgment',
    action: 'Link a gauge, or take the river out of active.',
    where: '/admin/gauges',
    method:
      'A proxy gauge on a neighbouring reach is acceptable — Courtois uses Huzzah\'s — but record distance_from_section_miles so the gauge-to-river lookup stays deterministic.',
  },
  no_primary_gauge: {
    // Marked judgment rather than mechanical even though the edit is one click.
    // WHICH gauge is primary decides which ladder grades the river, so this
    // reaches the badge — and the remediation test asserts that no critical
    // rule is ever labelled mechanical, because that label is what a future
    // auto-apply would key on.
    kind: 'judgment',
    action: 'Mark exactly one of this river\'s linked gauges as primary.',
    where: '/admin/gauges',
    method:
      'Pick the gauge whose reach the river is actually graded on — usually the smallest distance_from_section_miles. river_gauges_one_primary_per_river enforces at most one; this is the case of none.',
  },
  gauge_missing_site_id: {
    kind: 'judgment',
    action: 'Set the provider-native site id on the station.',
    where: '/admin/gauges',
    method: 'usgs_site_id for USGS, site_id_external for NWS LIDs and USACE dam slugs.',
  },
  gauge_dual_primary: {
    kind: 'mechanical',
    action:
      'Set distance_from_section_miles on each primary link so the gauge-to-river lookup can order them.',
    where: '/admin/gauges',
    method:
      'Sharing a gauge is fine. What is not fine is two primaries with nothing to sort them by — shared/primary-river-link.ts then falls back to alphabetical order, which is stable but arbitrary.',
  },

  // ── geometry and mileage ─────────────────────────────────────────────
  geometry_missing: {
    kind: 'investigate',
    action: 'Confirm rivers.geom is genuinely null before treating this as a data problem.',
    where: 'select slug, geom is not null from rivers where slug = ...',
    method:
      'This rule fired on all 24 rivers once because get_river_geometry_json() was absent from production and PostgREST returns an error object rather than throwing. If it is firing broadly, suspect the RPC before the data.',
  },
  // validate_river_data()'s own geometry rule. Confusingly close in name to
  // river_geometry's `geometry_missing` above, and genuinely different: this one
  // reads rivers.geom directly in SQL, so it cannot be fooled by a missing RPC.
  missing_geometry: {
    kind: 'judgment',
    action: 'Import the river line. rivers.geom is null in the database itself.',
    where: 'scripts/import-nhd-rivers-from-tnm.ts',
    method:
      'Unlike geometry_missing, this rule reads the column in SQL — there is no RPC in the path, so it is not the false-positive shape that fired on all 24 rivers.',
  },
  direction_unverified: {
    kind: 'mechanical',
    action: 'Confirm the line runs headwaters-first, then set direction_verified.',
    where: 'npm run db:verify-directions',
    method:
      'The script is read-only: it prints suggested UPDATE statements and never runs them. Check its reasoning before applying, because the heuristic is coordinate-based and says "uncertain" on east-west rivers.',
  },
  headwaters_flag_unset: {
    kind: 'mechanical',
    action: 'Set geometry_starts_at_headwaters — null means nobody has looked, false is a real answer.',
    where: 'npm run db:verify-directions',
    method: 'Mileage runs downstream from this flag; getting it backwards reverses every river mile.',
  },
  geometry_unreadable: {
    kind: 'check_bug',
    action: 'The geometry read failed for this river specifically. Check the RPC and the row.',
    where: 'get_river_geometry_json(slug)',
  },
  coordinate_count_very_low: {
    kind: 'judgment',
    action: 'Re-import the river line from NHD.',
    where: 'scripts/import-nhd-rivers-from-tnm.ts',
    method: 'A handful of vertices is a placeholder line, not a simplified one.',
  },
  coordinate_density_low: {
    kind: 'judgment',
    action: 'Re-import at higher resolution if the line drives mileage.',
    where: 'scripts/import-nhd-rivers-from-tnm.ts',
    method: 'Under 5 points per mile, ST_LineLocatePoint starts rounding access points onto the wrong bend.',
  },
  missing_length_miles: {
    kind: 'mechanical',
    action: 'Set length_miles from the geometry.',
    where: 'select st_length(geom::geography)/1609.34 from rivers where slug = ...',
    method: 'Compare against published guide miles before writing; the two legitimately differ by a few percent.',
  },
  access_point_not_snapped: {
    kind: 'mechanical',
    action: 'Snap the approved access points onto the river line.',
    where: 'npm run db:snap-access-points',
    method: 'Re-runnable and idempotent. Sets location_snap, which mileage and float time both read.',
  },
  access_point_offline: {
    kind: 'investigate',
    action: 'A snapped point more than 500 m from the line is usually a wrong river, not a wrong point.',
    where: '/admin/access-points',
    method: 'Check the access point belongs to this river before re-snapping it.',
  },
  mileage_order_mismatch: {
    kind: 'mechanical',
    action: 'Recompute river_mile_downstream from position along the line.',
    where: 'npm run db:correct-miles',
    method:
      'Stored order disagreeing with ST_LineLocatePoint usually means the geometry was replaced under existing points, or the line runs mouth-first — check db:verify-directions before recomputing.',
  },
  mileage_equals_length: {
    kind: 'mechanical',
    action: 'Recompute the mile marker; equal-to-river-length is a clamped placeholder.',
    where: 'npm run db:correct-miles',
  },
  no_gauges_linked: {
    kind: 'judgment',
    action: 'Link a gauge, or accept the river as unrated.',
    where: '/admin/gauges',
  },
  no_gauges_near_geometry: {
    kind: 'investigate',
    action: 'Either the gauges belong to another river or the line stops short of them.',
    where: '/admin/geography',
    method:
      'A proxy gauge on a neighbouring river is a legitimate reason for this to fire and is not a defect — Courtois borrows Huzzah\'s gauge about five miles off its own line.',
  },
  bbox_outside_missouri: {
    kind: 'investigate',
    action: 'Check whether the line picked up a wrong NHD reach, or the river genuinely leaves the state.',
    where: '/admin/geography',
    method:
      'Out-of-state rivers are now real — Buffalo, Caddo, Mulberry, Kings, War Eagle. This bound predates them and may simply be wrong for that river.',
  },

  // ── multi-state readiness ────────────────────────────────────────────
  missing_timezone: {
    kind: 'mechanical',
    action: 'Set rivers.timezone.',
    where: '/admin/geography',
    method: 'America/Chicago for Missouri and Arkansas. Named as a scaling blocker in MULTI_STATE_SCALING_PLAN.md.',
  },
  missing_state: { kind: 'mechanical', action: 'Set rivers.state.', where: '/admin/geography' },
  missing_river_type: {
    kind: 'judgment',
    action: 'Classify the river\'s hydrological archetype.',
    where: '/admin/geography',
    method:
      'spring_fed_float | dam_tailwater | rain_flashy | snowmelt | flatwater. This drives condition semantics, so a wrong archetype misreads the river — see docs/WATER_REGIMES_STRATEGY.md.',
  },
  missing_characteristics: {
    kind: 'judgment',
    action: 'Add the river_characteristics row.',
    where: '/admin/geography',
    method: 'Feeds float-speed curve and condition prose. Needs the archetype decided first.',
  },
  missing_weather_point: {
    kind: 'mechanical',
    action: 'Set weather_lat / weather_lon to a representative point on the reach.',
    where: '/admin/geography',
  },
  missing_alert_terms: {
    kind: 'mechanical',
    action: 'Set alert_search_terms so NWS alerts can be matched to this river.',
    where: '/admin/geography',
  },

  // ── knowledge ────────────────────────────────────────────────────────
  knowledge_missing_section: {
    kind: 'judgment',
    action: 'Write a "## <River>" section in EDDY_KNOWLEDGE.md.',
    where: 'missouri-float-planner/EDDY_KNOWLEDGE.md',
    method:
      'Without one, Eddy writes about the river from the General Ozarks primer alone — confidently, and with no error. That is how Gasconade shipped knowledge-less.',
  },
  knowledge_file_missing: {
    kind: 'check_bug',
    action: 'EDDY_KNOWLEDGE.md did not load. Check the deployment bundle, not the data.',
    where: 'src/lib/eddy/knowledge.ts',
  },

  // ── schema invariants ────────────────────────────────────────────────
  schema_feedback_rls_enabled: {
    kind: 'judgment',
    action: 'Re-enable RLS on public.feedback immediately. Every policy on it is inert until you do.',
    where: 'forward migration',
  },
  schema_feedback_no_public_insert_policy: {
    kind: 'judgment',
    action: 'Drop the INSERT policy. Writes go through /api/feedback with the service role.',
    where: 'forward migration',
    method: 'The anon key is inlined into the shipped iOS bundle by design; an INSERT policy makes it a write credential.',
  },
  schema_feedback_no_public_mutation_grants: {
    kind: 'judgment',
    action: 'revoke insert, update, delete on public.feedback from anon, authenticated.',
    where: 'forward migration',
    method:
      'RLS is currently blocking these, so this is defence in depth rather than a live hole — the same both-halves argument 20260731223406 makes for the social tables.',
  },
  schema_segment_cache_no_public_mutation: {
    kind: 'judgment',
    action: 'Remove the public mutation policy or grant on segment_cache.',
    where: 'forward migration',
    method: 'Guard with to_regclass; production may not have the table at all.',
  },
  schema_admin_policies_use_is_admin: {
    kind: 'judgment',
    action: 'Rewrite the named policies to call is_admin() instead of inlining the user_roles lookup.',
    where: 'forward migration',
    method:
      'Not cosmetic. is_admin() is SECURITY DEFINER and bypasses RLS on user_roles; the inline form works only while that table keeps its `user_id = auth.uid()` SELECT branch. Tighten that and every inline check silently returns false, locking admins out of tables that still look correctly gated.',
  },
  schema_alert_subscription_kind_matches_api: {
    kind: 'judgment',
    action: 'Reconcile the kind CHECK with AlertSubscriptionKind.',
    where: 'src/types/api.ts and a forward migration',
  },
  schema_exception_unnecessary: {
    kind: 'mechanical',
    action: 'Delete the entry from SCHEMA_EXCEPTIONS.',
    where: 'src/lib/trust/exceptions.ts',
    method:
      'The invariant passes on production, so the exception is governing nothing. Left in place it is a standing permission: if the invariant fails again, the finding arrives pre-snoozed to a date somebody chose for a different reason, and nobody is told.',
  },
  schema_feedback_type_check_has_gauge_recalibration: {
    kind: 'judgment',
    action: 'Restore gauge_recalibration to the feedback_type CHECK.',
    where: 'forward migration',
    method: 'src/lib/feedback-types.test.ts asserts the TS constant against the migration text; this is the live-catalog half.',
  },

  // ── the ledger complaining about itself ──────────────────────────────
  check_not_running: {
    kind: 'investigate',
    action:
      'Find out why the tick is skipping this check. Everything it covers is unverified until it runs.',
    where: '/admin/trust — press Run on it, then read the result',
    method:
      'A manual run either succeeds (the scheduler was skipping it — check the time budget, since a slow check ahead of it can eat the pass) or fails with the real error. If the whole ledger has stopped rather than one check, /api/cron/update-gauges reports that to Sentry independently.',
  },
  reconcile_anomaly: {
    kind: 'investigate',
    action:
      'Verify the check still works before trusting any all-clear from it. Nothing was resolved on this run.',
    where: '/admin/trust',
    method:
      'empty_scope or check_error means the check could not see. mass_resolve means it saw an implausibly large improvement — confirm the fix that caused it, then resolve the affected findings by hand to clear the suppression.',
  },
};

/**
 * Falls back to investigate rather than to a guess.
 *
 * An unmapped rule is one nobody has written guidance for, and inventing a
 * plausible-sounding command would be worse than admitting that: a wrong `where`
 * sends someone to edit the wrong thing.
 */
export function remediationFor(ruleKey: string): Remediation {
  return (
    REMEDIATION_BY_RULE[ruleKey] ?? {
      kind: 'investigate',
      action: 'No remediation recorded for this rule yet. Read the detail and evidence.',
    }
  );
}

export function hasRemediation(ruleKey: string): boolean {
  return ruleKey in REMEDIATION_BY_RULE;
}

/** Rules whose fix is a re-runnable command rather than a decision. */
export function isMechanical(ruleKey: string): boolean {
  return remediationFor(ruleKey).kind === 'mechanical';
}
