// eddy-ios/src/lib/hazardReportQueue.ts
// Hazard reports from the water (#1448 Phase 5, tracked in #1453): written on
// the phone first, sent when there is signal, sent once.
//
// Pure, with storage and the network passed in, so the web suite tests it
// (missouri-float-planner/src/lib/hazard-report-queue.test.ts).
//
// ── The rules ───────────────────────────────────────────────────────────────
//
//   A report is saved before anything is sent. "Report" works with no signal
//   at all; the paddler is told it is waiting, not that it was sent.
//   Every attempt carries the same id (the server's client_report_id), so a
//   send whose reply was lost cannot file the report twice.
//   A refusal (the server read it and said no, e.g. too far from the river)
//   is final and shown with the server's own sentence. A network failure, a
//   rate limit or a server error is retried, further apart each time.
//   One send at a time: a retry timer and a reconnect cannot race each other
//   into a double post.
//   Sent means received for review, never "published": reports are checked
//   by a person before anyone else sees them.

export type HazardKind = 'strainer' | 'low-water-bridge' | 'rapids' | 'debris' | 'other';

export const HAZARD_KINDS: readonly { id: HazardKind; label: string }[] = [
  { id: 'strainer', label: 'Strainer or downed tree' },
  { id: 'low-water-bridge', label: 'Low-water bridge' },
  { id: 'rapids', label: 'Rapids or rocks' },
  { id: 'debris', label: 'Debris or blockage' },
  { id: 'other', label: 'Something else' },
];

export type ReportStatus = 'waiting' | 'sent' | 'refused';

export interface HazardReport {
  /** Made on the phone; sent as clientReportId on every attempt. */
  id: string;
  riverSlug: string;
  riverName: string;
  latitude: number;
  longitude: number;
  /** Horizontal accuracy of the fix, metres; null if unknown. */
  accuracyMeters: number | null;
  /** When the position was taken: when the hazard was seen. */
  capturedAt: string;
  /** Where on the river, if the position matched it; for the reviewer. */
  riverMile: number | null;
  kind: HazardKind;
  note: string;
  status: ReportStatus;
  attempts: number;
  /** Epoch ms before which no retry is made. */
  nextAttemptAt: number;
  /** The server's reason, for a refused report. */
  refusal?: string;
  sentAt?: string;
}

export type SendOutcome = { kind: 'sent' } | { kind: 'refused'; message: string } | { kind: 'retry' };

export interface ReportStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export const REPORTS_KEY = 'eddy.hazardReports.v1';
const MAX_NOTE = 500;
/** Sent and refused reports stay listed this long, then drop off. */
const KEEP_DONE_MS = 7 * 24 * 60 * 60_000;
const FIRST_RETRY_MS = 60_000;
const MAX_RETRY_MS = 30 * 60_000;
const CANCELLED_SEND_COOLDOWN_MS = 60_000;

/** Wait before the next attempt after `attempts` failures: 1, 2, 4 … 30 min. */
export function retryDelay(attempts: number): number {
  return Math.min(MAX_RETRY_MS, FIRST_RETRY_MS * 2 ** Math.max(0, attempts - 1));
}

/**
 * Whether an HTTP status means "no, final" or "try again". A missing status
 * is a network failure. 408 and 429 are transient; any other 4xx means the
 * server read the report and refused it.
 */
export function isFinalRefusal(status: number | undefined): boolean {
  return status != null && status >= 400 && status < 500 && status !== 408 && status !== 429;
}

/** The text the server stores and a moderator reads. */
export function reportDescription(report: Pick<HazardReport, 'kind' | 'note' | 'riverMile' | 'accuracyMeters'>): string {
  const label = HAZARD_KINDS.find((kind) => kind.id === report.kind)?.label ?? 'Hazard';
  const note = report.note.trim().slice(0, MAX_NOTE);
  const where = [
    report.riverMile != null ? `near river mile ${report.riverMile.toFixed(1)}` : null,
    report.accuracyMeters != null ? `GPS ±${Math.round(report.accuracyMeters)} m` : null,
  ].filter(Boolean);
  return [`${label}.`, note ? `${note}${/[.!?]$/.test(note) ? '' : '.'}` : null, `Reported from Float Mode${where.length ? ` (${where.join(', ')})` : ''}.`]
    .filter(Boolean)
    .join(' ');
}

