// Route-level tests for PUT /api/me/dam-alerts, the save behind the dam
// screen's two generation-alert switches (ADR 0020).
//
// ── What this pins ──────────────────────────────────────────────────────────
// The app sends only the switch that moved, and the saved alert must end up
// with BOTH switches right whatever else is in flight. The route once read the
// alert, merged in the handler and wrote both times back: two requests enabling
// different switches at once each read before the other wrote, and the second
// write cleared the first.
//
// These tests call the real handler. Supabase is replaced at `fetch`, by a
// stand-in that answers the auth check and runs database calls against PGlite
// loaded with the REAL migration, as the signed-in user and through its
// row-level policies. The stand-in serves ONE database endpoint for a save:
// the set_dam_generation_alert function. A save that reads or writes the table
// directly fails here, which is the point — the merge cannot be torn apart if
// the route never does it.
//
// ── What it cannot show ─────────────────────────────────────────────────────
// PGlite is a single connection, so it runs one database call at a time. The
// simultaneous requests below interleave at the network, not inside Postgres.
// That the function also holds under truly parallel connections (its advisory
// lock) was checked on Postgres 16 when it was written; ADR 0020 records how.

import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { NextRequest } from 'next/server';
import { USACE_DAMS } from '@/lib/flow-providers/usace-registry';

const SUPABASE = 'http://supabase.test';
process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';

const migration = readFileSync('supabase/migrations/20261118215519_dam_generation_alerts.sql', 'utf8');
const DAM = 'swl-table-rock-dam';
const UNSCHEDULED = Object.values(USACE_DAMS).find((dam) => !dam.swpaCode)!.id;

let db: PGlite;
const originalFetch = globalThis.fetch;
/** Every database request the route made, by the token that made it. */
const databaseCalls: Array<{ token: string; path: string }> = [];
/** Set to answer the function call as PostgREST does before the migration is applied. */
let functionMissing = false;

/** A signed-in user: `user:<uuid>` is permanent, `anon:<uuid>` is an anonymous session. */
function identity(token: string): { id: string; anonymous: boolean } {
  const [kind, id] = token.split(':');
  return { id, anonymous: kind === 'anon' };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Run SQL as the signed-in user, inside one transaction so nothing interleaves with its role. */
async function asUser<T>(token: string, sql: string, params: unknown[] = []): Promise<T[]> {
  const { id, anonymous } = identity(token);
  return db.transaction(async (tx) => {
    await tx.exec(`SET LOCAL test.uid = '${id}'; SET LOCAL test.permanent = '${!anonymous}'; SET LOCAL ROLE authenticated;`);
    return (await tx.query<T>(sql, params)).rows;
  });
}

async function supabaseStandIn(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const request = new Request(input, init);
  const url = new URL(request.url);
  if (url.origin !== SUPABASE) throw new Error(`unexpected request to ${url.origin}`);
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer /i, '');

  if (url.pathname === '/auth/v1/user') {
    const { id, anonymous } = identity(token);
    return json({ id, aud: 'authenticated', role: 'authenticated', is_anonymous: anonymous, app_metadata: {}, user_metadata: {} });
  }

  databaseCalls.push({ token, path: url.pathname });
  // Let simultaneous requests overlap on the wire, in either order.
  await new Promise((resolve) => setTimeout(resolve, Math.random() * 8));

  try {
    if (url.pathname === '/rest/v1/rpc/set_dam_generation_alert' && request.method === 'POST') {
      if (functionMissing) return json({ code: 'PGRST202', message: 'Could not find the function' }, 404);
      const args = (await request.json()) as { p_dam_id: string; p_at_start: boolean | null; p_hour_before: boolean | null };
      return json(
        await asUser(token, 'SELECT * FROM set_dam_generation_alert($1, $2, $3)', [
          args.p_dam_id,
          args.p_at_start,
          args.p_hour_before,
        ]),
      );
    }
    if (url.pathname === '/rest/v1/dam_generation_alerts' && request.method === 'GET') {
      return json(
        await asUser(
          token,
          'SELECT dam_id, notify_at_start, notify_hour_before, created_at FROM dam_generation_alerts ORDER BY created_at DESC',
        ),
      );
    }
  } catch (error) {
    const pg = error as { code?: string; message?: string };
    return json({ code: pg.code ?? 'XX000', message: pg.message ?? 'database error' }, 400);
  }
  // Anything else is a database call this route should not be making.
  return json({ code: 'TEST', message: `the stand-in does not serve ${request.method} ${url.pathname}` }, 400);
}

