// src/lib/trust/ledger.ts
// Runs one check and writes what it learned.
//
// This is the I/O half. Every decision it makes comes from reconcile.ts,
// severity.ts and fingerprint.ts, all of which are pure and tested; what lives
// here is the ordering of the writes and the handling of the ways a database
// can disagree with you.

import { fingerprint } from './fingerprint';
import {
  planReconcile,
  reconcileAnomalyDetail,
  suppressionWarrantsFinding,
  type SuppressedReason,
} from './reconcile';
import { severityForRule } from './severity';
import type { RawFinding, TrustCheck } from './types';

export interface ExistingFindingRow {
  id: string;
  fingerprint: string;
  status: 'open' | 'snoozed' | 'resolved';
  occurrences: number;
  snoozed_until: string | null;
}

export interface RunSummary {
  checkId: string;
  runId: string | null;
  status: 'ok' | 'error';
  scopeCount: number;
  raised: number;
  touched: number;
  resolved: number;
  suppressedReason?: SuppressedReason;
  errorDetail?: string;
  durationMs: number;
}

/**
 * Splits what is already on file into the two sets reconciliation needs.
 *
 * Pure, and separated because of the snooze-expiry case: a row still marked
 * 'snoozed' whose deadline has passed must be treated as open, or a finding
 * snoozed for a day would be shielded from resolution forever and never
 * re-surface either.
 */
export function classifyExisting(
  rows: readonly ExistingFindingRow[],
  now: Date,
): { openFingerprints: string[]; snoozedFingerprints: string[] } {
  const openFingerprints: string[] = [];
  const snoozedFingerprints: string[] = [];

  for (const row of rows) {
    if (row.status === 'resolved') continue;
    const stillSnoozed =
      row.status === 'snoozed' &&
      row.snoozed_until !== null &&
      new Date(row.snoozed_until).getTime() > now.getTime();
    if (stillSnoozed) snoozedFingerprints.push(row.fingerprint);
    else openFingerprints.push(row.fingerprint);
  }

  return { openFingerprints, snoozedFingerprints };
}

