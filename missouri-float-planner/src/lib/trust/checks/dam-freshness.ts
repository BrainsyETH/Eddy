// src/lib/trust/checks/dam-freshness.ts
// The first check that looks at the dam layer at all.
//
// ── Why it exists ────────────────────────────────────────────────────────
//
// On 2026-08-22 a merge left sync-dam-history filtering on `d.cdaLocation`
// while the three Nashville dams carry the plural `cdaLocations`. All three
// stopped recording. Nothing failed and nothing fired: the dam pages kept
// rendering live metrics, because seriesFor() reads both location shapes and
// the READ path never touches this table. The freeze was found 53 hours later
// by someone querying dam_metric_readings by hand.
//
// Eleven checks were registered at the time and not one of them touched a dam.
// That is the gap this closes, and the reason it is worth closing above other
// candidates: dam history is the only data in Eddy that cannot be rebuilt.
// A river's mileage can be recomputed and a service's pin re-geocoded whenever
// somebody gets to it; an hour of turbine discharge that has fallen out of
// CWMS's rolling window is gone.
//
// ── Why the scope comes from the TABLE, not the registry ─────────────────
//
// The obvious construction is "every dam sync-dam-history claims, assert a
// recent row". It is wrong, and wrong in the way that makes a ledger useless.
//
// Mark Twain passes that filter — nameplate 2x58 MW, SWPA column CAN, office
// MVS, a cdaLocation — and has never written a row, because its release is a
// daily mean the recorder skips by design and it declares no turbine series.
// So a registry-scoped check opens a finding against Mark Twain on its first
// run and never closes it. A permanently red row is not a warning; it is
// training, and what it teaches is that the open list contains things nobody
// needs to act on. float-endpoint-eligibility.ts makes the same argument about
// why it does not flag every campground.
//
// So the expectation is derived from behaviour: A DAM THAT HAS EVER RECORDED
// HISTORY IS EXPECTED TO KEEP RECORDING IT. New dams enrol themselves on their
// first write. Dams that legitimately never record are never expected, without
// anyone maintaining a list of them.
//
// The blind spot is a dam that SHOULD record and never has — Bagnell is the
// live example, publishing hourly discharge through Ameren that nothing
// stores. That is a coverage gap rather than a regression, and it is covered
// on the static side by usace-registry.test.ts, which fails at merge when a
// dam declares an hourly series the recorder cannot reach. The two guards
// answer different questions on purpose: the test asks "can the recorder see
// this dam", this asks "did the recorder actually get anything".

import type { RawFinding, TrustCheck, TrustCheckContext, TrustCheckResult } from '../types';

/**
 * Hours of silence before a dam is reported.
 *
 * Measured against production 2026-08-24: the fifteen recording dams sat
 * between 2.1 and 4.1 hours stale, which is the floor the design puts there —
 * the cron runs at :25, it drops the hour currently filling because a partial
 * mean would be frozen by the upsert, and CWMS publishes with its own lag.
 *
 * 6 hours leaves about two hours of headroom over the worst NORMAL case, which
 * is enough that a single skipped run does not raise anything and two in a row
 * do. The frozen Nashville dams read 53 hours when they were found.
 */
export const STALE_HOURS = 6;

/**
 * Hours of silence that stop being a blip.
 *
 * A day is past any plausible transient: the recorder re-reads a 48-hour
 * window every pass precisely so a failed run repairs itself on the next one,
 * so nothing that is merely flaky survives this long.
 */
export const FROZEN_HOURS = 24;

export interface DamHistoryAge {
  damId: string;
  /** Newest observed_hour for this dam, across every metric it records. */
  latest: Date;
}

const MS_PER_HOUR = 3_600_000;

