import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
import { centralDayStart } from '@/lib/data/dam-history';
import * as factsModule from './dam-read-facts';
import {
  REWRITE_AFTER_HOURS,
  UNVERIFIED_MAX_AGE_HOURS,
  damReadExpiresAt,
  needsRewrite,
  servable,
  tierDamRead,
} from './dam-update-policy';

const HOUR = 3_600_000;
// 10 AM Central, Saturday 2026-10-31.
const NOW = centralDayStart('2026-10-31') + 10 * HOUR;
const at = (ms: number) => new Date(ms).toISOString();

test('a Read is written when none exists, on a new Central day, or on a new schedule', () => {
  assert.equal(needsRewrite(null, 'abc12345', NOW), true);
  // Written at 11 PM last night: still "yesterday" at the dam.
  assert.equal(needsRewrite({ generatedAt: at(centralDayStart('2026-10-31') - HOUR), scheduleHash: 'abc12345' }, 'abc12345', NOW), true);
  assert.equal(needsRewrite({ generatedAt: at(NOW - HOUR), scheduleHash: 'abc12345' }, 'def67890', NOW), true);
  // A schedule appearing where none was posted is a change too.
  assert.equal(needsRewrite({ generatedAt: at(NOW - HOUR), scheduleHash: null }, 'def67890', NOW), true);
});

test('an unchanged Read is left alone until it is REWRITE_AFTER_HOURS old', () => {
  const latest = (ageHours: number) => ({ generatedAt: at(NOW - ageHours * HOUR), scheduleHash: 'abc12345' });
  assert.equal(needsRewrite(latest(1), 'abc12345', NOW), false);
  assert.equal(needsRewrite(latest(REWRITE_AFTER_HOURS - 0.5), 'abc12345', NOW), false);
  assert.equal(needsRewrite(latest(REWRITE_AFTER_HOURS), 'abc12345', NOW), true);
});

test('a Read expires at the next Central midnight', () => {
  assert.equal(damReadExpiresAt(NOW), at(centralDayStart('2026-11-01')));
  // Across the fall-back transition the next midnight is still the next day's start.
  assert.equal(damReadExpiresAt(centralDayStart('2026-11-01') + 20 * HOUR), at(centralDayStart('2026-11-02')));
});

test('same-day history remains servable with a current snapshot even when regeneration is due', () => {
  const row = { generatedAt: at(NOW - 7 * HOUR), expiresAt: damReadExpiresAt(NOW), scheduleHash: 'old' };
  assert.equal(needsRewrite(row, 'new', NOW), true);
  assert.equal(servable(row, true, NOW), true, 'a changed schedule or due refresh cannot hide history');
  assert.equal(servable({ ...row, expiresAt: at(NOW) }, true, NOW), false);
  const yesterday = { ...row, generatedAt: at(centralDayStart('2026-10-31') - HOUR), expiresAt: at(NOW + HOUR) };
  assert.equal(servable(yesterday, true, NOW), false);
  assert.equal(servable({ ...row, generatedAt: at(NOW + 1) }, true, NOW), false);
  assert.equal(servable({ ...row, generatedAt: 'invalid' }, true, NOW), false);
  assert.equal(servable({ ...row, expiresAt: 'invalid' }, true, NOW), false);
});

test('without a snapshot, fallback expires after three hours and never crosses Central midnight', () => {
  const row = { generatedAt: at(NOW - UNVERIFIED_MAX_AGE_HOURS * HOUR), expiresAt: at(NOW + 10 * HOUR) };
  assert.equal(servable(row, false, NOW), true);
  assert.equal(servable(row, false, NOW + 1), false);
  const midnight = centralDayStart('2026-11-01');
  assert.equal(servable({ generatedAt: at(midnight - HOUR), expiresAt: at(midnight + HOUR) }, false, midnight), false);
});

test('all of a dam Read is Premium', () => {
  const prose = { summaryText: 's', eddyRead: 'e', quoteText: 'q' };
  assert.equal(tierDamRead(false, prose), null);
  assert.deepEqual(tierDamRead(true, prose), prose);
});