before(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $f$ SELECT nullif(current_setting('test.uid', true), '')::uuid $f$;
    CREATE FUNCTION public.is_permanent_user() RETURNS boolean LANGUAGE sql STABLE AS
      $f$ SELECT coalesce(current_setting('test.permanent', true), '') = 'true' $f$;
    CREATE TABLE public.alert_push_deliveries (
      event_id uuid NOT NULL, device_token_id uuid NOT NULL, user_id uuid NOT NULL, kind text NOT NULL,
      event_source text NOT NULL DEFAULT 'river_condition'
        CHECK (event_source IN ('river_condition', 'gauge_alert')),
      PRIMARY KEY (event_id, device_token_id));
  `);
  await db.exec(migration);
  globalThis.fetch = supabaseStandIn as typeof fetch;
});

after(async () => {
  globalThis.fetch = originalFetch;
  await db.close();
});

/** A fresh account, so tests neither share alerts nor a rate-limit bucket. */
async function newUser(kind: 'user' | 'anon' = 'user'): Promise<string> {
  const id = randomUUID();
  await db.query('INSERT INTO auth.users VALUES ($1)', [id]);
  return `${kind}:${id}`;
}

async function put(token: string, body: unknown): Promise<{
  status: number;
  body: { alert?: { damId: string; damName: string; atStart: boolean; hourBefore: boolean } | null; error?: string };
}> {
  const { PUT } = await import('@/app/api/me/dam-alerts/route');
  const response = await PUT(
    new NextRequest('http://localhost/api/me/dam-alerts', {
      method: 'PUT',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  return { status: response.status, body: await response.json() };
}

/** The saved alert as the database holds it, bypassing the route. */
async function saved(token: string): Promise<{ atStart: boolean; hourBefore: boolean } | null> {
  const { rows } = await db.query<{ notify_at_start: boolean; notify_hour_before: boolean }>(
    'SELECT notify_at_start, notify_hour_before FROM dam_generation_alerts WHERE user_id = $1',
    [identity(token).id],
  );
  return rows[0] ? { atStart: rows[0].notify_at_start, hourBefore: rows[0].notify_hour_before } : null;
}

const callsBy = (token: string) => databaseCalls.filter((call) => call.token === token).map((call) => call.path);

test('two simultaneous requests enabling different switches both stick', async () => {
  const token = await newUser();
  const [a, b] = await Promise.all([
    put(token, { damId: DAM, atStart: true }),
    put(token, { damId: DAM, hourBefore: true }),
  ]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.deepEqual(await saved(token), { atStart: true, hourBefore: true });
  // Whichever landed second answered with the whole alert.
  assert.ok([a, b].some((r) => r.body.alert?.atStart && r.body.alert?.hourBefore));
});

test('a save is exactly one database call, and it is the atomic function', async () => {
  const token = await newUser();
  await put(token, { damId: DAM, hourBefore: true });
  await put(token, { damId: DAM, atStart: true });
  await put(token, { damId: DAM, atStart: false });
  await put(token, { damId: DAM, hourBefore: false });
  // No read before, no second write after: nothing for another request to land between.
  assert.deepEqual(callsBy(token), Array(4).fill('/rest/v1/rpc/set_dam_generation_alert'));
});

test('simultaneous first-ever switches, repeated: no switch is ever lost', async () => {
  for (let round = 0; round < 25; round += 1) {
    const token = await newUser();
    const results = await Promise.all([
      put(token, { damId: DAM, hourBefore: true }),
      put(token, { damId: DAM, atStart: true }),
    ]);
    assert.deepEqual(results.map((r) => r.status), [200, 200], `round ${round}`);
    assert.deepEqual(await saved(token), { atStart: true, hourBefore: true }, `round ${round}`);
  }
});

test('one switch at a time: the other keeps what is saved, and both off removes the alert', async () => {
  const token = await newUser();
  const first = await put(token, { damId: DAM, atStart: true });
  assert.equal(first.status, 200);
  assert.deepEqual(
    { damId: first.body.alert?.damId, damName: first.body.alert?.damName, atStart: first.body.alert?.atStart, hourBefore: first.body.alert?.hourBefore },
    { damId: DAM, damName: 'Table Rock Dam', atStart: true, hourBefore: false },
  );

  // The reported sequence: "at the start" is saved, then "an hour before" is switched on.
  assert.deepEqual(await saved(token), { atStart: true, hourBefore: false });
  await put(token, { damId: DAM, hourBefore: true });
  assert.deepEqual(await saved(token), { atStart: true, hourBefore: true });

  await put(token, { damId: DAM, atStart: false });
  assert.deepEqual(await saved(token), { atStart: false, hourBefore: true });

  const last = await put(token, { damId: DAM, hourBefore: false });
  assert.equal(last.status, 200);
  assert.equal(last.body.alert, null);
  assert.equal(await saved(token), null);
});

test('a simultaneous on and off of different switches lands as both changes', async () => {
  const token = await newUser();
  await put(token, { damId: DAM, atStart: true });
  await Promise.all([put(token, { damId: DAM, atStart: false }), put(token, { damId: DAM, hourBefore: true })]);
  assert.deepEqual(await saved(token), { atStart: false, hourBefore: true });
});

test('refusals are decided before the database is asked', async () => {
  const anonymous = await newUser('anon');
  assert.equal((await put(anonymous, { damId: DAM, atStart: true })).status, 403);

  const token = await newUser();
  assert.equal((await put(token, { damId: 'no-such-dam', atStart: true })).status, 404);
  assert.equal((await put(token, { damId: UNSCHEDULED, hourBefore: true })).status, 422);
  assert.equal((await put(token, { damId: DAM })).status, 400);
  assert.equal((await put(token, { damId: DAM, atStart: 'yes' })).status, 400);
  assert.equal((await put(token, { atStart: true })).status, 400);

  assert.deepEqual(callsBy(anonymous), []);
  assert.deepEqual(callsBy(token), []);
  assert.equal(await saved(token), null);
});

test('switching a time off works for a dam that has left the registry', async () => {
  const token = await newUser();
  await db.query(
    `INSERT INTO dam_generation_alerts (user_id, dam_id, notify_at_start, notify_hour_before) VALUES ($1, 'retired-dam', true, true)`,
    [identity(token).id],
  );
  assert.equal((await put(token, { damId: 'retired-dam', atStart: false })).status, 200);
  assert.equal((await put(token, { damId: 'retired-dam', hourBefore: false })).status, 200);
  assert.equal(await saved(token), null);
});

test('deployed ahead of its migration, a save says so and is not a server fault', async () => {
  const token = await newUser();
  functionMissing = true;
  try {
    const response = await put(token, { damId: DAM, atStart: true });
    assert.equal(response.status, 503);
    assert.match(response.body.error ?? '', /not available yet/);
  } finally {
    functionMissing = false;
  }
});