export async function runTrustCheck(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  check: TrustCheck,
  options: { now: Date; deadlineMs: number; gitSha?: string },
): Promise<RunSummary> {
  const startedAt = Date.now();

  // Opened pessimistically. If this function is killed partway — a Vercel
  // timeout, a deploy mid-run — the row it leaves behind correctly reads as a
  // failure rather than as a run that quietly reported nothing.
  const { data: runRow } = await supabase
    .from('trust_runs')
    .insert({
      check_id: check.id,
      status: 'error',
      error_detail: 'run did not complete',
      git_sha: options.gitSha ?? null,
    })
    .select('id')
    .single();

  const runId: string | null = runRow?.id ?? null;

  let emitted: RawFinding[] = [];
  let scopeCount = 0;
  let partial = false;
  let checkStatus: 'ok' | 'error' = 'ok';
  let errorDetail: string | undefined;

  try {
    const result = await check.run({
      supabase,
      now: options.now,
      deadlineMs: options.deadlineMs,
    });
    emitted = result.findings;
    scopeCount = result.scopeCount;
    partial = result.partial === true;
  } catch (error) {
    checkStatus = 'error';
    errorDetail = error instanceof Error ? error.message : String(error);
  }

  const { data: existingRows } = await supabase
    .from('trust_findings')
    .select('id, fingerprint, status, occurrences, snoozed_until')
    .eq('check_id', check.id);

  const existing: ExistingFindingRow[] = existingRows ?? [];
  const byFingerprint = new Map(existing.map((row) => [row.fingerprint, row]));
  const { openFingerprints, snoozedFingerprints } = classifyExisting(existing, options.now);

  const emittedByFingerprint = new Map<string, RawFinding>();
  for (const finding of emitted) {
    emittedByFingerprint.set(fingerprint(check.id, finding), finding);
  }

  const plan = planReconcile({
    checkStatus,
    scopeCount,
    partial,
    openFingerprints,
    snoozedFingerprints,
    emittedFingerprints: [...emittedByFingerprint.keys()],
  });

  const nowIso = options.now.toISOString();

  // Raised: brand new, or a fingerprint that had been resolved and is back.
  // Recurrence keeps the original first_seen_at, which is the only way the
  // console can tell "broken since March" from "broke again last night".
  for (const fp of plan.raise) {
    const finding = emittedByFingerprint.get(fp);
    if (!finding) continue;
    const prior = byFingerprint.get(fp);
    const row = {
      fingerprint: fp,
      check_id: check.id,
      rule_key: finding.ruleKey,
      entity_type: finding.entityType,
      entity_key: finding.entityKey,
      severity: severityForRule(finding.ruleKey),
      status: 'open',
      title: finding.title,
      detail: finding.detail,
      evidence: finding.evidence ?? {},
      last_seen_at: nowIso,
      resolved_at: null,
      snoozed_until: null,
      last_run_id: runId,
    };

    if (prior) {
      // occurrences counts EPISODES, not sightings. Incrementing on every touch
      // would reach 24 a day on an hourly check and mean nothing; incrementing
      // only here makes it read as "this has come back N times".
      // `?? 1` rather than a bare +1: the column has a default, so a row
      // written by hand or predating a schema change can arrive without it, and
      // `undefined + 1` is NaN — which Postgres rejects on an integer column,
      // failing the whole update and losing the finding.
      await supabase
        .from('trust_findings')
        .update({ ...row, occurrences: (prior.occurrences ?? 1) + 1 })
        .eq('id', prior.id);
    } else {
      await supabase.from('trust_findings').insert(row);
    }
  }

  // Touched: still true. Refresh the values without disturbing identity,
  // status or occurrences — a snoozed finding stays snoozed.
  for (const fp of plan.touch) {
    const finding = emittedByFingerprint.get(fp);
    const prior = byFingerprint.get(fp);
    if (!finding || !prior) continue;
    await supabase
      .from('trust_findings')
      .update({
        severity: severityForRule(finding.ruleKey),
        title: finding.title,
        detail: finding.detail,
        evidence: finding.evidence ?? {},
        last_seen_at: nowIso,
        last_run_id: runId,
        // Wakes a snooze whose deadline has passed. classifyExisting already
        // treats it as open; this makes the row agree.
        ...(prior.status === 'snoozed' && !snoozedFingerprints.includes(fp)
          ? { status: 'open', snoozed_until: null }
          : {}),
      })
      .eq('id', prior.id);
  }

  if (plan.resolve.length > 0) {
    const ids = plan.resolve
      .map((fp) => byFingerprint.get(fp)?.id)
      .filter((id): id is string => Boolean(id));
    if (ids.length > 0) {
      await supabase
        .from('trust_findings')
        .update({ status: 'resolved', resolved_at: nowIso, last_run_id: runId })
        .in('id', ids);
    }
  }

  // A refusal that reached only the logs would be a monitoring gap of exactly
  // the kind reconcile.ts exists to prevent, so the loud ones go in the ledger
  // beside the findings they are standing in for.
  if (plan.suppressedReason && suppressionWarrantsFinding(plan.suppressedReason)) {
    await writeReconcileAnomaly(supabase, {
      check,
      runId,
      reason: plan.suppressedReason,
      nowIso,
      counts: {
        openCount: openFingerprints.length,
        wouldResolve: openFingerprints.filter((fp) => !emittedByFingerprint.has(fp)).length,
        scopeCount,
      },
    });
  } else if (!plan.suppressedReason) {
    // The check reconciled cleanly, so any standing complaint about it is over.
    await supabase
      .from('trust_findings')
      .update({ status: 'resolved', resolved_at: nowIso, last_run_id: runId })
      .eq('check_id', check.id)
      .eq('rule_key', 'reconcile_anomaly')
      .neq('status', 'resolved');
  }

  const durationMs = Date.now() - startedAt;

  if (runId) {
    await supabase
      .from('trust_runs')
      .update({
        status: checkStatus,
        finished_at: nowIso,
        suppressed_reason: plan.suppressedReason ?? null,
        scope_count: scopeCount,
        findings_raised: plan.raise.length,
        findings_touched: plan.touch.length,
        findings_resolved: plan.resolve.length,
        duration_ms: durationMs,
        error_detail: errorDetail ?? null,
      })
      .eq('id', runId);
  }

  return {
    checkId: check.id,
    runId,
    status: checkStatus,
    scopeCount,
    raised: plan.raise.length,
    touched: plan.touch.length,
    resolved: plan.resolve.length,
    suppressedReason: plan.suppressedReason,
    errorDetail,
    durationMs,
  };
}

async function writeReconcileAnomaly(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  args: {
    check: TrustCheck;
    runId: string | null;
    reason: SuppressedReason;
    nowIso: string;
    counts: { openCount: number; wouldResolve: number; scopeCount: number };
  },
): Promise<void> {
  const finding: RawFinding = {
    entityType: 'global',
    entityKey: args.check.id,
    ruleKey: 'reconcile_anomaly',
    title: `${args.check.title}: reconciliation refused (${args.reason})`,
    detail: reconcileAnomalyDetail(args.check.id, args.reason, args.counts),
    evidence: { reason: args.reason, ...args.counts },
  };

  const fp = fingerprint(args.check.id, finding);
  const { data: prior } = await supabase
    .from('trust_findings')
    .select('id, occurrences')
    .eq('fingerprint', fp)
    .maybeSingle();

  const row = {
    fingerprint: fp,
    check_id: args.check.id,
    rule_key: finding.ruleKey,
    entity_type: finding.entityType,
    entity_key: finding.entityKey,
    severity: severityForRule(finding.ruleKey),
    status: 'open',
    title: finding.title,
    detail: finding.detail,
    evidence: finding.evidence ?? {},
    last_seen_at: args.nowIso,
    resolved_at: null,
    last_run_id: args.runId,
  };

  if (prior) {
    await supabase.from('trust_findings').update(row).eq('id', prior.id);
  } else {
    await supabase.from('trust_findings').insert(row);
  }
}
