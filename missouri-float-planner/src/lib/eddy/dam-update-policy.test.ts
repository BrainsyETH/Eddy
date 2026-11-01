import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { centralDayStart } from '@/lib/data/dam-history';
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

test('a Read is served only for today, before expiry, against the schedule posted now', () => {
  const row = { generatedAt: at(NOW - HOUR), expiresAt: damReadExpiresAt(NOW - HOUR), scheduleHash: 'abc12345' };
  assert.equal(servable(row, 'abc12345', NOW), true);
  assert.equal(servable(row, 'def67890', NOW), false, 'schedule changed since it was written');
  assert.equal(servable(row, null, NOW), false, 'the schedule it described is gone');
  assert.equal(servable({ ...row, expiresAt: at(NOW - 1) }, 'abc12345', NOW), false);
  const yesterday = { ...row, generatedAt: at(centralDayStart('2026-10-31') - HOUR), expiresAt: at(NOW + HOUR) };
  assert.equal(servable(yesterday, 'abc12345', NOW), false);
});

test('without a current snapshot to compare, only a young Read is served', () => {
  const young = { generatedAt: at(NOW - HOUR), expiresAt: at(NOW + 10 * HOUR), scheduleHash: 'abc12345' };
  const old = { ...young, generatedAt: at(NOW - (UNVERIFIED_MAX_AGE_HOURS + 1) * HOUR) };
  assert.equal(servable(young, undefined, NOW), true);
  assert.equal(servable(old, undefined, NOW), false);
});

test('all of a dam Read is Premium', () => {
  const prose = { summaryText: 's', eddyRead: 'e', quoteText: 'q' };
  assert.equal(tierDamRead(false, prose), null);
  assert.deepEqual(tierDamRead(true, prose), prose);
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