/** A random v4 UUID. Not security: an idempotency key needs only to be unique. */
export function newReportId(random: () => number = Math.random): string {
  const hex = Array.from({ length: 32 }, () => Math.floor(random() * 16).toString(16));
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const s = hex.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

export function createReportQueue(
  storage: ReportStorage,
  send: (report: HazardReport, signal: AbortSignal) => Promise<SendOutcome>,
  warn: (message: string, detail?: unknown) => void,
  clock: () => number = Date.now,
) {
  let reports: HazardReport[] = [];
  let loading: Promise<void> | null = null;
  let sending: Promise<void> | null = null;
  let sendingController: AbortController | null = null;
  // A time-budget cancellation is not a delivery failure, but GPS callbacks
  // must not retry it every few seconds. Memory-only: relaunch clears this
  // cooldown while preserving the report's real, persisted failure backoff.
  const cancelledUntil = new Map<string, number>();
  const dueAt = (report: HazardReport) => Math.max(report.nextAttemptAt, cancelledUntil.get(report.id) ?? 0);
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  /**
   * Every change goes through here, one after another: compute the next list
   * from the CURRENT one, write it, then publish it. Writes therefore land in
   * order, and a failed write never rolls back a change made meanwhile.
   *
   * `mustSave`: a new report is only published (and so only visible to the
   * sender) once it is on disk, and the failure goes to the caller. A status
   * change is published even if its write fails, because the send already
   * happened; the next write carries it.
   */
  let chain: Promise<unknown> = Promise.resolve();
  const commit = (change: (current: HazardReport[]) => HazardReport[], mustSave: boolean): Promise<void> => {
    const run = chain.then(async () => {
      const next = change(reports);
      try {
        await storage.setItem(REPORTS_KEY, JSON.stringify(next));
      } catch (error) {
        if (mustSave) throw error;
        warn('could not save hazard report state', error);
      }
      reports = next;
      notify();
    });
    chain = run.catch(() => {});
    return run;
  };
  const update = (id: string, change: Partial<HazardReport>) =>
    commit((current) => current.map((report) => (report.id === id ? { ...report, ...change } : report)), false);

  const queue = {
    ensureLoaded(): Promise<void> {
      loading ??= (async () => {
        try {
          const raw = await storage.getItem(REPORTS_KEY);
          const parsed = raw ? (JSON.parse(raw) as HazardReport[]) : [];
          const cutoff = clock() - KEEP_DONE_MS;
          reports = Array.isArray(parsed)
            ? parsed.filter((r) => r?.id && (r.status === 'waiting' || Date.parse(r.sentAt ?? r.capturedAt) >= cutoff))
            : [];
          notify();
        } catch (error) {
          warn('could not read saved hazard reports', error);
        }
      })();
      return loading;
    },

    list(): readonly HazardReport[] {
      return reports;
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /**
     * Save a new report. Throws if it cannot be saved, so the sheet can say
     * so instead of pretending; sending starts afterwards and never throws.
     */
    async add(input: Omit<HazardReport, 'status' | 'attempts' | 'nextAttemptAt' | 'refusal' | 'sentAt'>): Promise<void> {
      await queue.ensureLoaded();
      const report: HazardReport = { ...input, note: input.note.trim().slice(0, MAX_NOTE), status: 'waiting', attempts: 0, nextAttemptAt: 0 };
      // Not visible to the sender, or anyone, until it is on disk.
      await commit((current) => [report, ...current], true);
      void queue.flush();
    },

    /**
     * One run at a time. A background caller may bound the current run,
     * including one already started in the foreground. Abort reaches the
     * actual requests; running out of execution time is not a send failure.
     */
    flush(budgetMs?: number): Promise<void> {
      if (!sending) {
        const controller = new AbortController();
        sendingController = controller;
        const { signal } = controller;
        sending = (async () => {
          try {
            await queue.ensureLoaded();
            // Until nothing is due, so a report added mid-run is sent in it.
            const tried = new Set<string>();
            while (!signal.aborted) {
              const due = reports.filter((r) => r.status === 'waiting' && dueAt(r) <= clock() && !tried.has(r.id));
              if (due.length === 0) break;
              for (const report of due) {
                if (signal.aborted) break;
                tried.add(report.id);
                let outcome: SendOutcome;
                try {
                  outcome = await send(report, signal);
                } catch (error) {
                  if (!signal.aborted) warn('hazard report send failed', error);
                  outcome = { kind: 'retry' };
                }
                // A server success/refusal remains authoritative even if the
                // budget expired while its response was being processed.
                if (signal.aborted && outcome.kind === 'retry') {
                  cancelledUntil.set(report.id, clock() + CANCELLED_SEND_COOLDOWN_MS);
                  break;
                }
                cancelledUntil.delete(report.id);
                const attempts = report.attempts + 1;
                if (outcome.kind === 'sent') await update(report.id, { status: 'sent', attempts, sentAt: new Date(clock()).toISOString() });
                else if (outcome.kind === 'refused') await update(report.id, { status: 'refused', attempts, refusal: outcome.message, sentAt: new Date(clock()).toISOString() });
                else await update(report.id, { attempts, nextAttemptAt: clock() + retryDelay(attempts) });
              }
            }
          } finally {
            sending = null;
            sendingController = null;
          }
        })();
      }
      const run = sending;
      if (budgetMs == null) return run;
      const controller = sendingController;
      // Overlapping callers bound the same send: the earliest deadline wins.
      // A later callback cannot extend an earlier task's execution budget.
      const timeout = setTimeout(() => controller?.abort(), Math.max(0, budgetMs));
      return run.finally(() => clearTimeout(timeout));
    },

    /** When the next waiting report is due, or null if none is waiting. */
    nextDueAt(): number | null {
      const waiting = reports.filter((r) => r.status === 'waiting');
      return waiting.length ? Math.min(...waiting.map(dueAt)) : null;
    },
  };
  return queue;
}

export type ReportQueue = ReturnType<typeof createReportQueue>;