test('the API serves revised schedules immediately and advances missing-snapshot fallbacks', async () => {
  const written = centralDayStart('2026-10-31') + (11 + 47 / 60) * HOUR;
  let now = centralDayStart('2026-10-31') + (12 + 20 / 60) * HOUR;
  const schedule = (start: number) => [{ scheduleDate: '2026-10-31', retrievedAt: at(now),
    hours: Array.from({ length: 24 }, (_, i) => ({ hourEnding: i + 1, megawatts: i === start ? 50 : 0,
      cfs: null, isRamp: false })),
  }];
  const facts = factsModule.buildDamReadFacts({ damId: 'swl-bull-shoals-dam', damName: 'Bull Shoals Dam',
    floorCfs: 100, reference: null, schedule: schedule(11), observed: [], scheduleVersions: [], now: written });
  let snapshot: { schedule: ReturnType<typeof schedule> } | null = { schedule: schedule(16) };
  let entitled = true;
  const data = { facts, generated_at: at(written), expires_at: damReadExpiresAt(written),
    schedule_hash: 'the-old-schedule', sources_used: ['SWPA schedule'] };
  const query = { select: () => query, eq: () => query, order: () => query, limit: () => query,
    maybeSingle: async () => ({ data, error: null }) };
  class Response {
    constructor(readonly body: unknown) {}
    static json(body: unknown) { return new Response(body); }
  }
  const dependencies: Record<string, unknown> = {
    'next/server': { NextResponse: Response },
    '@/lib/api-utils': { optionalAuthCacheHeaders: () => ({}) },
    '@/lib/supabase/admin': { createAdminClient: () => ({ from: () => query }) },
    '@/lib/entitlement': { optionalEntitlement: async () => entitled ? {} : null },
    '@/lib/data/dam-snapshot-store': { readStoredSnapshot: async () => snapshot },
    '@/lib/eddy/dam-read-facts': factsModule,
    '@/lib/eddy/dam-update-policy': { servable, tierDamRead },
  };
  const exports: { GET?: (request: unknown, context: unknown) => Promise<Response> } = {};
  const code = ts.transpileModule(readFileSync('src/app/api/dam-update/[damId]/route.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(code, { exports, console, Date: class extends Date { static now() { return now; } },
    require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; } });
  const get = async () => JSON.parse(JSON.stringify((await exports.GET!({ headers: { get: () => 'Bearer test' } },
    { params: Promise.resolve({ damId: 'swl-bull-shoals-dam' }) })).body));
  const changed = await get();
  assert.equal(changed.available, true);
  assert.match(changed.read.takeaway.summary, /4 PM/);
  assert.equal(changed.read.mayBeOutdated, false);
  snapshot = { schedule: [] };
  assert.equal((await get()).read.takeaway.headline, 'Today’s schedule isn’t posted');
  snapshot = null;
  const fallback = await get();
  assert.equal(fallback.read.takeaway.headline, 'No more generation scheduled today');
  assert.equal(fallback.read.mayBeOutdated, true);
  assert.equal(facts.posted!.days[0].windows.length, 1, 'the stored row was not mutated');
  entitled = false;
  assert.equal((await get()).read, null, 'fallback does not change the Premium boundary');
  entitled = true;
  now = written + UNVERIFIED_MAX_AGE_HOURS * HOUR + 1;
  assert.equal((await get()).available, false);
  snapshot = { schedule: schedule(16) };
  assert.equal((await get()).available, true);
  now = centralDayStart('2026-11-01');
  assert.equal((await get()).available, false);
});

test('dam_updates is server-only and rejects malformed rows', async () => {
  const db = new PGlite();
  try {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
    await db.exec(readFileSync('supabase/migrations/20261101214925_dam_updates.sql', 'utf8'));
    const insert = (expires: string, facts = "'{}'") => db.exec(
      `insert into public.dam_updates (dam_id, summary_text, quote_text, facts, expires_at) values ('swl-bull-shoals-dam', 's', 'q', ${facts}, ${expires})`,
    );
    await insert("now() + interval '1 hour'");
    await assert.rejects(insert("now() - interval '1 hour'"), /check/i);
    await assert.rejects(insert("now() + interval '1 hour'", "'[]'"), /check/i);

    for (const role of ['anon', 'authenticated']) {
      await db.exec(`SET ROLE ${role}`);
      await assert.rejects(db.query('select * from public.dam_updates'), /permission denied/);
      await db.exec('RESET ROLE');
    }
    await db.exec('SET ROLE service_role');
    const { rows } = await db.query<{ n: number }>('select count(*)::int as n from public.dam_updates');
    assert.equal(rows[0].n, 1);
  } finally {
    await db.close();
  }
});
