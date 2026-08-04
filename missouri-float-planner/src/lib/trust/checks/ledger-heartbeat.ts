// src/lib/trust/checks/ledger-heartbeat.ts
// The ledger watching its own checks.
//
// ── Why this exists as a registered check ────────────────────────────────
//
// heartbeat.ts previously claimed in its header to be consumed as a trust
// check. It was not — it reached only the admin run-status endpoint and the
// external watchdog in update-gauges. The difference matters: a status endpoint
// is visible when somebody opens the console, and a finding persists, carries
// severity, and shows up in the same list as everything else.
//
// So a wedged individual check was visible only to somebody already looking,
// while the whole-ledger watchdog stayed green because the OTHER checks kept
// the heartbeat alive. That is the failure this file closes.
//
// ── What it can and cannot catch ─────────────────────────────────────────
//
// It catches one check falling behind while the tick keeps running. It cannot
// catch the tick stopping altogether — nothing running inside the ledger can —
// which is why the independent watchdog in /api/cron/update-gauges exists and
// is not replaced by this.

import { assessHeartbeat, type CheckHeartbeat } from '../heartbeat';
import type { RawFinding, TrustCheck, TrustCheckContext, TrustCheckResult } from '../types';

/** Pure. Verdicts in, findings out. */
export function deriveHeartbeatFindings(
  beats: readonly CheckHeartbeat[],
  now: Date,
  ticksInWindow: number,
): RawFinding[] {
  return beats
    .map((beat) => assessHeartbeat(beat, now, { ticksInWindow }))
    .filter((v) => v.overdue)
    .map((v) => ({
      entityType: 'global' as const,
      entityKey: v.checkId,
      ruleKey: 'check_not_running',
      title: `${v.checkId} has stopped running`,
      detail: `${v.detail}. Everything this check reports is stale, and its silence is not evidence of health.`,
      evidence: { checkId: v.checkId, hoursLate: v.hoursLate, ticksInWindow },
    }));
}

export const ledgerHeartbeatCheck: TrustCheck = {
  id: 'ledger_heartbeat',
  title: 'Trust check liveness',
  cadence: 'hourly',

  async run(ctx: TrustCheckContext): Promise<TrustCheckResult> {
    // Imported here rather than at module scope: registry.ts imports this file
    // to register the check, so a top-level import would be a cycle and the
    // registry would be half-initialised when this module evaluated.
    const { TRUST_CHECKS } = await import('../registry');

    // Every check EXCEPT this one. Including itself would be circular in the
    // other sense: it is running, so it is trivially alive.
    const others = TRUST_CHECKS.filter((c) => c.id !== 'ledger_heartbeat');

    const beats: CheckHeartbeat[] = [];
    for (const c of others) {
      const { data, error } = await ctx.supabase
        .from('trust_runs')
        .select('started_at')
        .eq('check_id', c.id)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Read errors abort rather than degrade. An unreadable trust_runs would
      // otherwise make every check look never-run, and this check would file a
      // finding against all of them — noise whose cause is invisible.
      if (error) {
        throw new Error(`could not read trust_runs for ${c.id}: ${error.message}`);
      }

      beats.push({
        checkId: c.id,
        cadence: c.cadence,
        lastStartedAt: data?.started_at ? new Date(data.started_at) : null,
      });
    }

    // Opportunities the scheduler actually had, over the widest allowance any
    // check uses. This is the bounded reference that stops a never-run check
    // being exempt forever without firing on the deploy that adds one.
    const windowStart = new Date(ctx.now.getTime() - 24 * 2.5 * 3_600_000).toISOString();
    const { count, error: countError } = await ctx.supabase
      .from('trust_runs')
      .select('id', { count: 'exact', head: true })
      .gte('started_at', windowStart);

    if (countError) {
      throw new Error(`could not count trust_runs: ${countError.message}`);
    }

    return {
      scopeCount: beats.length,
      findings: deriveHeartbeatFindings(beats, ctx.now, count ?? 0),
    };
  },
};
