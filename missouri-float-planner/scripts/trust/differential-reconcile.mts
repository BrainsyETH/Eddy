// scripts/trust/differential-reconcile.mts
// Does the in-memory replay in fake-supabase.ts still agree with
// 20260804193041_trust_apply_reconcile.sql?
//
// ── Why this exists outside `npm test` ──────────────────────────────────
//
// Moving the ledger's writes into one plpgsql function bought atomicity and
// created one liability: ledger-wiring.test.ts — the sabotage suite that proves
// a broken check does not resolve findings — asserts on rows in tables, and now
// those rows are written by SQL that CI cannot run. The fake replays the plan
// in memory so that coverage survives, which means there are two
// implementations and they can drift.
//
// They already did. The first run of this script found the fake writing a fresh
// reconcile_anomaly with occurrences 0 where Postgres wrote 1, because a plain
// INSERT takes the column DEFAULT and the ON CONFLICT DO UPDATE never runs.
// Nothing in the hermetic suite could have noticed.
//
// The duplication is bounded on purpose: trust_apply_reconcile() carries no
// policy — planReconcile() decides, it applies — so what is duplicated is
// mechanics, not judgement. This script pins the mechanics.
//
// ── Running it ──────────────────────────────────────────────────────────
//
// Needs any local PostgreSQL 16; it never touches a Supabase project. From
// missouri-float-planner/:
//
//   initdb -D /tmp/pgdata -U postgres --auth=trust        # as a non-root user
//   pg_ctl -D /tmp/pgdata -o "-p 55432 -k /tmp" -l /tmp/pgdata/log start
//   psql -h /tmp -p 55432 -U postgres -c "create role service_role"
//   psql -h /tmp -p 55432 -U postgres \
//     -f supabase/migrations/20260804141538_trust_ledger.sql \
//     -f supabase/migrations/20260804192501_trust_findings_lifecycle_constraints.sql \
//     -f supabase/migrations/20260804193041_trust_apply_reconcile.sql
//   npx tsx scripts/trust/differential-reconcile.mts
//
// Run it after changing either implementation. Exits non-zero on disagreement.

import { execFileSync } from 'node:child_process';
import { createFakeSupabase } from '../../src/lib/trust/fake-supabase';

const RUN_IDS = [
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  '44444444-4444-4444-4444-444444444444',
  '55555555-5555-5555-5555-555555555555',
];

function psql(sql: string): string {
  return execFileSync('psql', ['-h', '/tmp', '-p', '55432', '-U', 'postgres', '-tAq', '-c', sql], {
    encoding: 'utf8',
  }).trim();
}

const CHECK = 'vrd';
const f = (fp: string, over: Record<string, unknown> = {}) => ({
  fingerprint: fp,
  rule_key: 'stale_gauge',
  entity_type: 'river',
  entity_key: fp,
  severity: 'critical',
  title: `title ${fp}`,
  detail: `detail ${fp}`,
  evidence: {},
  snoozed_until: null,
  ...over,
});

const run = (over: Record<string, unknown> = {}) => ({
  status: 'ok',
  suppressed_reason: null,
  scope_count: 13,
  duration_ms: 5,
  error_detail: null,
  ...over,
});

// A sequence that exercises raise / touch / resolve / recurrence / snooze /
// anomaly / clear_anomaly, in the order a real ledger would produce them.
const PAYLOADS: Record<string, unknown>[] = [
  {
    run_id: RUN_IDS[0], check_id: CHECK, now: '2026-08-04T12:00:00Z',
    raise: [f('a'), f('b'), f('gov', { snoozed_until: '2026-11-04T23:59:59.999Z' })],
    touch: [], resolve: [], anomaly: null, clear_anomaly: true, run: run(),
  },
  {
    run_id: RUN_IDS[1], check_id: CHECK, now: '2026-08-04T13:00:00Z',
    raise: [], touch: [{ fingerprint: 'a', severity: 'high', title: 'a2', detail: 'd2', evidence: {}, wake: false }],
    resolve: ['b'], anomaly: null, clear_anomaly: true, run: run({ scope_count: 12 }),
  },
  {
    // b comes back: occurrences climbs, first_seen_at must not move.
    run_id: RUN_IDS[2], check_id: CHECK, now: '2026-08-05T12:00:00Z',
    raise: [f('b', { title: 'b-again' })], touch: [], resolve: [],
    anomaly: null, clear_anomaly: true, run: run(),
  },
  {
    // A refused pass files a complaint and resolves nothing. The live snooze on
    // 'gov' must survive being named in resolve.
    run_id: RUN_IDS[3], check_id: CHECK, now: '2026-08-06T12:00:00Z',
    raise: [], touch: [], resolve: ['gov'],
    anomaly: {
      fingerprint: 'anom', rule_key: 'reconcile_anomaly', entity_type: 'global',
      entity_key: CHECK, severity: 'critical', title: 'refused', detail: 'empty_scope', evidence: {},
    },
    clear_anomaly: false,
    run: run({ status: 'error', suppressed_reason: 'empty_scope', scope_count: 0, error_detail: 'examined 0' }),
  },
  {
    // Clean pass again: the standing complaint clears itself.
    run_id: RUN_IDS[4], check_id: CHECK, now: '2026-11-05T12:00:00Z',
    // 'gov' is now emitted with no snooze — its exception lapsed.
    raise: [], touch: [{ fingerprint: 'gov', severity: 'high', title: 'gov', detail: 'd', evidence: {}, wake: true }],
    resolve: [], anomaly: null, clear_anomaly: true, run: run(),
  },
];