/** Pure. Reports dams whose recorded history has stopped advancing. */
export function deriveDamFreshnessFindings(ages: DamHistoryAge[], now: Date): RawFinding[] {
  const findings: RawFinding[] = [];

  for (const age of ages) {
    const hours = (now.getTime() - age.latest.getTime()) / MS_PER_HOUR;
    if (hours < STALE_HOURS) continue;

    const frozen = hours >= FROZEN_HOURS;
    const rounded = Math.round(hours);

    findings.push({
      entityType: 'dam',
      entityKey: age.damId,
      // Two rules rather than one with a severity that moves, because the
      // fingerprint hashes the rule key: a single rule escalating from medium
      // to high would rewrite the same finding's severity in place and lose
      // "this has been frozen since Saturday". Two keys means the frozen
      // finding is its own row with its own first_seen_at.
      ruleKey: frozen ? 'dam_history_frozen' : 'dam_history_stale',
      title: `${age.damId}: no generation history for ${rounded} hours`,
      detail: frozen
        ? `The newest row in dam_metric_readings for this dam is ${rounded} hours old. The recorder re-reads a 48-hour window every pass, so a failed run repairs itself and nothing transient lasts this long — this is the recorder not reaching the dam at all. Check that it still passes recordsHistory() in the registry, and that its series ids still resolve against CWMS. Backfill as soon as the cause is found: CWMS serves a rolling window and these hours cannot be recovered once they leave it.`
        : `The newest row in dam_metric_readings for this dam is ${rounded} hours old; the recording fleet normally sits between 2 and 4. One skipped cron run looks like this and repairs itself on the next pass. If it reaches ${FROZEN_HOURS} hours it will be refiled as frozen.`,
      evidence: {
        damId: age.damId,
        latestObservedHour: age.latest.toISOString(),
        hoursStale: rounded,
        staleThresholdHours: STALE_HOURS,
        frozenThresholdHours: FROZEN_HOURS,
      },
    });
  }

  // Deterministic, so a run's output does not churn on row order.
  return findings.sort((a, b) => a.entityKey.localeCompare(b.entityKey));
}

export const damFreshnessCheck: TrustCheck = {
  id: 'dam_freshness',
  title: 'Dam generation history is still being recorded',
  // Hourly, unlike most detection checks. The window this protects is measured
  // in days and the cost of a late catch is permanent, so the check runs at the
  // cadence of the thing it watches rather than the cadence of a review.
  cadence: 'hourly',

  async run(ctx: TrustCheckContext): Promise<TrustCheckResult> {
    // PostgREST cannot GROUP BY, and the table holds one row per dam per metric
    // per hour — roughly 17k rows at a 730-day retention and growing. Reading
    // it whole to take a max per dam would be absurd, so this reads the newest
    // row per dam by asking for the newest rows overall and keeping the first
    // sighting of each dam.
    //
    // The limit has to exceed (dams x metrics x hours-in-the-freshest-window)
    // or a dam that IS current could be pushed off the end and read as missing
    // rather than fresh. Eighteen dams x 2 metrics x 24 hours is 864; 5000
    // holds several days of that and still transfers three columns.
    const { data, error } = await ctx.supabase
      .from('dam_metric_readings')
      .select('dam_id, observed_hour')
      .order('observed_hour', { ascending: false })
      .limit(5000);

    if (error) {
      throw new Error(`Failed to read dam_metric_readings: ${error.message}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = data ?? [];
    const newest = new Map<string, Date>();
    for (const row of rows) {
      const damId = typeof row.dam_id === 'string' ? row.dam_id : null;
      if (!damId || newest.has(damId)) continue;
      const stamp = new Date(row.observed_hour);
      if (Number.isNaN(stamp.getTime())) continue;
      newest.set(damId, stamp);
    }

    const ages: DamHistoryAge[] = Array.from(newest, ([damId, latest]) => ({ damId, latest }));

    // Scope is the dams that have ever recorded. Zero means either the table is
    // empty or the read is broken, and reconcile.ts refuses to resolve anything
    // on an empty scope — which is what stops a broken query from closing every
    // dam finding as fixed.
    return { scopeCount: ages.length, findings: deriveDamFreshnessFindings(ages, ctx.now) };
  },
};
