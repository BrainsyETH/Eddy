// src/lib/alerts/fake-outbox-db.ts
// An in-memory stand-in for the PostgREST client, for the alert-delivery
// failure-path tests. Test-only; nothing in the app imports it.
//
// The bugs these tests pin down all lived in the glue between the pure planners
// and the database — a read that resolved with an error and was treated as
// empty, a ledger row read the wrong way, a state write that ran after a failed
// insert. A fake that cannot FAIL a specific query cannot test any of that, so
// failure scheduling is the point of this file, not an afterthought.
//
// Like src/lib/trust/fake-supabase.ts it models only the query shapes the
// alert passes issue. Projections and embeds are ignored: tests seed rows with
// their embedded objects already attached, and every read gets whole rows.

type Row = Record<string, unknown>;
type Mode = 'select' | 'update' | 'upsert' | 'insert';

type Filter =
  | { op: 'eq' | 'lt' | 'gte'; column: string; value: unknown }
  | { op: 'is'; column: string; value: null }
  | { op: 'in'; column: string; value: unknown[] };

export interface FailureSpec {
  table: string;
  /** Omitted means any operation on the table. */
  mode?: Mode;
  /** PostgREST/Postgres error code, e.g. 'PGRST204' for a missing column. */
  code?: string;
  message?: string;
  /** How many matching operations to fail. Defaults to every one. */
  times?: number;
}

interface FailureRule extends Required<Omit<FailureSpec, 'mode' | 'code' | 'times'>> {
  mode?: Mode;
  code?: string;
  remaining: number;
}

/** Column defaults the real tables would apply on insert. */
const DEFAULTS: Record<string, (now: string) => Row> = {
  alert_push_deliveries: (now) => ({ sent_at: now, status: 'sent' }),
};

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  return (a as number | string) < (b as number | string) ? -1 : 1;
}

class Query implements PromiseLike<{ data: unknown; error: unknown; count?: number }> {
  private mode: Mode = 'select';
  private filters: Filter[] = [];
  private orders: Array<{ column: string; ascending: boolean }> = [];
  private window: { from: number; to: number } | null = null;
  private limitN: number | null = null;
  private payload: Row | Row[] | null = null;
  private upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
  private returning = false;
  private single = false;

  constructor(private readonly db: FakeOutboxDb, private readonly table: string) {}

  select() {
    if (this.mode !== 'select') this.returning = true;
    return this;
  }
  update(payload: Row) {
    this.mode = 'update';
    this.payload = payload;
    return this;
  }
  insert(payload: Row | Row[]) {
    this.mode = 'insert';
    this.payload = payload;
    return this;
  }
  upsert(payload: Row | Row[], opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.mode = 'upsert';
    this.payload = payload;
    this.upsertOpts = opts;
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push({ op: 'eq', column, value });
    return this;
  }
  lt(column: string, value: unknown) {
    this.filters.push({ op: 'lt', column, value });
    return this;
  }
  gte(column: string, value: unknown) {
    this.filters.push({ op: 'gte', column, value });
    return this;
  }
  is(column: string, value: null) {
    this.filters.push({ op: 'is', column, value });
    return this;
  }
  in(column: string, value: unknown[]) {
    this.filters.push({ op: 'in', column, value });
    return this;
  }
  order(column: string, opts?: { ascending?: boolean }) {
    this.orders.push({ column, ascending: opts?.ascending !== false });
    return this;
  }
  range(from: number, to: number) {
    this.window = { from, to };
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }

  private matches(row: Row): boolean {
    return this.filters.every((f) => {
      const v = row[f.column];
      switch (f.op) {
        case 'eq':
          return v === f.value;
        case 'is':
          return v === null || v === undefined;
        case 'in':
          return f.value.includes(v);
        case 'lt':
          return compare(v, f.value) < 0;
        case 'gte':
          return compare(v, f.value) >= 0;
      }
    });
  }

