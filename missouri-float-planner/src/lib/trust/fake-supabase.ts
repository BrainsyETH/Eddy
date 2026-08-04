// src/lib/trust/fake-supabase.ts
// A tiny in-memory stand-in for the PostgREST client, for testing ledger.ts.
//
// The repo's rule is that no test touches a database, and the usual way to obey
// it is to keep policy in a pure module and test that (reconcile.ts, and its
// tests). But the failure this system most needs to be right about is a WIRING
// failure — a check that throws, or reports an empty scope, and the ledger
// closing every open finding as fixed in response. planReconcile() returning
// the right plan proves nothing if runTrustCheck() then ignores it.
//
// So this exists to let the sabotage cases run in CI instead of being a manual
// step in a runbook that nobody performs twice. It models only the query shapes
// ledger.ts actually issues; it is not a general Supabase mock and should not
// grow into one.

interface Row {
  [key: string]: unknown;
}

type Filter = { op: 'eq' | 'neq' | 'in'; column: string; value: unknown };

type Mode = 'select' | 'insert' | 'update';

/**
 * A scheduled failure, so a test can make one specific query fail.
 *
 * This is the half the fake was missing, and it was missing the important half.
 * Every terminator returned `error: null` unconditionally, so the sabotage suite
 * could prove the ledger handles a check that THROWS — and could not express the
 * failure that actually shipped, which is a query that RESOLVES with an error
 * and gets ignored. A fake that cannot fail cannot test error handling.
 */
interface FailureRule {
  table: string;
  mode?: Mode;
  message: string;
  remaining: number;
}

export interface FailureSpec {
  table: string;
  /** Omitted means any operation on the table. */
  mode?: Mode;
  message?: string;
  /** How many matching operations to fail. Defaults to every one of them. */
  times?: number;
}

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((f) => {
    if (f.op === 'eq') return row[f.column] === f.value;
    if (f.op === 'neq') return row[f.column] !== f.value;
    return Array.isArray(f.value) && f.value.includes(row[f.column]);
  });
}

/** Stands in for the tables' `default now()`. */
const NOW_DEFAULT = '2026-08-04T00:00:00.000Z';

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

class QueryBuilder {
  private filters: Filter[] = [];
  private mode: Mode = 'select';
  private payload: Row | null = null;
  private orderColumn: string | null = null;
  private orderAsc = true;
  private limitN: number | null = null;

  constructor(
    private readonly table: string,
    private readonly store: Map<string, Row[]>,
    private readonly failures: FailureRule[] = [],
  ) {}

  /**
   * Consumed at the terminator, and the store is left untouched when it fires —
   * which is the point. A failed PostgREST write does not half-apply.
   */
  private takeFailure(): { message: string } | null {
    const rule = this.failures.find(
      (f) => f.table === this.table && (f.mode === undefined || f.mode === this.mode) && f.remaining > 0,
    );
    if (!rule) return null;
    rule.remaining -= 1;
    return { message: rule.message };
  }

  private rows(): Row[] {
    return this.store.get(this.table) ?? [];
  }

  /**
   * Takes no parameters on purpose. ledger.ts passes a column list and
   * sometimes a count option, and JavaScript discards extra arguments — so
   * modelling projection would add surface without fidelity, since every read
   * in ledger.ts wants whole rows anyway.
   */
  select() {
    return this;
  }
  insert(payload: Row) {
    this.mode = 'insert';
    this.payload = payload;
    return this;
  }
  update(payload: Row) {
    this.mode = 'update';
    this.payload = payload;
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push({ op: 'eq', column, value });
    return this;
  }
  neq(column: string, value: unknown) {
    this.filters.push({ op: 'neq', column, value });
    return this;
  }
  in(column: string, value: unknown[]) {
    this.filters.push({ op: 'in', column, value });
    return this;
  }
  order(column: string, opts?: { ascending?: boolean }) {
    this.orderColumn = column;
    this.orderAsc = opts?.ascending !== false;
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }

