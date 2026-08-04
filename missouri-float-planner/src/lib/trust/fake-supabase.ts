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
  private mode: 'select' | 'insert' | 'update' = 'select';
  private payload: Row | null = null;
  private orderColumn: string | null = null;
  private orderAsc = true;
  private limitN: number | null = null;

  constructor(
    private readonly table: string,
    private readonly store: Map<string, Row[]>,
  ) {}

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
    const rows = this.apply();
    return { data: rows[0] ?? null, error: rows.length ? null : { message: 'no rows' } };
  }
  async maybeSingle() {
    const rows = this.apply();
    return { data: rows[0] ?? null, error: null };
  }
  // Awaiting the builder directly is the un-terminated PostgREST form.
  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve({ data: this.apply(), error: null }).then(onfulfilled, onrejected);
  }
}

export interface FakeSupabase {
  from(table: string): QueryBuilder;
  rows(table: string): Row[];
  seed(table: string, rows: Row[]): void;
}

export function createFakeSupabase(seed: Record<string, Row[]> = {}): FakeSupabase {
  const store = new Map<string, Row[]>(Object.entries(seed));
  return {
    from: (table: string) => new QueryBuilder(table, store),
    rows: (table: string) => store.get(table) ?? [],
    seed: (table: string, rows: Row[]) => store.set(table, rows),
  };
}
