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
  send: (report: HazardReport) => Promise<SendOutcome>,
  warn: (message: string, detail?: unknown) => void,
  clock: () => number = Date.now,
) {
  let reports: HazardReport[] = [];
  let loading: Promise<void> | null = null;
  let sending: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  const save = async () => {
    await storage.setItem(REPORTS_KEY, JSON.stringify(reports));
  };
  const update = (id: string, change: Partial<HazardReport>) => {
    reports = reports.map((report) => (report.id === id ? { ...report, ...change } : report));
    notify();
  };

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
      const before = reports;
      reports = [report, ...reports];
      try {
        await save();
      } catch (error) {
        reports = before;
        throw error;
      }
      notify();
      void queue.flush();
    },

    /** Send every waiting report that is due. One run at a time. */
    flush(): Promise<void> {
      sending ??= (async () => {
        try {
          await queue.ensureLoaded();
          // Until nothing is due, so a report added mid-run is sent in it.
          const tried = new Set<string>();
          for (;;) {
            const due = reports.filter((r) => r.status === 'waiting' && r.nextAttemptAt <= clock() && !tried.has(r.id));
            if (due.length === 0) break;
            for (const report of due) {
              tried.add(report.id);
              let outcome: SendOutcome;
              try {
                outcome = await send(report);
              } catch (error) {
                warn('hazard report send failed', error);
                outcome = { kind: 'retry' };
              }
              const attempts = report.attempts + 1;
              if (outcome.kind === 'sent') update(report.id, { status: 'sent', attempts, sentAt: new Date(clock()).toISOString() });
              else if (outcome.kind === 'refused') update(report.id, { status: 'refused', attempts, refusal: outcome.message, sentAt: new Date(clock()).toISOString() });
              else update(report.id, { attempts, nextAttemptAt: clock() + retryDelay(attempts) });
              await save().catch((error) => warn('could not save hazard report state', error));
            }
          }
        } finally {
          sending = null;
        }
      })();
      return sending;
    },

    /** When the next waiting report is due, or null if none is waiting. */
    nextDueAt(): number | null {
      const waiting = reports.filter((r) => r.status === 'waiting');
      return waiting.length ? Math.min(...waiting.map((r) => r.nextAttemptAt)) : null;
    },
  };
  return queue;
}

export type ReportQueue = ReturnType<typeof createReportQueue>;