  private apply(): Row[] {
    if (this.mode === 'insert' && this.payload) {
      // Column defaults from 20260804120000_trust_ledger.sql. Without them this
      // is not a faithful stand-in: ledger.ts deliberately omits first_seen_at
      // and occurrences on insert and lets Postgres supply them, so a fake that
      // left them undefined would fail tests the real database passes.
      const defaults: Row =
        this.table === 'trust_findings'
          ? { status: 'open', occurrences: 1, first_seen_at: NOW_DEFAULT, last_seen_at: NOW_DEFAULT }
          : this.table === 'trust_runs'
            ? { started_at: NOW_DEFAULT, scope_count: 0 }
            : {};
      const row: Row = { id: nextId(this.table), ...defaults, ...this.payload };
      this.store.set(this.table, [...this.rows(), row]);
      return [row];
    }

    if (this.mode === 'update' && this.payload) {
      const updated: Row[] = [];
      const next = this.rows().map((row) => {
        if (!matches(row, this.filters)) return row;
        const merged = { ...row, ...this.payload };
        updated.push(merged);
        return merged;
      });
      this.store.set(this.table, next);
      return updated;
    }

    let result = this.rows().filter((row) => matches(row, this.filters));
    if (this.orderColumn) {
      const col = this.orderColumn;
      result = [...result].sort((a, b) => {
        const av = String(a[col] ?? '');
        const bv = String(b[col] ?? '');
        return this.orderAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    if (this.limitN !== null) result = result.slice(0, this.limitN);
    return result;
  }

  async single() {
    const failure = this.takeFailure();
    if (failure) return { data: null, error: failure };
    const rows = this.apply();
    return { data: rows[0] ?? null, error: rows.length ? null : { message: 'no rows' } };
  }
  async maybeSingle() {
    const failure = this.takeFailure();
    if (failure) return { data: null, error: failure };
    const rows = this.apply();
    return { data: rows[0] ?? null, error: null };
  }
  // Awaiting the builder directly is the un-terminated PostgREST form.
  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?:
      | ((value: {
          data: Row[] | null;
          error: { message: string } | null;
        }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    const failure = this.takeFailure();
    const result = failure
      ? { data: null, error: failure }
      : { data: this.apply(), error: null };
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}

/**
 * In-memory replay of trust_apply_reconcile().
 *
 * ── Why this is worth having rather than mocking the call ────────────────
 *
 * Moving the writes into one plpgsql function bought atomicity and cost the
 * sabotage suite its coverage: ledger-wiring.test.ts proves that a broken check
 * does not resolve findings, and it can only prove that by looking at what
 * landed in the tables. A stub returning {raised: 0} would assert nothing.
 *
 * The duplication is bounded because the SQL function is deliberately dumb. It
 * carries no policy — planReconcile() decides, it applies — so this replays a
 * plan rather than reimplementing a judgement. If the two ever disagree it is
 * about mechanics (does a touch bump occurrences?), which is the kind of thing
 * a test is supposed to pin down anyway.
 *
 * 20260804193041_trust_apply_reconcile.sql is the authority. Verified against
 * PostgreSQL 16 while it was written.
 */
function applyReconcile(store: Map<string, Row[]>, payload: Row): Row {
  const findings = store.get('trust_findings') ?? [];
  const byFingerprint = new Map(findings.map((r) => [r.fingerprint as string, r]));
  const nowIso = payload.now as string;
  const runId = payload.run_id as string;
  const checkId = payload.check_id as string;

  let raised = 0;
  let touched = 0;
  let resolved = 0;

  const upsert = (item: Row, status: string, occurrenceBump: boolean) => {
    const existing = byFingerprint.get(item.fingerprint as string);
    const next: Row = {
      ...(existing ?? {
        id: nextId('trust_findings'),
        first_seen_at: nowIso,
        occurrences: 0,
      }),
      fingerprint: item.fingerprint,
      check_id: checkId,
      rule_key: item.rule_key,
      entity_type: item.entity_type,
      entity_key: item.entity_key,
      severity: item.severity,
      status,
      title: item.title,
      detail: item.detail,
      evidence: item.evidence ?? {},
      last_seen_at: nowIso,
      resolved_at: null,
      snoozed_until: item.snoozed_until ?? null,
      last_run_id: runId,
    };
    // Mirrors what Postgres does, which is subtler than "+1 when raised".
    //
    // A fresh INSERT takes the column DEFAULT of 1 and the ON CONFLICT DO UPDATE
    // never runs, so the bump does not apply to it. Only a genuine conflict —
    // the finding was already on file — increments. And the anomaly upsert omits
    // occurrences from its DO UPDATE list entirely, so an existing complaint
    // keeps its count.
    //
    // A differential run against PostgreSQL 16 caught this: the fake had a fresh
    // anomaly at 0 where the database had 1.
    next.occurrences = existing
      ? occurrenceBump
        ? ((existing.occurrences as number) ?? 1) + 1
        : ((existing.occurrences as number) ?? 1)
      : 1;
    if (existing) {
      store.set(
        'trust_findings',
        (store.get('trust_findings') ?? []).map((r) => (r.fingerprint === item.fingerprint ? next : r)),
      );
    } else {
      store.set('trust_findings', [...(store.get('trust_findings') ?? []), next]);
    }
    byFingerprint.set(item.fingerprint as string, next);
  };

  for (const item of (payload.raise as Row[]) ?? []) {
    upsert(item, item.snoozed_until ? 'snoozed' : 'open', true);
    raised += 1;
  }

  for (const item of (payload.touch as Row[]) ?? []) {
    const existing = byFingerprint.get(item.fingerprint as string);
    if (!existing) continue;
    const wake = item.wake === true;
    Object.assign(existing, {
      severity: item.severity,
      title: item.title,
      detail: item.detail,
      evidence: item.evidence ?? {},
      last_seen_at: nowIso,
      last_run_id: runId,
      ...(wake ? { status: 'open', snoozed_until: null } : {}),
    });
    touched += 1;
  }

  // The compare-and-set, restated: open, or a snooze whose deadline has passed.
  // A live snooze is an operator saying "I know" and must survive.
  for (const fp of (payload.resolve as string[]) ?? []) {
    const row = byFingerprint.get(fp);
    if (!row || row.check_id !== checkId) continue;
    const resolvable =
      row.status === 'open' ||
      (row.status === 'snoozed' &&
        row.snoozed_until !== null &&
        new Date(row.snoozed_until as string).getTime() <= new Date(nowIso).getTime());
    if (!resolvable) continue;
    Object.assign(row, {
      status: 'resolved',
      resolved_at: nowIso,
      snoozed_until: null,
      last_run_id: runId,
    });
    resolved += 1;
  }

  if (payload.anomaly) {
    upsert(payload.anomaly as Row, 'open', false);
  }

  if (payload.clear_anomaly === true) {
    for (const row of store.get('trust_findings') ?? []) {
      if (row.check_id !== checkId) continue;
      if (row.rule_key !== 'reconcile_anomaly') continue;
      if (row.status === 'resolved') continue;
      Object.assign(row, {
        status: 'resolved',
        resolved_at: nowIso,
        snoozed_until: null,
        last_run_id: runId,
      });
    }
  }

  const run = (payload.run as Row) ?? {};
  const runs = store.get('trust_runs') ?? [];
  const runRow = runs.find((r) => r.id === runId);
  if (!runRow) throw new Error(`trust_apply_reconcile: no trust_runs row ${runId}`);
  Object.assign(runRow, {
    status: run.status,
    finished_at: nowIso,
    suppressed_reason: run.suppressed_reason ?? null,
    scope_count: run.scope_count ?? 0,
    findings_raised: raised,
    findings_touched: touched,
    findings_resolved: resolved,
    duration_ms: run.duration_ms ?? null,
    error_detail: run.error_detail ?? null,
  });

  return { raised, touched, resolved };
}

export interface FakeSupabase {
  from(table: string): QueryBuilder;
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
  rows(table: string): Row[];
  seed(table: string, rows: Row[]): void;
  /** Schedule a query failure. See FailureSpec. */
  failOn(spec: FailureSpec): void;
}

export function createFakeSupabase(seed: Record<string, Row[]> = {}): FakeSupabase {
  const store = new Map<string, Row[]>(Object.entries(seed));
  const failures: FailureRule[] = [];

  return {
    from: (table: string) => new QueryBuilder(table, store, failures),

    async rpc(name: string, args: Record<string, unknown>) {
      // Routed through the same failure list, keyed on the table the function
      // writes — so `failOn({ table: 'trust_findings', mode: 'insert' })` still
      // expresses "the mutation phase fails", which is what the tests mean.
      const rule = failures.find(
        (f) => (f.table === 'trust_findings' || f.table === 'trust_runs') && f.remaining > 0,
      );
      if (rule) {
        rule.remaining -= 1;
        return { data: null, error: { message: rule.message } };
      }

      if (name !== 'trust_apply_reconcile') {
        return { data: null, error: { message: `unknown function ${name}` } };
      }

      try {
        return { data: applyReconcile(store, args.p_payload as Row), error: null };
      } catch (error) {
        // A thrown replay stands in for a constraint violation: the real
        // function is one transaction, so a failure means nothing landed.
        return {
          data: null,
          error: { message: error instanceof Error ? error.message : String(error) },
        };
      }
    },

    rows: (table: string) => store.get(table) ?? [],
    seed: (table: string, rows: Row[]) => store.set(table, rows),
    failOn: (spec: FailureSpec) =>
      failures.push({
        table: spec.table,
        mode: spec.mode,
        message: spec.message ?? `${spec.table} is unreachable`,
        remaining: spec.times ?? Number.POSITIVE_INFINITY,
      }),
  };
}
