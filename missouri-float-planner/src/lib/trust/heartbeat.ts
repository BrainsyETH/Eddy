// src/lib/trust/heartbeat.ts
// Is the ledger still running at all?
//
// ── The hole this fills ─────────────────────────────────────────────────
//
// Every guard in reconcile.ts protects against a check LYING — one that throws,
// or examines nothing, or reports an implausible all-clear. None of them
// protects against the ledger going SILENT. If /api/cron/trust-tick stops
// firing, no rows are written, no finding changes, and the console shows a calm
// list of open findings that is indistinguishable from a healthy system.
//
// That is the same failure shape as everything the ledger found on its first
// day — a monitoring gap that looks like health — and it was the last instance
// of it left in the design.
//
// ── Why the watchdog cannot live only inside the ledger ─────────────────
//
// A check that reports "the ledger has not run" cannot run when the ledger is
// not running. So this module is consumed twice:
//
//   1. As a trust check, which catches ONE check being wedged while the tick
//      itself is fine. Useful, and structurally incapable of catching its own
//      absence.
//   2. From /api/cron/update-gauges, which runs every 15 minutes, is
//      independently load-bearing, and reaches Sentry through logger.error
//      (registered in instrumentation.ts). That is the half that survives the
//      trust tick dying.
//
// Pure and I/O-free so both callers share one definition of "overdue".

export interface CheckHeartbeat {
  checkId: string;
  cadence: 'hourly' | 'daily';
  /** Null when the check has never run. */
  lastStartedAt: Date | null;
}

export interface HeartbeatVerdict {
  checkId: string;
  overdue: boolean;
  /** Null when never run — "infinitely late" is not a useful number. */
  hoursLate: number | null;
  detail: string;
}

/**
 * How far past its cadence a check may drift before it counts as overdue.
 *
 * Generous on purpose. Cron firing times wander, a run can take a minute, and a
 * deploy mid-tick skips one pass — none of which is a fault. The number that
 * matters is "has it stopped", not "was it a bit late", and 2.5x separates
 * those without a stream of false alarms.
 */
export const OVERDUE_MULTIPLIER = 2.5;

const CADENCE_HOURS: Record<CheckHeartbeat['cadence'], number> = { hourly: 1, daily: 24 };

/**
 * How many ticks must have fired without touching a never-run check before it
 * counts as overdue.
 *
 * Two, not one. A check that ships minutes after a tick has legitimately missed
 * that tick; it cannot legitimately miss the next one, because isCheckDue()
 * returns true for a null lastStartedAt and orderByStaleness() sorts never-run
 * to the FRONT. So one missed tick is a deploy, and two is a fault.
 */
export const NEVER_RUN_GRACE_TICKS = 2;

export interface HeartbeatContext {
  /**
   * Ticks observed within this check's allowance window — any check's runs
   * count, because the question is whether the scheduler had opportunities.
   *
   * Omitted means unknown, and unknown is NOT treated as healthy for a
   * never-run check; it is reported as indeterminate instead.
   */
  ticksInWindow?: number;
}

/**
 * A never-run check is not exempt forever.
 *
 * The first version returned `overdue: false` unconditionally for a null
 * lastStartedAt, reasoning that it would otherwise fire on every deploy adding
 * a check. That reasoning was right about the symptom and wrong about the fix:
 * it made a registered check that NEVER executes permanently invisible, which
 * is the one state a heartbeat exists to catch.
 *
 * The bounded reference is the tick count rather than a deploy timestamp, which
 * is not available here — and it is a better signal anyway, because it measures
 * opportunities the scheduler actually had rather than wall-clock time.
 */
export function assessHeartbeat(
  beat: CheckHeartbeat,
  now: Date,
  context: HeartbeatContext = {},
): HeartbeatVerdict {
  if (!beat.lastStartedAt) {
    const ticks = context.ticksInWindow;

    if (ticks === undefined) {
      return {
        checkId: beat.checkId,
        overdue: false,
        hoursLate: null,
        detail: `${beat.checkId} has never run, and tick history was not supplied — liveness indeterminate`,
      };
    }

    const overdue = ticks >= NEVER_RUN_GRACE_TICKS;
    return {
      checkId: beat.checkId,
      overdue,
      hoursLate: null,
      detail: overdue
        ? `${beat.checkId} has never run despite ${ticks} tick(s) — it is registered and being skipped`
        : `${beat.checkId} has never run, ${ticks} tick(s) so far — expected on the next pass`,
    };
  }

  const allowedHours = CADENCE_HOURS[beat.cadence] * OVERDUE_MULTIPLIER;
  const elapsedHours = (now.getTime() - beat.lastStartedAt.getTime()) / 3_600_000;
  const overdue = elapsedHours > allowedHours;

  return {
    checkId: beat.checkId,
    overdue,
    hoursLate: overdue ? Math.round((elapsedHours - allowedHours) * 10) / 10 : 0,
    detail: overdue
      ? `${beat.checkId} (${beat.cadence}) last ran ${Math.round(elapsedHours)}h ago, past its ${Math.round(allowedHours)}h allowance`
      : `${beat.checkId} last ran ${Math.round(elapsedHours * 10) / 10}h ago`,
  };
}

/**
 * The single question the independent watchdog asks: has the tick stopped?
 *
 * Keyed off the most recent run of ANY check rather than per-check, because
 * from outside the ledger that is the only thing worth knowing — one wedged
 * check is a finding, a dead scheduler is an outage.
 */
export function isLedgerSilent(
  mostRecentRunAt: Date | null,
  now: Date,
  toleranceHours = 3,
): { silent: boolean; hoursSinceLastRun: number | null } {
  if (!mostRecentRunAt) return { silent: false, hoursSinceLastRun: null };
  const hours = (now.getTime() - mostRecentRunAt.getTime()) / 3_600_000;
  return { silent: hours > toleranceHours, hoursSinceLastRun: Math.round(hours * 10) / 10 };
}
