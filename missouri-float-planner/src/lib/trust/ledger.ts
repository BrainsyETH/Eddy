// src/lib/trust/ledger.ts
// Runs one check and writes what it learned.
//
// This is the I/O half. Every decision it makes comes from reconcile.ts,
// severity.ts and fingerprint.ts, all of which are pure and tested; what lives
// here is the ordering of the writes and the handling of the ways a database
// can disagree with you.

import { mustRows, mustRpc, mustWriteReturning } from './db';
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

  const durationMs = Date.now() - startedAt;

  // ── one transaction, decided here and applied there ──────────────────
  //
  // Every finding change and the run finalization go to the database as a
  // single call. They used to be six independent round-trips across three
  // loops, so a Vercel timeout or a mid-run deploy could raise some findings,
  // resolve others, and leave the pessimistic run row saying 'error' — a ledger
  // state describing a run that never happened.
  //
  // The DECISION stays here. planReconcile(), severityForRule() and
  // fingerprint() hold every rule that determines whether this system can be
  // believed, they are pure, and they are tested without a database.
  // trust_apply_reconcile() carries no policy; it applies what it is given.
  const payload = {
    run_id: runId,
    check_id: check.id,
    now: nowIso,
    raise: plan.raise
      .map((fp) => {
        const finding = emittedByFingerprint.get(fp);
        if (!finding) return null;
        return {
          fingerprint: fp,
          rule_key: finding.ruleKey,
          entity_type: finding.entityType,
          entity_key: finding.entityKey,
          severity: severityForRule(finding.ruleKey),
          title: finding.title,
          detail: finding.detail,
          evidence: finding.evidence ?? {},
          // A finding may arrive pre-triaged — see RawFinding.snoozeUntil.
          // Today that means a schema deviation somebody has accepted, with an
          // owner and an expiry, in exceptions.ts. From here on it is an
          // ordinary snooze deadline, so it wakes itself when it lapses.
          snoozed_until: finding.snoozeUntil ?? null,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null),
    touch: plan.touch
      .map((fp) => {
        const finding = emittedByFingerprint.get(fp);
        const prior = byFingerprint.get(fp);
        if (!finding || !prior) return null;
        return {
          fingerprint: fp,
          severity: severityForRule(finding.ruleKey),
          title: finding.title,
          detail: finding.detail,
          evidence: finding.evidence ?? {},
          // classifyExisting() already treats a lapsed snooze as open; this
          // makes the row itself agree instead of leaving a stale deadline.
          wake: prior.status === 'snoozed' && !snoozedFingerprints.includes(fp),
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null),
    resolve: plan.resolve,
    // A refusal that reached only the logs would be a monitoring gap of exactly
    // the kind reconcile.ts exists to prevent, so the loud ones go in the ledger
    // beside the findings they are standing in for.
    anomaly:
      plan.suppressedReason && suppressionWarrantsFinding(plan.suppressedReason)
        ? buildReconcileAnomaly({
            check,
            reason: plan.suppressedReason,
            counts: {
              openCount: openFingerprints.length,
              wouldResolve: openFingerprints.filter((fp) => !emittedByFingerprint.has(fp)).length,
              scopeCount,
            },
          })
        : null,
    // The check reconciled cleanly, so any standing complaint about it is over.
    clear_anomaly: !plan.suppressedReason,
    run: {
      status: checkStatus,
      suppressed_reason: plan.suppressedReason ?? null,
      scope_count: scopeCount,
      duration_ms: durationMs,
      error_detail: errorDetail ?? null,
    },
  };

  let raised = 0;
  let touched = 0;
  let resolved = 0;

  try {
    // APPLIED counts, from the database. The summary used to report
    // plan.raise.length — the number of writes ATTEMPTED — so a write that
    // failed still counted as a finding raised.
    const counts = await mustRpc<{ raised: number; touched: number; resolved: number }>(
      supabase.rpc('trust_apply_reconcile', { p_payload: payload }),
      `could not apply the reconciliation for ${check.id}`,
    );
    raised = counts?.raised ?? 0;
    touched = counts?.touched ?? 0;
    resolved = counts?.resolved ?? 0;
  } catch (error) {
    // Nothing was written — that is what the transaction buys. The run row
    // keeps the pessimistic 'error' / 'run did not complete' it was opened
    // with, which is the correct reading of what happened.
    checkStatus = 'error';
    const message = error instanceof Error ? error.message : String(error);
    errorDetail = errorDetail ? `${errorDetail}; ${message}` : message;
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

/**
 * The finding a suppressed run files against itself.
 *
 * Pure — it builds a row for trust_apply_reconcile() to upsert. It used to do
 * its own lookup-then-insert-or-update, which is the read-then-branch the
 * ON CONFLICT in that function replaces: the choice was made from a read taken
 * earlier in the request, and a row created in between made it wrong.
 */
function buildReconcileAnomaly(args: {
  check: TrustCheck;
  reason: SuppressedReason;
  counts: { openCount: number; wouldResolve: number; scopeCount: number };
}) {
  const finding: RawFinding = {
    entityType: 'global',
    entityKey: args.check.id,
    ruleKey: 'reconcile_anomaly',
    title: `${args.check.title}: reconciliation refused (${args.reason})`,
    detail: reconcileAnomalyDetail(args.check.id, args.reason, args.counts),
    evidence: { reason: args.reason, ...args.counts },
  };

  return {
    fingerprint: fingerprint(args.check.id, finding),
    rule_key: finding.ruleKey,
    entity_type: finding.entityType,
    entity_key: finding.entityKey,
    severity: severityForRule(finding.ruleKey),
    title: finding.title,
    detail: finding.detail,
    evidence: finding.evidence ?? {},
  };
}