  private execute(): { data: unknown; error: unknown; count?: number } {
    this.db.log.push({ table: this.table, mode: this.mode });
    const failure = this.db.takeFailure(this.table, this.mode);
    if (failure) return { data: null, error: failure };

    const rows = this.db.rows(this.table);
    if (this.mode === 'select') {
      let out = rows.filter((r) => this.matches(r)).map((r) => ({ ...r }));
      for (const { column, ascending } of [...this.orders].reverse()) {
        out = out.sort((a, b) => (ascending ? 1 : -1) * compare(a[column], b[column]));
      }
      if (this.window) out = out.slice(this.window.from, this.window.to + 1);
      if (this.limitN !== null) out = out.slice(0, this.limitN);
      if (this.single) return { data: out[0] ?? null, error: null };
      return { data: out, error: null };
    }

    if (this.mode === 'update') {
      let count = 0;
      for (const row of rows) {
        if (!this.matches(row)) continue;
        Object.assign(row, this.payload);
        count++;
      }
      return { data: null, error: null, count };
    }

    const incoming = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
    const keys = (this.upsertOpts.onConflict ?? 'id').split(',').map((k) => k.trim());
    const written: Row[] = [];
    for (const raw of incoming) {
      const existing =
        this.mode === 'upsert' ? rows.find((r) => keys.every((k) => r[k] === raw[k])) : undefined;
      if (existing) {
        if (this.upsertOpts.ignoreDuplicates) continue;
        Object.assign(existing, raw);
        written.push(existing);
        continue;
      }
      const row = { id: this.db.nextId(this.table), ...(DEFAULTS[this.table]?.(this.db.now) ?? {}), ...raw };
      rows.push(row);
      written.push(row);
    }
    return { data: this.returning ? written.map((r) => ({ ...r })) : null, error: null };
  }

  then<A = { data: unknown; error: unknown; count?: number }, B = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown; count?: number }) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve()
      .then(() => this.execute())
      .then(onfulfilled, onrejected);
  }
}

export class FakeOutboxDb {
  readonly tables = new Map<string, Row[]>();
  readonly log: Array<{ table: string; mode: Mode }> = [];
  private failures: FailureRule[] = [];
  private counter = 0;

  constructor(readonly now = '2026-07-25T12:00:00.000Z') {}

  rows(table: string): Row[] {
    let rows = this.tables.get(table);
    if (!rows) {
      rows = [];
      this.tables.set(table, rows);
    }
    return rows;
  }

  seed(table: string, rows: object[]): this {
    this.rows(table).push(...rows.map((r) => ({ ...(r as Row) })));
    return this;
  }

  fail(spec: FailureSpec): this {
    this.failures.push({
      table: spec.table,
      mode: spec.mode,
      code: spec.code,
      message: spec.message ?? `injected failure on ${spec.table}`,
      remaining: spec.times ?? Number.POSITIVE_INFINITY,
    });
    return this;
  }

  /** Drop every scheduled failure, as if the outage ended. */
  heal(): this {
    this.failures = [];
    return this;
  }

  takeFailure(table: string, mode: Mode): { message: string; code?: string } | null {
    const rule = this.failures.find(
      (f) => f.table === table && (f.mode === undefined || f.mode === mode) && f.remaining > 0,
    );
    if (!rule) return null;
    rule.remaining -= 1;
    return { message: rule.message, code: rule.code };
  }

  nextId(table: string): string {
    this.counter += 1;
    return `${table}-${this.counter}`;
  }

  from(table: string) {
    return new Query(this, table);
  }

  /** RPC results by function name. Unregistered names succeed with `true` (the cron locks). */
  readonly rpcs = new Map<string, (args: Record<string, unknown>) => { data: unknown; error: unknown }>();

  async rpc(name: string, args: Record<string, unknown> = {}) {
    this.log.push({ table: `rpc:${name}`, mode: 'select' });
    const handler = this.rpcs.get(name);
    return handler ? handler(args) : { data: true, error: null };
  }
}
