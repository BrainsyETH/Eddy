import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, beforeEach, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { NextRequest } from 'next/server';
import { PATCH, POST } from '../../app/api/me/alert-subscriptions/route';

const db = new PGlite();
const user = '00000000-0000-4000-8000-000000000001';
const river = '00000000-0000-4000-8000-000000000002';
const otherUser = '00000000-0000-4000-8000-000000000003';
const stamp = '2026-11-20T12:00:00Z';

before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users(id uuid primary key);
    insert into auth.users values ('${user}');
    create table river_condition_events(id uuid primary key);
    create table gauge_alert_events(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$select '${user}'::uuid$$;
    create table alert_subscriptions (id uuid primary key default gen_random_uuid(),
      user_id uuid, river_id uuid, kind text, one_shot boolean, enabled boolean, fired_at timestamptz,
      last_triggered_at timestamptz, created_at timestamptz default now(), unique(user_id, river_id));
    create table gauge_alert_subscriptions (id uuid primary key default gen_random_uuid(),
      user_id uuid, parent_subscription_id uuid, station text, mode text default 'condition',
      condition_kind text, one_shot boolean, enabled boolean default true,
      one_shot_fired_at timestamptz, last_triggered_at timestamptz, constraint idx_gas_dedupe unique(user_id, station, condition_kind));
    create table alert_push_deliveries (event_id uuid, event_source text, sent_at timestamptz, user_id uuid, device text,
      status text default 'sent', receipt_checked_at timestamptz);
  `);
  const migration = readFileSync(new URL('../../../supabase/migrations/20261120150000_river_alert_delivery.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec(migration); // Operators can safely retry the pending migration.
});
after(() => db.close());
beforeEach(() => db.exec('truncate alert_subscriptions, gauge_alert_subscriptions, alert_push_deliveries'));

async function save(kind: string | null, once: boolean | null, enabled: boolean | null, rearm: boolean, create: boolean) {
  return (await db.query<{ id: string; enabled: boolean }>(
    'select * from save_river_alert($1,$2,$3,$4,$5,$6)', [river, kind, once, enabled, rearm, create]
  )).rows[0];
}

async function gauge(parent: string | null, station: string, kind: string, once = false, enabled = true) {
  return (await db.query<{ id: string }>(`insert into gauge_alert_subscriptions
    (user_id,parent_subscription_id,station,condition_kind,one_shot,enabled)
    values ($1,$2,$3,$4,$5,$6) returning id`, [user, parent, station, kind, once, enabled])).rows[0].id;
}

test('creating, editing and replacing through the HTTP routes update the same database rows', async (t) => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://alert-fixture.invalid';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'fixture-key';
  t.after(() => {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousKey;
  });
  // Keep auth and PostgREST local. The real route, Supabase client and
  // migration own validation, RPC parameters, writes and response shape.
  let missingFunction = false;
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path === '/auth/v1/user') return Response.json({ id: user, is_anonymous: false });
    assert.equal(path, '/rest/v1/rpc/save_river_alert');
    if (missingFunction) return Response.json({ code: 'PGRST202', message: 'Function missing' }, { status: 404 });
    const params = await request.json();
    const { rows } = await db.query(
      'select * from save_river_alert($1,$2,$3,$4,$5,$6)',
      [params.p_river_id, params.p_kind, params.p_one_shot, params.p_enabled, params.p_rearm, params.p_create],
    );
    return Response.json(request.headers.get('accept')?.includes('vnd.pgrst.object') ? rows[0] : rows);
  });
  const send = (method: 'POST' | 'PATCH', kind: string) => {
    const request = new NextRequest('https://eddy.invalid/api/me/alert-subscriptions', {
      method, headers: { authorization: 'Bearer fixture', 'Content-Type': 'application/json' },
      body: JSON.stringify({ riverId: river, kind }),
    });
    return method === 'POST' ? POST(request) : PATCH(request);
  };
  const first = await send('POST', 'floatable');
  assert.equal(first.status, 200);
  const { subscription } = await first.json();
  await gauge(subscription.id, 'Sullivan', 'floatable');
  for (const [method, kind] of [['PATCH', 'safety'], ['POST', 'all']] as const) {
    const response = await send(method, kind);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).subscription.id, subscription.id);
    const { rows } = await db.query<{ condition_kind: string }>('select condition_kind from gauge_alert_subscriptions');
    assert.equal(rows[0].condition_kind, kind);
  }
  missingFunction = true;
  for (const method of ['POST', 'PATCH'] as const) {
    const unavailable = await send(method, 'safety');
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.headers.get('retry-after'), '60');
  }
});

for (const create of [false, true]) {
  test(`${create ? 'replace' : 'edit'} changes followers and preserves overrides, paused gauges and standalone collisions`, async () => {
    const parent = await save('floatable', false, true, false, true);
    await gauge(parent.id, 'A', 'floatable', false, false);
    await gauge(parent.id, 'B', 'all');
    await gauge(parent.id, 'C', 'floatable');
    await gauge(null, 'C', 'safety');
    await gauge(parent.id, 'D', 'floatable', true);
    const saved = await save('safety', true, true, create, create);
    assert.equal(saved.id, parent.id);
    const { rows } = await db.query<{ station: string; condition_kind: string; one_shot: boolean; enabled: boolean }>('select station,condition_kind,one_shot,enabled from gauge_alert_subscriptions order by station,condition_kind');
    assert.deepEqual(rows.map(row => [row.station, row.condition_kind, row.one_shot, row.enabled]), [
      ['A', 'safety', true, false],
      ['B', 'all', false, true],
      ['C', 'floatable', false, true],
      ['C', 'safety', false, true],
      ['D', 'floatable', true, true],
    ]);
  });
}

test('pause writes no child, and rearm restores only spent matching gauges', async () => {
  const parent = await save('safety', true, true, false, true);
  const spent = await gauge(parent.id, 'A', 'safety', true, false);
  await gauge(parent.id, 'B', 'safety', true, false);
  await gauge(parent.id, 'C', 'safety', true, true);
  await db.query('update gauge_alert_subscriptions set one_shot_fired_at=$1 where id=$2', [stamp, spent]);
  await save(null, null, false, false, false);
  assert.equal((await db.query<{ n: number }>('select count(*)::int as n from gauge_alert_subscriptions where enabled')).rows[0].n, 1);
  await save(null, null, null, true, false);
  assert.deepEqual((await db.query<{ enabled: boolean }>('select enabled from gauge_alert_subscriptions order by station')).rows.map(r => r.enabled), [true, false, true]);
});

test('editing a missing rule does not create one or change another user’s rule', async () => {
  await db.query('insert into alert_subscriptions(user_id,river_id,kind) values($1,$2,$3)', [otherUser, river, 'all']);
  assert.equal(await save('safety', false, true, false, false), undefined);
  assert.equal((await db.query<{ kind: string }>('select kind from alert_subscriptions')).rows[0].kind, 'all');
});

test('an unexpected write failure rolls back both the river and its gauges', async () => {
  const parent = await save('floatable', false, true, false, true);
  await gauge(parent.id, 'A', 'floatable');
  await gauge(parent.id, 'B', 'floatable');
  await db.exec(`alter table gauge_alert_subscriptions add constraint fixture_failure
    check (station <> 'B' or condition_kind <> 'safety')`);
  try {
    await assert.rejects(save('safety', true, true, true, true), /fixture_failure/);
    const { rows } = await db.query<{ kind: string }>(
      'select kind from alert_subscriptions union all select condition_kind from gauge_alert_subscriptions',
    );
    assert.deepEqual(rows.map(row => row.kind), ['floatable', 'floatable', 'floatable']);
  } finally {
    await db.exec('alter table gauge_alert_subscriptions drop constraint fixture_failure');
  }
});

test('only the delivery worker can see fallback recipients', async () => {
  const { rows } = await db.query<{ role: string; can_read: boolean; can_write: boolean }>(`
    select role, has_table_privilege(role, 'alert_push_unrecorded_recipients', 'SELECT') as can_read,
      has_table_privilege(role, 'alert_push_unrecorded_recipients', 'INSERT') as can_write
    from unnest(array['anon','authenticated','service_role']) as role`);
  assert.deepEqual(rows.map(r => [r.role, r.can_read, r.can_write]), [
    ['anon', false, false], ['authenticated', false, false], ['service_role', true, true],
  ]);
});

for (const source of ['river_condition', 'gauge_alert']) {
  test(`${source} keeps a one-time alert spent when an accepted phone has an unknown receipt`, async () => {
    const parent = await save('safety', true, true, false, true);
    const isRiver = source === 'river_condition';
    const ruleId = isRiver ? parent.id : await gauge(parent.id, 'A', 'safety', true);
    const table = isRiver ? 'alert_subscriptions' : 'gauge_alert_subscriptions';
    const firedAt = isRiver ? 'fired_at' : 'one_shot_fired_at';
    const events = isRiver ? 'river_condition_events' : 'gauge_alert_events';
    const eventColumn = isRiver ? 'river_event_id' : 'gauge_event_id';
    const eventId = (await db.query<{ id: string }>(`insert into ${events} values(gen_random_uuid()) returning id`)).rows[0].id;
    await db.query(`update ${table} set enabled=false,${firedAt}=$1 where id=$2`, [stamp, ruleId]);
    await db.query(`insert into alert_push_unrecorded_recipients(${eventColumn},user_id,one_shot_rule_id,sent_at)
      values ($1,$2,$3,$4)`, [eventId, user, ruleId, stamp]);
    await db.query('insert into alert_push_deliveries(event_source,event_id,user_id,one_shot_rule_id,sent_at) values($1,$2,$3,$4,$5)',
      [source, eventId, user, ruleId, stamp]);
    await db.query("update alert_push_deliveries set status='error', receipt_checked_at=now() where event_id=$1", [eventId]);
    assert.equal((await db.query<{ enabled: boolean }>(`select enabled from ${table} where id=$1`, [ruleId])).rows[0].enabled, false);
    await db.query(`delete from ${events} where id=$1`, [eventId]);
    assert.equal((await db.query('select * from alert_push_unrecorded_recipients')).rows.length, 0);
  });
  test(`${source} one-shot is restored only when every accepted ticket for the same spend explicitly fails`, async () => {
    const parent = await save('safety', true, true, false, true);
    const isRiver = source === 'river_condition';
    const id = isRiver ? parent.id : await gauge(parent.id, 'A', 'safety', true);
    const table = isRiver ? 'alert_subscriptions' : 'gauge_alert_subscriptions';
    const column = isRiver ? 'fired_at' : 'one_shot_fired_at';
    await db.query(`update ${table} set enabled=false,${column}=$1 where id=$2`, [stamp, id]);
    for (const [device, time] of [['a', stamp], ['b', stamp], ['old', '2026-11-19T12:00:00Z']]) {
      await db.query('insert into alert_push_deliveries(event_source,sent_at,user_id,device,one_shot_rule_id) values ($1,$2,$3,$4,$5)', [source, time, user, device, id]);
    }
    const fail = (device: string) => db.query("update alert_push_deliveries set status='error',receipt_checked_at=now() where device=$1", [device]);
    const enabled = async () => (await db.query<{ enabled: boolean }>(`select enabled from ${table} where id=$1`, [id])).rows[0].enabled;
    await fail('old');
    assert.equal(await enabled(), false, 'a receipt from a previous arming cannot restore this one');
    await fail('a');
    assert.equal(await enabled(), false, 'a pending device could still receive it');
    // A confirmed delivery on another device also keeps this arming spent.
    await db.query("update alert_push_deliveries set receipt_checked_at=now() where device='b'");
    await db.query("insert into alert_push_deliveries(event_source,sent_at,user_id,device,one_shot_rule_id) values ($1,$2,$3,'c',$4)", [source, stamp, user, id]);
    await fail('c');
    assert.equal(await enabled(), false, 'one confirmed receipt is enough');
  });
  test(`${source} re-arms for the next crossing after the sole accepted ticket fails`, async () => {
    const parent = await save('safety', true, true, false, true);
    const isRiver = source === 'river_condition';
    const id = isRiver ? parent.id : await gauge(parent.id, 'A', 'safety', true);
    const table = isRiver ? 'alert_subscriptions' : 'gauge_alert_subscriptions';
    const column = isRiver ? 'fired_at' : 'one_shot_fired_at';
    await db.query(`update ${table} set enabled=false,${column}=$1 where id=$2`, [stamp, id]);
    await db.query("insert into alert_push_deliveries(event_source,sent_at,user_id,device,one_shot_rule_id) values ($1,$2,$3,'b',$4)", [source, stamp, user, id]);
    await db.query("update alert_push_deliveries set status='error',receipt_checked_at=now() where device='b'");
    const enabled = async () => (await db.query<{ enabled: boolean }>(`select enabled from ${table} where id=$1`, [id])).rows[0].enabled;
    assert.equal(await enabled(), true);
  });
}
