'use client';

// src/app/admin/trust/page.tsx
// The trust ledger: what the scheduled checks currently believe is wrong.
//
// Deliberately not a workflow. There is no approve step and nothing here
// executes: the operator reads a finding, goes and fixes the real thing, and the
// next run notices and resolves it on its own.
//
// That is why every finding carries its remediation. Without it the page is a
// list of complaints — "no_too_low_anchor on gasconade" tells you nothing about
// where to go or how to derive the number. With it the page is a worklist.
//
// Resolve is bookkeeping, not repair. Resolving something still true only means
// the next run raises it again with occurrences incremented, which is by design:
// a climbing counter on a repeatedly-resolved finding is the tell that someone
// is clearing the list instead of fixing the river. Snooze is the dismiss.

import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/hooks/useAdminAuth';
import AdminLayout from '@/components/admin/AdminLayout';
import {
  AlertTriangle,
  BellOff,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Terminal,
  Wrench,
  Play,
  Layers,
} from 'lucide-react';
import type { Remediation, RemediationKind } from '@/lib/trust/remediation';
import { SURFACED_BY_DEFAULT } from '@/lib/trust/decay';
import { RESOLUTION_LABEL, type Resolution } from '@/lib/trust/resolution';

type Severity = 'critical' | 'high' | 'medium' | 'low';
type Status = 'open' | 'snoozed' | 'resolved';

interface Finding {
  id: string;
  fingerprint: string;
  checkId: string;
  ruleKey: string;
  entityType: string;
  entityKey: string;
  severity: Severity;
  status: Status;
  title: string;
  detail: string;
  evidence: Record<string, unknown> | null;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
  snoozedUntil: string | null;
  occurrences: number;
  remediation: Remediation;
}

/**
 * `mechanical` reads as a to-do; everything else reads as a caveat. The colours
 * carry that difference, because the operator's first question about a finding
 * is whether it can be actioned now or needs thinking about.
 */
