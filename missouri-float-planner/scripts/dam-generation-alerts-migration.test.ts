import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// 20261117230000 creates the dam generation alert tables (ADR 0020). It is
// applied to production separately from the code that uses it, so these tests
// run the real file against a fixture of the objects it depends on and check
// the promises the code leans on: an alert with no time cannot exist, a notice
// is queued once, the outbox is server-only, and a person reads and writes only
// their own alert.

const migration = readFileSync('supabase/migrations/20261117230000_dam_generation_alerts.sql', 'utf8');

const USER_A = '00000000-0000-0000-0000-00000000000a';
const USER_B = '00000000-0000-0000-0000-00000000000b';
const DAM = 'swl-table-rock-dam';

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    -- Stand-ins for Supabase's auth.uid() and migration 00180's
    -- is_permanent_user(), driven by settings so a test can be someone.
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $f$ SELECT nullif(current_setting('test.uid', true), '')::uuid $f$;
    CREATE FUNCTION public.is_permanent_user() RETURNS boolean LANGUAGE sql STABLE AS
      $f$ SELECT coalesce(current_setting('test.permanent', true), '') = 'true' $f$;
    -- The ledger as 00190 + 00203 left it.
    CREATE TABLE public.alert_push_deliveries (
      event_id uuid NOT NULL, device_token_id uuid NOT NULL, user_id uuid NOT NULL,
      kind text NOT NULL,
      event_source text NOT NULL DEFAULT 'river_condition'
        CHECK (event_source IN ('river_condition', 'gauge_alert')),
      PRIMARY KEY (event_id, device_token_id));
    INSERT INTO auth.users VALUES ('${USER_A}'), ('${USER_B}');
  `);
  await db.exec(migration);
  return db;
}

/** Run statements as a signed-in user, the way a request through RLS would. */
async function as(db: PGlite, uid: string, permanent: boolean, sql: string) {
  await db.exec(`SET test.uid = '${uid}'; SET test.permanent = '${permanent}'; SET ROLE authenticated;`);
  try {
    return await db.query<Record<string, unknown>>(sql);
  } finally {
    await db.exec('RESET ROLE;');
  }
}

const insertAlert = (user: string, atStart: boolean, hourBefore: boolean) =>
  `INSERT INTO dam_generation_alerts (user_id, dam_id, notify_at_start, notify_hour_before)
   VALUES ('${user}', '${DAM}', ${atStart}, ${hourBefore}) RETURNING id`;

test('the migration applies, and an alert needs at least one time', async () => {
  const db = await fixture();
  await db.query(insertAlert(USER_A, true, false));
  await assert.rejects(db.query(insertAlert(USER_B, false, false)), /dam_generation_alerts_has_a_time/);
});

test('one alert per person per dam', async () => {
  const db = await fixture();
  await db.query(insertAlert(USER_A, true, false));
  await assert.rejects(db.query(insertAlert(USER_A, false, true)), /dam_generation_alerts_one_per_dam/);
  await db.query(insertAlert(USER_B, false, true));
});

test('a notice is queued once per alert, start and lead, and goes with its alert', async () => {
  const db = await fixture();
  const { rows } = await db.query<{ id: string }>(insertAlert(USER_A, true, true));
  const event = (lead: number) =>
    `INSERT INTO dam_generation_alert_events (alert_id, user_id, dam_id, start_at, lead_minutes)
     VALUES ('${rows[0].id}', '${USER_A}', '${DAM}', '2026-07-25T20:00:00Z', ${lead})`;

  await db.query(event(60));
  await db.query(event(0));
  await assert.rejects(db.query(event(60)), /dam_generation_alert_events_once/);
  await assert.rejects(db.query(event(30)), /lead_minutes/);
  // What the delivery pass actually issues: a conflicting insert is a no-op.
  await db.query(`${event(60)} ON CONFLICT (alert_id, start_at, lead_minutes) DO NOTHING`);

  await db.query(`DELETE FROM dam_generation_alerts WHERE id = '${rows[0].id}'`);
  const left = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM dam_generation_alert_events');
  assert.equal(left.rows[0].n, 0);
});

test('the shared ledger accepts the new source and still refuses an unknown one', async () => {
  const db = await fixture();
  const ledger = (source: string) =>
    `INSERT INTO alert_push_deliveries (event_id, device_token_id, user_id, kind, event_source)
     VALUES (gen_random_uuid(), gen_random_uuid(), '${USER_A}', 'generation_start', '${source}')`;
  await db.query(ledger('dam_generation'));
  await db.query(ledger('gauge_alert'));
  await assert.rejects(db.query(ledger('something_else')), /alert_push_deliveries_event_source_check/);
});

test('a person reads and changes only their own alert, and needs a permanent account to write', async () => {
  const db = await fixture();
  await as(db, USER_A, true, insertAlert(USER_A, true, false));
  await as(db, USER_B, true, insertAlert(USER_B, false, true));

  const seen = await as(db, USER_A, true, 'SELECT user_id FROM dam_generation_alerts');
  assert.deepEqual(seen.rows.map((r) => r.user_id), [USER_A]);

  // Someone else's row: an update matches nothing, and an insert is refused.
  const stolen = await as(db, USER_A, true, `UPDATE dam_generation_alerts SET notify_hour_before = true WHERE user_id = '${USER_B}' RETURNING id`);
  assert.equal(stolen.rows.length, 0);
  await assert.rejects(as(db, USER_A, true, insertAlert(USER_B, true, true)), /row-level security/);

  // An anonymous session cannot create one, but can always remove its own.
  await db.query(`DELETE FROM dam_generation_alerts WHERE user_id = '${USER_A}'`);
  await assert.rejects(as(db, USER_A, false, insertAlert(USER_A, true, false)), /row-level security/);
  await db.query(insertAlert(USER_A, true, false));
  const removed = await as(db, USER_A, false, `DELETE FROM dam_generation_alerts WHERE user_id = '${USER_A}' RETURNING id`);
  assert.equal(removed.rows.length, 1);
});

test('the outbox is server-only', async () => {
  const db = await fixture();
  await assert.rejects(as(db, USER_A, true, 'SELECT * FROM dam_generation_alert_events'), /permission denied/);
  await db.exec('SET ROLE anon;');
  try {
    await assert.rejects(db.query('SELECT * FROM dam_generation_alerts'), /permission denied/);
  } finally {
    await db.exec('RESET ROLE;');
  }
});