// ── real ──────────────────────────────────────────────────────────────
psql('truncate trust_findings, trust_runs cascade');
for (const id of RUN_IDS) {
  psql(`insert into trust_runs (id, check_id, status, error_detail) values ('${id}','${CHECK}','error','run did not complete')`);
}
const realCounts: string[] = [];
for (const p of PAYLOADS) {
  realCounts.push(psql(`select public.trust_apply_reconcile('${JSON.stringify(p).replace(/'/g, "''")}'::jsonb)`));
}
const realRows = psql(
  `select fingerprint||'|'||status||'|'||occurrences||'|'||coalesce(snoozed_until::date::text,'-')
     from trust_findings order by fingerprint`,
);
const realRuns = psql(
  `select id||'|'||status||'|'||findings_raised||'|'||findings_touched||'|'||findings_resolved
     from trust_runs order by id`,
);

// ── fake ──────────────────────────────────────────────────────────────
const fake = createFakeSupabase({
  trust_findings: [],
  trust_runs: RUN_IDS.map((id) => ({ id, check_id: CHECK, status: 'error', error_detail: 'run did not complete' })),
});
const fakeCounts: string[] = [];
await (async () => {
  for (const p of PAYLOADS) {
    const { data, error } = await fake.rpc('trust_apply_reconcile', { p_payload: p });
    if (error) throw new Error(`fake failed: ${JSON.stringify(error)}`);
    const c = data as { raised: number; touched: number; resolved: number };
    fakeCounts.push(JSON.stringify({ raised: c.raised, touched: c.touched, resolved: c.resolved }));
  }
})();
const d = (v: unknown) => (v ? String(v).slice(0, 10) : '-');
const fakeRows = fake
  .rows('trust_findings')
  .map((r) => `${r.fingerprint}|${r.status}|${r.occurrences}|${d(r.snoozed_until)}`)
  .sort()
  .join('\n');
const fakeRuns = fake
  .rows('trust_runs')
  .map((r) => `${r.id}|${r.status}|${r.findings_raised}|${r.findings_touched}|${r.findings_resolved}`)
  .sort()
  .join('\n');

// ── compare ───────────────────────────────────────────────────────────
let failed = false;
function cmp(label: string, a: string, b: string) {
  const norm = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean).sort().join('\n');
  if (norm(a) === norm(b)) {
    console.log(`✓ ${label}`);
  } else {
    failed = true;
    console.log(`✗ ${label}\n--- postgres ---\n${a}\n--- fake ---\n${b}`);
  }
}

cmp(
  'counts per call',
  realCounts.map((c) => JSON.stringify(JSON.parse(c))).join('\n'),
  fakeCounts.join('\n'),
);
// first_seen_at is excluded: Postgres defaults it to now() (the real clock)
// while the fake uses the run's injected `now`, so the absolute values differ by
// construction. Its PRESERVATION across a resolve-and-return cycle is what
// matters, and ledger-wiring.test.ts asserts that directly.
//
// finished_at is excluded for the same reason and is worth naming separately,
// because it used to be comparable and that was the bug: both sides stamped it
// with the payload's `now`, so they agreed exactly while both were wrong. Since
// 20260810200000 Postgres uses now() at finalize and the fake uses a constant
// after its insert default. What matters is the ORDERING against started_at,
// which the SQL enforces with a CHECK constraint and ledger-wiring.test.ts
// asserts on the fake.
cmp('findings (fingerprint|status|occurrences|snoozed)', realRows, fakeRows);
cmp('runs (id|status|raised|touched|resolved)', realRuns, fakeRuns);

console.log(failed ? '\nDIFFERENTIAL FAILED' : '\nfake-supabase agrees with the SQL function');
process.exit(failed ? 1 : 0);