const REMEDIATION_STYLE: Record<RemediationKind, { label: string; className: string }> = {
  mechanical: { label: 'run this', className: 'bg-green-500/20 text-green-400 border-green-500/30' },
  judgment: { label: 'needs judgment', className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  investigate: { label: 'investigate', className: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  deferred: { label: 'deferred', className: 'bg-neutral-500/20 text-neutral-400 border-neutral-500/30' },
  check_bug: { label: 'probably a check bug', className: 'bg-rose-500/20 text-rose-400 border-rose-500/30' },
};

const SEVERITY_STYLE: Record<Severity, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  low: 'bg-neutral-500/20 text-neutral-400 border-neutral-500/30',
};

const STATUS_STYLE: Record<Status, string> = {
  open: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  snoozed: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  resolved: 'bg-green-500/20 text-green-400 border-green-500/30',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Matches MIN_REASON_LENGTH in both trust finding routes. */
const MIN_REASON_LENGTH = 8;

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
}

export default function TrustAdminPage() {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<Status>('open');
  const [severityFilter, setSeverityFilter] = useState<Severity | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [checks, setChecks] = useState<
    {
      id: string;
      title: string;
      cadence: string;
      lastRunAt: string | null;
      lastStatus: string | null;
      // The API has always returned this and the console has never rendered it,
      // so a scheduled pass that refused to reconcile — empty_scope,
      // mass_resolve, check_error — showed a normal timestamp and no error
      // indicator. A refusal is the ledger saying it does not believe itself;
      // it cannot be the one thing the page leaves out.
      lastSuppressedReason: string | null;
      overdue: boolean;
      heartbeat: string;
    }[]
  >([]);
  const [runningCheck, setRunningCheck] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [groupCounts, setGroupCounts] = useState<
    { checkId: string; ruleKey: string; count: number }[]
  >([]);
  const [groupsComplete, setGroupsComplete] = useState(true);
  const [gate, setGate] = useState<{
    operationDays: { value: number; required: number; met: boolean };
    falsePositives: {
      rate: number | null;
      reviewed: number;
      minimumReviews: number;
      meaningful: boolean;
      met: boolean | null;
    };
    safetyBaseline: {
      total: number;
      regressed: { id: string; summary: string }[];
      unverified: { id: string; summary: string; awaitingCheck: string | null }[];
      met: boolean | null;
    };
  } | null>(null);
  const [showAll, setShowAll] = useState(false);
  // ── why this is state and not window.prompt() ──────────────────────────
  //
  // It used to be a dialog. Browsers suppress window.prompt/confirm once a page
  // has shown a few — the "prevent this page from creating additional dialogs"
  // checkbox — and a suppressed prompt returns null, which this code read as
  // "the operator cancelled" and silently did nothing.
  //
  // So every resolve, single and bulk, became a button that swallowed the click:
  // no dialog, no error, no request. Failing quietly is the exact defect this
  // console exists to surface, and it was shipped inside the console.
  const [pending, setPending] = useState<
    | { kind: 'single'; id: string; action: 'resolve' | 'reopen'; resolution?: Resolution }
    | { kind: 'bulk'; checkId: string; ruleKey: string; count: number; resolution: Resolution }
    | null
  >(null);
  const [pendingReason, setPendingReason] = useState('');

  const fetchFindings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ status: statusFilter, limit: '100' });
      if (severityFilter !== 'all') params.set('severity', severityFilter);
      const response = await adminFetch(`/api/admin/trust/findings?${params}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setFindings(data.items ?? []);
      setTotal(data.total ?? 0);
      setGroupCounts(data.groups ?? []);
      setGroupsComplete(data.groupsComplete !== false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load findings');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, severityFilter]);

  useEffect(() => {
    fetchFindings();
  }, [fetchFindings]);

  // The Trust MVP gate, computed rather than remembered. Every criterion in it
  // was previously answerable only by writing SQL by hand, which in practice
  // meant answerable by nobody.
  useEffect(() => {
    adminFetch('/api/admin/trust/review')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setGate(d?.gate ?? null))
      .catch(() => {});
  }, [findings]);

  // The registry, not a hardcoded list — adding a check should not mean editing
  // this page too.
  useEffect(() => {
    adminFetch('/api/admin/trust/run')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setChecks(d?.checks ?? []))
      .catch(() => {});
  }, []);

  async function runCheck(checkId: string) {
    setRunningCheck(checkId);
    setNotice(null);
    setError(null);
    try {
      const response = await adminFetch('/api/admin/trust/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || data.reason || `HTTP ${response.status}`);
      const s = data.summary;
      setNotice(
        `${checkId}: ${s.raised} raised, ${s.touched} still true, ${s.resolved} resolved` +
          (s.suppressedReason ? ` — reconciliation refused (${s.suppressedReason})` : ''),
      );
      await fetchFindings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Run failed');
    } finally {
      setRunningCheck(null);
    }
  }

  async function bulkResolve(
    checkId: string,
    ruleKey: string,
    count: number,
    resolution: Resolution,
    reason: string,
  ) {
    // Two guards, for two different mistakes. The count travels with the
    // request so the server refuses if a scheduled run changed the set. The
    // reason is the confirmation step for the other mistake — a misclick — and
    // unlike a yes/no dialog it leaves something worth reading in the activity
    // log six weeks from now.
    //
    // Both are collected by the in-page panel now rather than by window.prompt,
    // which the browser can suppress into a silent no-op.
    setUpdating(`${checkId}:${ruleKey}`);
    setNotice(null);
    setError(null);
    try {
      const response = await adminFetch('/api/admin/trust/findings/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'resolve',
          checkId,
          ruleKey,
          expectedCount: count,
          reason,
          resolution,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      setNotice(
        `Resolved ${data.updated} × ${ruleKey} (${RESOLUTION_LABEL[resolution].toLowerCase()}).` +
          // Rows that moved between the server's read and its write — a
          // scheduled run or another tab got there first. Normally zero.
          (data.skipped ? ` ${data.skipped} had already moved and were left alone.` : ''),
      );
      if (data.warning) setError(data.warning);
      await fetchFindings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk action failed');
    } finally {
      setUpdating(null);
    }
  }

  /**
   * Open findings grouped by check+rule, for the bulk control.
   *
   * Server-computed over the whole filtered set, not derived from the page. The
   * previous version counted only the first 100 rows the console had loaded,
   * while the bulk endpoint compares against every matching open row — so any
   * group extending past one page produced a permanent 409 the operator could
   * not clear, on exactly the kind of mass false positive the control exists to
   * clear. See /api/admin/trust/findings.
   */
  const groups = Object.fromEntries(
    groupCounts.map((g) => [`${g.checkId}:${g.ruleKey}`, { ...g, n: g.count }]),
  );

  async function act(
    id: string,
    action: 'snooze' | 'resolve' | 'reopen',
    days?: number,
    resolution?: Resolution,
    reason?: string,
  ) {
    setUpdating(id);
    setNotice(null);
    setError(null);
    try {
      const response = await adminFetch(`/api/admin/trust/findings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          ...(days ? { days } : {}),
          ...(reason ? { reason } : {}),
          ...(resolution ? { resolution } : {}),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      // A lost audit record is not a failure of the action, but it is not a
      // clean success either, and showing the same green message for both is
      // how the trail goes missing without anyone noticing.
      if (data.warning) setError(data.warning);
      await fetchFindings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setUpdating(null);
    }
  }

  /**
   * Closing or re-opening a finding is a judgement no check made, and the status
   * transition alone does not record it — six weeks later "resolved" says what
   * happened and nothing about whether it was ever real. So both ask why.
   *
   * Snooze does not: it is bounded, self-expiring, and the most-used control
   * here, and a confirmation step on every "not now" is how an operator learns
   * to stop reading the list.
   */
  function startAction(next: NonNullable<typeof pending>) {
    setPendingReason('');
    setError(null);
    setNotice(null);
    setPending(next);
  }

  async function confirmPending() {
    if (!pending) return;
    const reason = pendingReason.trim();
    if (reason.length < MIN_REASON_LENGTH) {
      setError(`A reason of at least ${MIN_REASON_LENGTH} characters is required.`);
      return;
    }
    const current = pending;
    setPending(null);
    setPendingReason('');

    if (current.kind === 'single') {
      await act(current.id, current.action, undefined, current.resolution, reason);
    } else {
      await bulkResolve(current.checkId, current.ruleKey, current.count, current.resolution, reason);
    }
  }

  const criticalCount = findings.filter((f) => f.severity === 'critical').length;

  // Bounded by default. The API already returns worst-first (severity_rank,
  // then last_seen_at), so taking the head is taking the most important ones.
  const visibleFindings = showAll ? findings : findings.slice(0, SURFACED_BY_DEFAULT);
  const hiddenCount = findings.length - visibleFindings.length;

  return (
    <AdminLayout
      title="Trust"
      description="What the scheduled data checks currently believe is wrong."
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-neutral-400">Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as Status)}
              className="px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="open">Open</option>
              <option value="snoozed">Snoozed</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-neutral-400">Severity:</label>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as Severity | 'all')}
              className="px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">All</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        <button
          onClick={fetchFindings}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-white rounded-lg text-sm transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {checks.length > 0 && (
        <div className="mb-6 bg-neutral-800 border border-neutral-700 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Play className="w-4 h-4 text-neutral-400" />
            <span className="text-sm text-neutral-300">Run a check now</span>
            <span className="text-xs text-neutral-500">
              daily checks otherwise wait until their next scheduled pass
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {checks.map((c) => (
              <button
                key={c.id}
                onClick={() => runCheck(c.id)}
                disabled={runningCheck !== null}
                className="flex items-center gap-2 px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-white rounded-lg text-sm transition-colors disabled:opacity-50"
                title={
                  c.lastSuppressedReason
                    ? `${c.heartbeat} — last run refused to reconcile (${c.lastSuppressedReason})`
                    : c.heartbeat
                }
              >
                {runningCheck === c.id ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                {c.id}
                {/* A calm list of findings looks the same whether the ledger ran
                    an hour ago or stopped last week. This is where that shows. */}
                <span
                  className={`text-xs ${
                    c.overdue
                      ? 'text-red-400'
                      : c.lastStatus === 'error'
                        ? 'text-amber-400'
                        : 'text-neutral-400'
                  }`}
                >
                  {c.overdue
                    ? 'overdue'
                    : c.lastRunAt
                      ? formatDate(c.lastRunAt)
                      : 'never run'}
                </span>
                {/* A refusal is the ledger declining to believe itself, and the
                    console rendered a normal timestamp for it — so a scheduled
                    empty_scope or mass_resolve pass looked exactly like a
                    healthy one. partial_scope is excluded: a check that ran out
                    of its time budget is ordinary, and badging it would teach
                    the operator to ignore the badge. */}
                {c.lastSuppressedReason && c.lastSuppressedReason !== 'partial_scope' && (
                  <span
                    className="px-1.5 py-0.5 text-xs rounded-full bg-red-500/20 text-red-400 border border-red-500/30"
                    title={`Reconciliation refused: ${c.lastSuppressedReason}`}
                  >
                    refused
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {Object.keys(groups).length > 0 && statusFilter === 'open' && (
        <div className="mb-6 bg-neutral-800 border border-neutral-700 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Layers className="w-4 h-4 text-neutral-400" />
            <span className="text-sm text-neutral-300">Resolve a whole group</span>
            <span className="text-xs text-neutral-500">
              for when one broken check filed the same finding against everything
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(groups)
              .filter(([, g]) => g.n > 1)
              .map(([key, g]) => (
                <div key={key} className="flex items-center gap-1 bg-neutral-700 rounded-lg pl-3 pr-1 py-1">
                  <span className="text-sm text-white">{g.ruleKey}</span>
                  <span className="px-1.5 py-0.5 text-xs rounded-full bg-neutral-600">{g.n}</span>
                  {/* The disposition is chosen up front rather than asked
                      afterwards. This control's whole reason for existing — one
                      broken check filing the same finding against everything —
                      is a pile of false positives, and which of the two it is
                      determines the MVP gate's false-positive rate. */}
                  <button
                    onClick={() =>
                      startAction({
                        kind: 'bulk',
                        checkId: g.checkId,
                        ruleKey: g.ruleKey,
                        count: g.n,
                        resolution: 'fixed',
                      })
                    }
                    disabled={updating !== null}
                    className="ml-1 px-2 py-1 bg-primary-500 hover:bg-primary-600 text-white rounded text-xs transition-colors disabled:opacity-50"
                    title="All of these were repaired"
                  >
                    Fixed
                  </button>
                  <button
                    onClick={() =>
                      startAction({
                        kind: 'bulk',
                        checkId: g.checkId,
                        ruleKey: g.ruleKey,
                        count: g.n,
                        resolution: 'false_positive',
                      })
                    }
                    disabled={updating !== null}
                    className="px-2 py-1 bg-neutral-600 hover:bg-neutral-500 text-white rounded text-xs transition-colors disabled:opacity-50"
                    title="None of these were real — the check was wrong"
                  >
                    Not real
                  </button>
                </div>
              ))}
            {Object.values(groups).every((g) => g.n <= 1) && (
              <span className="text-xs text-neutral-500">
                No rule has more than one open finding — nothing worth bulk-resolving.
              </span>
            )}
          </div>
          {!groupsComplete && (
            // The server could not scan the whole open set, so these are floors
            // rather than totals and the bulk endpoint would refuse them. Saying
            // so beats offering a button that always 409s.
            <p className="mt-3 text-xs text-amber-400">
              Counts are incomplete — the open set is larger than one scan. Filter by check to
              bulk-resolve.
            </p>
          )}
        </div>
      )}

      {notice && (
        <div className="bg-neutral-800 border border-neutral-600 text-neutral-200 px-4 py-3 rounded-lg mb-6 text-sm">
          {notice}
        </div>
      )}

      {/* ── the confirmation step, in the page ────────────────────────────
          Where a window.prompt used to be. A dialog the browser can suppress
          turns a button into a no-op with no error and no request, which is
          precisely the class of failure this console exists to make visible. */}
      {pending && (
        <div className="mb-6 bg-neutral-800 border border-primary-500/40 rounded-xl p-4">
          <div className="text-sm text-white mb-1">
            {pending.kind === 'bulk'
              ? `Closing all ${pending.count} open "${pending.ruleKey}" findings as ${RESOLUTION_LABEL[pending.resolution].toLowerCase()}.`
              : pending.action === 'reopen'
                ? 'Reopening this finding.'
                : `Closing this finding as ${RESOLUTION_LABEL[pending.resolution!].toLowerCase()}.`}
          </div>
          <p className="text-xs text-neutral-500 mb-3">
            Why? Recorded in the activity log — at least {MIN_REASON_LENGTH} characters.
          </p>
          <textarea
            autoFocus
            value={pendingReason}
            onChange={(e) => setPendingReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setPending(null);
                setPendingReason('');
              }
              // Enter submits; Shift+Enter for a second line. A reason is
              // usually one sentence and reaching for the mouse for it is the
              // friction that stops the list being read.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                confirmPending();
              }
            }}
            rows={2}
            placeholder="e.g. added the missing float_summary sections for all 11 rivers"
            className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={confirmPending}
              disabled={updating !== null || pendingReason.trim().length < MIN_REASON_LENGTH}
              className="px-3 py-1.5 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm transition-colors disabled:opacity-40"
            >
              Confirm
            </button>
            <button
              onClick={() => {
                setPending(null);
                setPendingReason('');
              }}
              className="px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-white rounded-lg text-sm transition-colors"
            >
              Cancel
            </button>
            {pendingReason.trim().length > 0 &&
              pendingReason.trim().length < MIN_REASON_LENGTH && (
                <span className="text-xs text-neutral-500">
                  {MIN_REASON_LENGTH - pendingReason.trim().length} more character
                  {MIN_REASON_LENGTH - pendingReason.trim().length === 1 ? '' : 's'}
                </span>
              )}
          </div>
        </div>
      )}

      {gate && (
        <div className="mb-6 bg-neutral-800 border border-neutral-700 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="w-4 h-4 text-neutral-400" />
            <span className="text-sm text-neutral-300">Trust MVP gate</span>
            <span className="text-xs text-neutral-500">
              four weeks, under 20% false positives, nothing safety-critical back
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 text-sm">
            <div>
              <div className="text-neutral-500 text-xs mb-0.5">Operating</div>
              <div className={gate.operationDays.met ? 'text-green-400' : 'text-neutral-300'}>
                {gate.operationDays.value} of {gate.operationDays.required} days
              </div>
            </div>
            <div>
              <div className="text-neutral-500 text-xs mb-0.5">False positives</div>
              {/* Null is rendered as "not yet", never as a pass. A rate of zero
                  and a rate nobody has measured produce the same number, and
                  scoring the second as the first is the failure this subsystem
                  is about. */}
              <div
                className={
                  gate.falsePositives.met === true
                    ? 'text-green-400'
                    : gate.falsePositives.met === false
                      ? 'text-red-400'
                      : 'text-neutral-400'
                }
              >
                {gate.falsePositives.meaningful && gate.falsePositives.rate !== null
                  ? `${Math.round(gate.falsePositives.rate * 100)}% of ${gate.falsePositives.reviewed} reviewed`
                  : `not yet — ${gate.falsePositives.reviewed}/${gate.falsePositives.minimumReviews} reviewed`}
              </div>
            </div>
            <div>
              <div className="text-neutral-500 text-xs mb-0.5">Safety baseline</div>
              {/* Three states, like the false-positive rate beside it. Neutral
                  is "the check that owns this has not run since the repair" —
                  neither a pass nor a regression, and painting it either colour
                  is a claim about evidence nobody has. */}
              <div
                className={
                  gate.safetyBaseline.met === null
                    ? 'text-neutral-400'
                    : gate.safetyBaseline.met
                      ? 'text-green-400'
                      : 'text-red-400'
                }
              >
                {gate.safetyBaseline.met === null
                  ? `${gate.safetyBaseline.unverified.length} unverified since repair`
                  : gate.safetyBaseline.met
                    ? `all ${gate.safetyBaseline.total} still closed`
                    : `${gate.safetyBaseline.regressed.length} REGRESSED`}
              </div>
            </div>
          </div>
          {gate.safetyBaseline.regressed.length > 0 && (
            <ul className="mt-3 border-t border-neutral-700 pt-3 space-y-1">
              {gate.safetyBaseline.regressed.map((r) => (
                <li key={r.id} className="text-sm text-red-400">
                  {r.summary}
                </li>
              ))}
            </ul>
          )}
          {gate.safetyBaseline.unverified.length > 0 && (
            <ul className="mt-3 border-t border-neutral-700 pt-3 space-y-1">
              {gate.safetyBaseline.unverified.map((u) => (
                <li key={u.id} className="text-sm text-neutral-400">
                  {u.summary}
                  <span className="text-neutral-500">
                    {' '}
                    — awaiting the next {u.awaitingCheck ?? 'check'} run
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {criticalCount > 0 && statusFilter === 'open' && (
        <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded-lg mb-6 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>
            {criticalCount} critical finding{criticalCount === 1 ? '' : 's'} — each can change a
            condition badge or a go/no-go answer.
          </span>
        </div>
      )}

      {error && (
        <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-neutral-600 border-t-primary-500 rounded-full animate-spin" />
        </div>
      )}

      {!loading && findings.length === 0 && (
        <div className="text-center py-12 text-neutral-400">
          <ShieldCheck className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No {statusFilter} findings.</p>
          <p className="text-sm mt-2 text-neutral-500">
            An empty list means the checks ran and found nothing — not that they did not run. The
            ledger refuses to resolve anything on a failed or partial pass.
          </p>
        </div>
      )}

      {!loading && findings.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-neutral-500">
              Showing {visibleFindings.length} of {total}
              {hiddenCount > 0 && ' — worst first'}
            </p>
            {hiddenCount > 0 && (
              // The gate's cap: "the rest visible on request rather than
              // pushed". Nothing is filtered out of existence — but a bad week
              // must not turn this page into a wall that gets closed unread,
              // which is the exact failure the whole framework exists to stop.
              <button
                onClick={() => setShowAll((v) => !v)}
                className="text-sm text-neutral-400 hover:text-white underline"
              >
                {showAll ? `Show top ${SURFACED_BY_DEFAULT}` : `Show ${hiddenCount} more`}
              </button>
            )}
          </div>
          <div className="space-y-3">
            {visibleFindings.map((finding) => (
              <div
                key={finding.id}
                className="bg-neutral-800 border border-neutral-700 rounded-xl p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded-full border ${SEVERITY_STYLE[finding.severity]}`}
                      >
                        {finding.severity}
                      </span>
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded-full border ${STATUS_STYLE[finding.status]}`}
                      >
                        {finding.status}
                      </span>
                      <span className="text-xs text-neutral-500 font-mono">{finding.ruleKey}</span>
                      {finding.occurrences > 1 && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full border bg-amber-500/20 text-amber-400 border-amber-500/30">
                          returned {finding.occurrences}×
                        </span>
                      )}
                    </div>

                    <h3 className="text-white font-medium break-words">{finding.title}</h3>
                    <p className="text-sm text-neutral-400 mt-1 break-words">{finding.detail}</p>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-neutral-500">
                      <span>{finding.checkId}</span>
                      <span>
                        {finding.entityType}: {finding.entityKey}
                      </span>
                      <span>
                        open {daysSince(finding.firstSeenAt)}d · last seen{' '}
                        {formatDate(finding.lastSeenAt)}
                      </span>
                      {finding.snoozedUntil && (
                        <span>snoozed until {formatDate(finding.snoozedUntil)}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {finding.status !== 'resolved' ? (
                      <>
                        <button
                          onClick={() => act(finding.id, 'snooze', 7)}
                          disabled={updating === finding.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-white rounded-lg text-sm transition-colors disabled:opacity-50"
                          title="Snooze for 7 days"
                        >
                          <BellOff className="w-4 h-4" />
                          Snooze
                        </button>
                        {/* Three outcomes, not one.
                            "Somebody fixed the river" and "the check was wrong"
                            are opposite results — the system working versus the
                            system crying wolf — and a single Resolve button
                            recorded them identically. The MVP gate's
                            false-positive rate is computed from this choice and
                            nothing else. */}
                        <button
                          onClick={() =>
                            startAction({ kind: 'single', id: finding.id, action: 'resolve', resolution: 'fixed' })
                          }
                          disabled={updating === finding.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm transition-colors disabled:opacity-50"
                          title="The underlying problem was repaired"
                        >
                          <CheckCircle className="w-4 h-4" />
                          Fixed
                        </button>
                        <button
                          onClick={() =>
                            startAction({ kind: 'single', id: finding.id, action: 'resolve', resolution: 'false_positive' })
                          }
                          disabled={updating === finding.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-white rounded-lg text-sm transition-colors disabled:opacity-50"
                          title="There was nothing to fix — the check was wrong"
                        >
                          <ShieldCheck className="w-4 h-4" />
                          Not real
                        </button>
                        <button
                          onClick={() =>
                            startAction({ kind: 'single', id: finding.id, action: 'resolve', resolution: 'accepted' })
                          }
                          disabled={updating === finding.id}
                          className="px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-neutral-300 rounded-lg text-sm transition-colors disabled:opacity-50"
                          title="Real, understood, and being lived with"
                        >
                          Accept
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => startAction({ kind: 'single', id: finding.id, action: 'reopen' })}
                        disabled={updating === finding.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-white rounded-lg text-sm transition-colors disabled:opacity-50"
                      >
                        <RotateCcw className="w-4 h-4" />
                        Reopen
                      </button>
                    )}
                  </div>
                </div>

                {finding.remediation && (
                  <div className="mt-3 border-t border-neutral-700 pt-3">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      {finding.remediation.kind === 'mechanical' ? (
                        <Terminal className="w-4 h-4 text-green-400 shrink-0" />
                      ) : (
                        <Wrench className="w-4 h-4 text-neutral-400 shrink-0" />
                      )}
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded-full border ${REMEDIATION_STYLE[finding.remediation.kind].className}`}
                      >
                        {REMEDIATION_STYLE[finding.remediation.kind].label}
                      </span>
                    </div>
                    <p className="text-sm text-neutral-200 break-words">
                      {finding.remediation.action}
                    </p>
                    {finding.remediation.where && (
                      <p className="mt-1 text-xs font-mono text-neutral-400 break-words">
                        {finding.remediation.where}
                      </p>
                    )}
                    {finding.remediation.method && (
                      <p className="mt-1.5 text-xs text-neutral-500 break-words">
                        {finding.remediation.method}
                      </p>
                    )}
                  </div>
                )}

                {finding.evidence && Object.keys(finding.evidence).length > 0 && (
                  <div className="mt-3 border-t border-neutral-700 pt-3">
                    <button
                      onClick={() => setExpanded(expanded === finding.id ? null : finding.id)}
                      className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
                    >
                      {expanded === finding.id ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                      Evidence
                    </button>
                    {expanded === finding.id && (
                      <pre className="mt-2 p-3 bg-neutral-900 rounded-lg text-xs text-neutral-300 overflow-x-auto">
                        {JSON.stringify(finding.evidence, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </AdminLayout>
  );
}
