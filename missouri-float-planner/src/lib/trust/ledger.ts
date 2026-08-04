// src/lib/trust/ledger.ts
// Runs one check and writes what it learned.
//
// This is the I/O half. Every decision it makes comes from reconcile.ts,
// severity.ts and fingerprint.ts, all of which are pure and tested; what lives
// here is the ordering of the writes and the handling of the ways a database
// can disagree with you.

import { mustRow, mustRows, mustWrite, mustWriteReturning } from './db';
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
  //
  // If the row cannot be written at all, there is nowhere to anchor evidence and
  // the database is unreachable for everything that follows, so this bails
  // rather than running the check into a void. The absence of a trust_runs row
  // is itself observable: the heartbeat sees the check go stale and files
  // check_not_running at critical.
  let runId: string | null = null;
  try {
    const runRow = await mustWriteReturning<{ id: string }>(
      supabase
        .from('trust_runs')
        .insert({
          check_id: check.id,
          status: 'error',
          error_detail: 'run did not complete',
          git_sha: options.gitSha ?? null,
        })
        .select('id')
        .single(),
      `could not open a trust_runs row for ${check.id}`,
    );
    runId = runRow?.id ?? null;
  } catch (error) {
    return {
      checkId: check.id,
      runId: null,
      status: 'error',
      scopeCount: 0,
      raised: 0,
      touched: 0,
      resolved: 0,
      errorDetail: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
    };
  }

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

  // An unreadable open set is NOT an empty one.
  //
  // Substituting `[]` here was the most dangerous instance of the discarded-error
  // family: with no open fingerprints, every emitted finding classifies as new,
  // the inserts collide with the unique fingerprint constraint, those failures
  // are ignored too, and the run reports a pile of findings it did not write.
  // Nothing resolves, nothing is touched, and the counts are fiction.
  //
  // Demoting it to a check failure routes it through the refusal path that
  // already exists and is already tested: planReconcile() refuses everything on
  // checkStatus 'error', so the run changes nothing and says so.
  let existing: ExistingFindingRow[] = [];
  try {
    existing = await mustRows<ExistingFindingRow>(
      supabase
        .from('trust_findings')
        .select('id, fingerprint, status, occurrences, snoozed_until')
        .eq('check_id', check.id),
      `could not read the open findings for ${check.id}`,
    );
  } catch (error) {
    checkStatus = 'error';
    errorDetail = error instanceof Error ? error.message : String(error);
    existing = [];
  }

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

  // APPLIED counts, not planned counts.
  //
  // The summary these feed is what the cron logs and what the admin console
  // shows after a manual run, and it used to report `plan.raise.length` —
  // the number of writes ATTEMPTED. A write that failed was counted as a
  // finding raised. Counting after the write is what makes the number evidence
  // rather than intent.
  let raised = 0;
  let touched = 0;
  let resolved = 0;
  let writeFailure: string | undefined;

  try {
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
        // A finding may arrive pre-triaged — see RawFinding.snoozeUntil. Today
        // that means a schema deviation somebody has accepted, with an owner
        // and an expiry, in exceptions.ts. The expiry is an ordinary snooze
        // deadline from here on, so the finding wakes itself when it lapses.
        status: finding.snoozeUntil ? 'snoozed' : 'open',
        title: finding.title,
        detail: finding.detail,
        evidence: finding.evidence ?? {},
        last_seen_at: nowIso,
        resolved_at: null,
        snoozed_until: finding.snoozeUntil ?? null,
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
        await mustWrite(
          supabase
            .from('trust_findings')
            .update({ ...row, occurrences: (prior.occurrences ?? 1) + 1 })
            .eq('id', prior.id),
          `could not re-raise ${finding.ruleKey} on ${finding.entityKey}`,
        );
      } else {
        await mustWrite(
          supabase.from('trust_findings').insert(row),
          `could not raise ${finding.ruleKey} on ${finding.entityKey}`,
        );
      }
      raised += 1;
    }

    // Touched: still true. Refresh the values without disturbing identity,
    // status or occurrences — a snoozed finding stays snoozed.
    for (const fp of plan.touch) {
      const finding = emittedByFingerprint.get(fp);
      const prior = byFingerprint.get(fp);
      if (!finding || !prior) continue;
      await mustWrite(
        supabase
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
          .eq('id', prior.id),
        `could not refresh ${finding.ruleKey} on ${finding.entityKey}`,
      );
      touched += 1;
    }

    if (plan.resolve.length > 0) {
      const ids = plan.resolve
        .map((fp) => byFingerprint.get(fp)?.id)
        .filter((id): id is string => Boolean(id));
      if (ids.length > 0) {
        await mustWrite(
          supabase
            .from('trust_findings')
            .update({
              status: 'resolved',
              resolved_at: nowIso,
              snoozed_until: null,
              last_run_id: runId,
            })
            .in('id', ids),
          `could not resolve ${ids.length} finding(s) for ${check.id}`,
        );
        resolved = ids.length;
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
      await mustWrite(
        supabase
          .from('trust_findings')
          .update({
            status: 'resolved',
            resolved_at: nowIso,
            snoozed_until: null,
            last_run_id: runId,
          })
          .eq('check_id', check.id)
          .eq('rule_key', 'reconcile_anomaly')
          .neq('status', 'resolved'),
        `could not clear the standing reconcile_anomaly for ${check.id}`,
      );
    }
  } catch (error) {
    // A write that failed partway leaves the ledger holding some of this run's
    // changes and not others. The counts above already say how far it got; this
    // makes the run itself read as failed, so nothing downstream treats a
    // half-applied pass as a completed one.
    writeFailure = error instanceof Error ? error.message : String(error);
  }

  // An empty scope is recorded as an ERROR, not as a successful run that found
  // nothing — TRUST_LEDGER_V1_PLAN.md:316. Reconciliation was already refused
  // by planReconcile(), but the run row said `ok`, so a check that examined
  // nothing showed a normal green timestamp in the console and counted as a
  // healthy recent run everywhere that keys on status.
  //
  // "I looked at zero things and found zero problems" is the exact sentence
  // this subsystem exists to stop anyone believing.
  if (plan.suppressedReason === 'empty_scope' && checkStatus === 'ok') {
    checkStatus = 'error';
    errorDetail = errorDetail ?? `${check.id} examined 0 entities`;
  }

  if (writeFailure) {
    checkStatus = 'error';
    errorDetail = errorDetail ? `${errorDetail}; ${writeFailure}` : writeFailure;
  }

  const durationMs = Date.now() - startedAt;

  if (runId) {
    try {
      await mustWrite(
        supabase
          .from('trust_runs')
          .update({
            status: checkStatus,
            finished_at: nowIso,
            suppressed_reason: plan.suppressedReason ?? null,
            scope_count: scopeCount,
            findings_raised: raised,
            findings_touched: touched,
            findings_resolved: resolved,
            duration_ms: durationMs,
            error_detail: errorDetail ?? null,
          })
          .eq('id', runId),
        `could not finalize the trust_runs row for ${check.id}`,
      );
    } catch (error) {
      // The row keeps its pessimistic 'error' / 'run did not complete' state,
      // which is the correct reading — the run genuinely did not finish being
      // recorded. Reflected in the summary so the caller does not report a
      // clean pass over a run row that never closed.
      checkStatus = 'error';
      const message = error instanceof Error ? error.message : String(error);
      errorDetail = errorDetail ? `${errorDetail}; ${message}` : message;
    }
  }

  return {
    checkId: check.id,
    runId,
    status: checkStatus,
    scopeCount,
    raised,
    touched,
    resolved,
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
  const prior = await mustRow<{ id: string; occurrences: number }>(
    supabase.from('trust_findings').select('id, occurrences').eq('fingerprint', fp).maybeSingle(),
    `could not look up the standing reconcile_anomaly for ${args.check.id}`,
  );

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
    snoozed_until: null,
    last_run_id: args.runId,
  };

  if (prior) {
    await mustWrite(
      supabase.from('trust_findings').update(row).eq('id', prior.id),
      `could not refresh the reconcile_anomaly for ${args.check.id}`,
    );
  } else {
    await mustWrite(
      supabase.from('trust_findings').insert(row),
      `could not file the reconcile_anomaly for ${args.check.id}`,
    );
  }
}
