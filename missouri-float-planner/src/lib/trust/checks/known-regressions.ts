// src/lib/trust/checks/known-regressions.ts
// Has anything we already fixed come back?
//
// ── Why this is a separate finding from the rule that detects it ────────
//
// If `gauge_dual_primary` is open, gauge_wiring has already said so, and this
// check files a second finding about the same row. That duplication is
// deliberate, and it is the only thing here worth arguing about.
//
// "There is an unresolvable primary tie on 07014000" and "a safety-critical
// defect we closed on 2026-08-04 has regressed" are different facts. The first
// is a data problem of the kind this console is full of. The second says a
// repair did not hold — which is the one signal the Trust MVP gate treats as
// disqualifying, and which is invisible if it arrives wearing the same clothes
// as every other finding.
//
// The cost is one extra row for an event that should be rare. The alternative
// is that the most important thing the ledger can tell you is ranked
// identically to a missing weather point.
//
// ── What it cannot catch ────────────────────────────────────────────────
//
// Two baseline entries are code-shape defects — a float time that disagreed
// across surfaces, a staleness constant defined three times — and no check can
// see them, because there is no row to look at. Those are guarded by tests that
// fail CI. assessBaseline() reports them as guarded elsewhere rather than
// counting them clear, and this check does not pretend otherwise.

import { assessBaseline, regressionDetail, SAFETY_BASELINE, type OpenFindingKey } from '../baseline';
import { mustRows } from '../db';
import type { RawFinding, TrustCheck, TrustCheckContext, TrustCheckResult } from '../types';

/** Pure. The register and what is open, in; regression findings, out. */
export function deriveRegressionFindings(open: readonly OpenFindingKey[]): RawFinding[] {
  return assessBaseline(SAFETY_BASELINE, open).regressed.map((entry) => ({
    entityType: 'global' as const,
    entityKey: entry.id,
    ruleKey: 'known_defect_regressed',
    title: `A closed safety-critical defect is back: ${entry.summary}`,
    detail: regressionDetail(entry),
    evidence: {
      baselineId: entry.id,
      closedBy: entry.closedBy,
      verifiedOn: entry.verifiedOn,
      reappearsAs: entry.reappearsAs,
    },
  }));
}

export const knownRegressionsCheck: TrustCheck = {
  id: 'known_regressions',
  title: 'Known safety-critical defects',
  cadence: 'hourly',

  async run(ctx: TrustCheckContext): Promise<TrustCheckResult> {
    // Snoozed counts as open here. An operator silencing a regressed
    // safety-critical defect has postponed it, not fixed it, and the gate asks
    // whether the defect is closed — not whether anyone wants to hear about it.
    const open = await mustRows<OpenFindingKey>(
      ctx.supabase
        .from('trust_findings')
        .select('check_id, rule_key, entity_key')
        .in('status', ['open', 'snoozed']),
      'could not read open findings for the regression check',
    );

    // Its own findings are in that table. Including them would let a regression
    // finding keep itself alive after the underlying defect was fixed.
    const others = open.filter((f) => f.rule_key !== 'known_defect_regressed');

    // Scope is the baseline, not the findings. Zero baseline entries would mean
    // the register had been emptied, and empty_scope refusing to resolve on that
    // is exactly right — an empty list of things to watch for is not an
    // all-clear.
    return {
      scopeCount: SAFETY_BASELINE.length,
      findings: deriveRegressionFindings(others),
    };
  },
};
