// src/lib/trust/resolution.ts
// Why a finding closed — and the only reason the MVP gate is measurable.
//
// ── The gate this exists for ─────────────────────────────────────────────
//
// EDDY_AGENT_FRAMEWORK_PLAN.md's Trust MVP gate requires "fewer than 20% false
// positives among reviewed findings". Nothing could answer that. A finding had
// a status and a timestamp, so the ledger could say a finding CLOSED and could
// not say whether it closed because somebody fixed the river or because the
// check had been wrong about it all along. Those are opposite outcomes: one is
// the system working, the other is the system crying wolf, and a status column
// scores them identically.
//
// ── Why five values and not two ──────────────────────────────────────────
//
// The temptation is `fixed | false_positive`. That produces a denominator with
// a lie in it, because most findings close without anyone looking at them: a
// check simply stops emitting one and reconciliation resolves it. Folding those
// into "fixed" would swamp the reviewed set with unreviewed rows and drive the
// false-positive rate toward zero exactly as the console filled with noise —
// the metric would look best when the system was worst.
//
// So the unreviewed closures are named as unreviewed, and the rate is computed
// over human judgements only. A gate you can pass by not looking is not a gate.
export const RESOLUTIONS = [
  /** A person repaired the underlying problem. */
  'fixed',
  /** A person judged there was nothing to fix — the check was wrong. */
  'false_positive',
  /** Real, understood, and being lived with. Not a failure of the check. */
  'accepted',
  /** The check stopped emitting it and reconciliation closed it. Nobody looked. */
  'auto_resolved',
  /** The decay rule closed it as stale informational noise. Nobody looked. */
  'expired',
] as const;

export type Resolution = (typeof RESOLUTIONS)[number];

/**
 * The three a human can choose.
 *
 * `auto_resolved` and `expired` are written by machinery and must not be
 * offerable in the console: an operator picking "auto resolved" would be
 * recording that nobody looked at a finding they are, demonstrably, looking at.
 */
export const OPERATOR_RESOLUTIONS: readonly Resolution[] = ['fixed', 'false_positive', 'accepted'];

export function isOperatorResolution(value: unknown): value is Resolution {
  return typeof value === 'string' && (OPERATOR_RESOLUTIONS as readonly string[]).includes(value);
}

/** What the console shows on the button, and what the log reads like later. */
export const RESOLUTION_LABEL: Record<Resolution, string> = {
  fixed: 'Fixed',
  false_positive: 'Not a real problem',
  accepted: 'Accepted as-is',
  auto_resolved: 'Closed by the check',
  expired: 'Expired unactioned',
};

export interface ReviewTally {
  fixed: number;
  false_positive: number;
  accepted: number;
  auto_resolved: number;
  expired: number;
  /** Closed before this column existed. Excluded from every rate. */
  unknown: number;
}

export interface ReviewMetrics {
  tally: ReviewTally;
  /** fixed + false_positive + accepted. The gate's denominator. */
  reviewed: number;
  /**
   * Null until there is anything to divide by.
   *
   * Deliberately not 0. A rate of zero reads as "no false positives", which is
   * the same sentence a system with no data produces — and treating an absence
   * of evidence as a passing score is the failure this whole subsystem is
   * about.
   */
  falsePositiveRate: number | null;
  /** Whether the gate's < 20% criterion is currently met. Null when unknown. */
  meetsGate: boolean | null;
}

export const FALSE_POSITIVE_GATE = 0.2;

/** Pure. Rows in, gate answer out. */
export function reviewMetrics(rows: readonly { resolution: string | null }[]): ReviewMetrics {
  const tally: ReviewTally = {
    fixed: 0,
    false_positive: 0,
    accepted: 0,
    auto_resolved: 0,
    expired: 0,
    unknown: 0,
  };

  for (const row of rows) {
    const key = (RESOLUTIONS as readonly string[]).includes(row.resolution ?? '')
      ? (row.resolution as Resolution)
      : 'unknown';
    tally[key] += 1;
  }

  const reviewed = tally.fixed + tally.false_positive + tally.accepted;
  const falsePositiveRate = reviewed === 0 ? null : tally.false_positive / reviewed;

  return {
    tally,
    reviewed,
    falsePositiveRate,
    meetsGate: falsePositiveRate === null ? null : falsePositiveRate < FALSE_POSITIVE_GATE,
  };
}

/**
 * How many more findings must be reviewed before the rate means anything.
 *
 * A single false positive out of two reviews is 50% and says nothing. The gate
 * is a four-week measurement, so the console should say "not enough yet" rather
 * than flash red at the first disagreement — the opposite mistake from the one
 * above, and just as good at getting a dashboard ignored.
 */
export const MIN_REVIEWS_FOR_RATE = 10;

export function rateIsMeaningful(metrics: ReviewMetrics): boolean {
  return metrics.reviewed >= MIN_REVIEWS_FOR_RATE;
}
