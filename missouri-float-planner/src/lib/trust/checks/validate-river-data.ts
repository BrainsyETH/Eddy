// src/lib/trust/checks/validate-river-data.ts
// Wraps validate_river_data(), the twenty-rule SQL check that has existed since
// 00146 and been sharpened twice since (00147, 00164).
//
// Nothing here detects anything. The function is already good and already runs
// every rule Eddy cares about across its active rivers; what it has never had is
// anywhere to put the answer. `npm run db:validate` prints to a terminal and
// exits, so the output lives exactly as long as the scrollback, and nothing can
// tell whether a finding is new, six weeks old, or one somebody fixed in March
// and broke again in June.
//
// The one judgement this file makes is that the SQL's own 'error' | 'warning'
// is not the severity the console shows — see severity.ts for why — but it is
// preserved in evidence.sqlSeverity so the disagreement stays inspectable.

import type { RawFinding, TrustCheck, TrustCheckContext, TrustCheckResult } from '../types';

interface ValidateRow {
  river_slug: string;
  check_name: string;
  severity: string;
  detail: string;
}

/**
 * Rules whose subject is a gauge rather than a river.
 *
 * `gauge_missing_site_id` is about a gauge_stations row, so it is filed under
 * entityType 'gauge' — which also keeps it from colliding with a river of a
 * similar name.
 *
 * Its key is now the gauge station's UUID
 * (20260804192753_validate_river_data_stable_gauge_key.sql). It used to be
 * COALESCE(r.slug, gs.name), which meant an unlinked gauge was identified by
 * its DISPLAY NAME — so an editorial rename forked the finding's identity — and
 * a gauge linked to two rivers produced two findings for one problem.
 */
const GAUGE_SCOPED_RULES = new Set(['gauge_missing_site_id']);

export function toRawFinding(row: ValidateRow): RawFinding {
  const isGaugeScoped = GAUGE_SCOPED_RULES.has(row.check_name);
  return {
    entityType: isGaugeScoped ? 'gauge' : 'river',
    entityKey: row.river_slug,
    ruleKey: row.check_name,
    // A stable key is the right thing to fingerprint and the wrong thing to
    // show a person: for the gauge-scoped rules it is a UUID. The SQL puts the
    // station's name in the detail precisely so the title can stay readable
    // without the fingerprint depending on it.
    title: isGaugeScoped ? row.detail : `${row.river_slug}: ${row.check_name.replace(/_/g, ' ')}`,
    detail: row.detail,
    evidence: {
      sqlSeverity: row.severity,
      source: 'validate_river_data()',
      ...(isGaugeScoped ? { gaugeStationId: row.river_slug } : {}),
    },
  };
}

export const validateRiverDataCheck: TrustCheck = {
  id: 'validate_river_data',
  title: 'River data validation (SQL)',
  cadence: 'hourly',

  async run(ctx: TrustCheckContext): Promise<TrustCheckResult> {
    const { data, error } = await ctx.supabase.rpc('validate_river_data');
    if (error) {
      throw new Error(`validate_river_data() failed: ${error.message}`);
    }

    // The function only evaluates active rivers, so the active count is its
    // real scope. Counting the returned ROWS instead would be the classic
    // mistake: zero findings is the healthy case, and reading it as "examined
    // nothing" would suppress reconciliation exactly when everything is fine.
    const { count, error: countError } = await ctx.supabase
      .from('rivers')
      .select('id', { count: 'exact', head: true })
      .eq('active', true);

    if (countError) {
      throw new Error(`Failed to count active rivers: ${countError.message}`);
    }

    const rows: ValidateRow[] = data ?? [];
    return { scopeCount: count ?? 0, findings: rows.map(toRawFinding) };
  },
};
