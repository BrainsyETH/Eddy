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
    create table dam_generation_alert_events(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$select '${user}'::uuid$$;
    create table alert_subscriptions (id uuid primary key default gen_random_uuid(),
      user_id uuid, river_id uuid, kind text, one_shot boolean, enabled boolean, fired_at timestamptz,
      last_triggered_at timestamptz, created_at timestamptz default now(), unique(user_id, river_id));
    create table gauge_alert_subscriptions (id uuid primary key default gen_random_uuid(),
      user_id uuid, parent_subscription_id uuid, station text, mode text default 'condition',
      condition_kind text, one_shot boolean, enabled boolean default true,
      one_shot_fired_at timestamptz, last_triggered_at timestamptz,
      last_state text, last_condition_code text, last_value numeric, last_reading_at timestamptz,
      constraint idx_gas_dedupe unique(user_id, station, condition_kind));
    create table alert_push_deliveries (event_id uuid, event_source text, sent_at timestamptz, user_id uuid, device text,
      status text default 'sent', receipt_checked_at timestamptz);
  `);
  // In ledger order. Each is applied twice: operators can safely retry a
  // pending migration.
  for (const file of ['20261120174228_river_alert_delivery.sql', '20261121131024_river_alert_resume_reseed.sql',
    '20261121131051_dam_unrecorded_recipients.sql']) {
    const migration = readFileSync(new URL(`../../../supabase/migrations/${file}`, import.meta.url), 'utf8');
    await db.exec(migration);
    await db.exec(migration);
  }
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

type TestContext = Parameters<NonNullable<Parameters<typeof test>[0]>>[0];

/**
 * The real POST/PATCH handlers against this PGlite database.
 *
 * Keeps auth and PostgREST local. The real route, Supabase client and
 * migration own validation, RPC parameters, writes and response shape.
 */
function routes(t: TestContext) {
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
  const state = { missingFunction: false, rpcParams: [] as Record<string, unknown>[] };
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path === '/auth/v1/user') return Response.json({ id: user, is_anonymous: false });
    assert.equal(path, '/rest/v1/rpc/save_river_alert');
    if (state.missingFunction) return Response.json({ code: 'PGRST202', message: 'Function missing' }, { status: 404 });
    const params = await request.json();
    state.rpcParams.push(params);
    const { rows } = await db.query(
      'select * from save_river_alert($1,$2,$3,$4,$5,$6)',
      [params.p_river_id, params.p_kind, params.p_one_shot, params.p_enabled, params.p_rearm, params.p_create],
    );
    return Response.json(request.headers.get('accept')?.includes('vnd.pgrst.object') ? rows[0] : rows);
  });
  const send = (method: 'POST' | 'PATCH', body: Record<string, unknown>) => {
    const request = new NextRequest('https://eddy.invalid/api/me/alert-subscriptions', {
      method, headers: { authorization: 'Bearer fixture', 'Content-Type': 'application/json' },
      body: JSON.stringify({ riverId: river, ...body }),
    });
    return method === 'POST' ? POST(request) : PATCH(request);
  };
  return { state, send };
}

test('creating, editing and replacing through the HTTP routes update the same database rows', async (t) => {
  const { state, send } = routes(t);
  const first = await send('POST', { kind: 'floatable' });
  assert.equal(first.status, 200);
  const { subscription } = await first.json();
  await gauge(subscription.id, 'Sullivan', 'floatable');
  for (const [method, kind] of [['PATCH', 'safety'], ['POST', 'all']] as const) {
    const response = await send(method, { kind });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).subscription.id, subscription.id);
    const { rows } = await db.query<{ condition_kind: string }>('select condition_kind from gauge_alert_subscriptions');
    assert.equal(rows[0].condition_kind, kind);
  }
  state.missingFunction = true;
  for (const method of ['POST', 'PATCH'] as const) {
    const unavailable = await send(method, { kind: 'safety' });
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.headers.get('retry-after'), '60');
  }
});

test('a re-save that omits oneShot or kind keeps the stored setting, on POST and PATCH', async (t) => {
  // The app's "replace existing" flow POSTs { riverId, kind } with no oneShot.
  // POST used to send p_one_shot=false for that, which silently turned a
  // one-time alert into a repeating one (and p_kind='all' when kind was
  // omitted). save_river_alert keeps the stored value only for a null.
  const { state, send } = routes(t);
  const stored = async () => (await db.query<{ kind: string; one_shot: boolean }>(
    'select kind, one_shot from alert_subscriptions')).rows[0];
  const followers = async () => (await db.query<{ condition_kind: string; one_shot: boolean }>(
    'select condition_kind, one_shot from gauge_alert_subscriptions')).rows[0];

  // Created with both omitted: the defaults, chosen by the database.
  assert.equal((await send('POST', {})).status, 200);
  assert.deepEqual({ ...(await stored()) }, { kind: 'all', one_shot: false });
  assert.equal(state.rpcParams.at(-1)?.p_kind, null);
  assert.equal(state.rpcParams.at(-1)?.p_one_shot, null);

  // Provided values are applied, and followers move with them.
  const saved = await send('POST', { kind: 'safety', oneShot: true });
  assert.equal(saved.status, 200);
  const { subscription } = await saved.json();
  assert.deepEqual({ ...(await stored()) }, { kind: 'safety', one_shot: true });
  await gauge(subscription.id, 'A', 'safety', true);

  for (const method of ['POST', 'PATCH'] as const) {
    // kind only: the one-time setting survives.
    let response = await send(method, { kind: 'floatable' });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).subscription.oneShot, true, `${method} kept oneShot`);
    assert.deepEqual({ ...(await stored()) }, { kind: 'floatable', one_shot: true });
    assert.deepEqual({ ...(await followers()) }, { condition_kind: 'floatable', one_shot: true });

    // oneShot only: the kind survives.
    response = await send(method, { oneShot: false });
    assert.equal(response.status, 200);
    assert.deepEqual({ ...(await stored()) }, { kind: 'floatable', one_shot: false }, `${method} kept kind`);

    // Back to where the next method starts.
    assert.equal((await send(method, { kind: 'safety', oneShot: true })).status, 200);
    assert.deepEqual({ ...(await stored()) }, { kind: 'safety', one_shot: true });
  }

  // POST with neither field is a re-save, not a reset.
  assert.equal((await send('POST', {})).status, 200);
  assert.deepEqual({ ...(await stored()) }, { kind: 'safety', one_shot: true });
  // A provided kind is still validated, on both methods.
  for (const method of ['POST', 'PATCH'] as const) {
    assert.equal((await send(method, { kind: 'floodable' })).status, 400);
  }
  assert.deepEqual({ ...(await stored()) }, { kind: 'safety', one_shot: true });
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

/** A gauge's crossing state, as the evaluator last left it. */
async function track(id: string) {
  await db.query(`update gauge_alert_subscriptions set last_state='inside', last_condition_code='low',
    last_value=1.2, last_reading_at=$1 where id=$2`, [stamp, id]);
}
async function crossing(station: string) {
  const { rows } = await db.query<{ last_state: string | null; last_condition_code: string | null;
    last_value: string | null; last_reading_at: string | null; last_triggered_at: string | null }>(
    `select last_state, last_condition_code, last_value, last_reading_at, last_triggered_at
       from gauge_alert_subscriptions where station=$1`, [station]);
  return rows[0];
}
const unseeded = { last_state: null, last_condition_code: null, last_value: null, last_reading_at: null };
const seenBefore = (row: Awaited<ReturnType<typeof crossing>>) =>
  ({ last_state: row.last_state, last_condition_code: row.last_condition_code });

test('resuming a paused river alert reseeds the gauges it held, and pausing writes none', async () => {
  // While the river alert is off its gauges are dropped from the evaluation
  // pass, so their state freezes. Resumed with that state, the first pass would
  // push a change that happened while the alert was off.
  const parent = await save('safety', false, true, false, true);
  const held = await gauge(parent.id, 'A', 'safety');
  const ownPause = await gauge(parent.id, 'B', 'safety', false, false);
  const standalone = await gauge(null, 'C', 'safety');
  for (const id of [held, ownPause, standalone]) await track(id);
  await db.query('update gauge_alert_subscriptions set last_triggered_at=$1 where id=$2', [stamp, held]);

  await save(null, null, false, false, false);
  assert.deepEqual(seenBefore(await crossing('A')), { last_state: 'inside', last_condition_code: 'low' }, 'pause writes no child');

  await save(null, null, true, false, false);
  const resumed = await crossing('A');
  assert.deepEqual({ ...resumed, last_triggered_at: undefined }, { ...unseeded, last_triggered_at: undefined });
  // The cooldown is not a frozen reading: it is checked against what the user
  // was actually told, which a pause does not change.
  assert.ok(resumed.last_triggered_at, 'cooldown kept');
  // A gauge paused on its own stays as it was, and so does an unrelated rule.
  assert.deepEqual(seenBefore(await crossing('B')), { last_state: 'inside', last_condition_code: 'low' });
  assert.deepEqual(seenBefore(await crossing('C')), { last_state: 'inside', last_condition_code: 'low' });

  // An ordinary re-save of a live alert reseeds nothing: its gauges were
  // evaluated all along.
  await track(held);
  await save('safety', false, true, true, true);
  await save(null, null, true, false, false);
  assert.deepEqual(seenBefore(await crossing('A')), { last_state: 'inside', last_condition_code: 'low' });
});

test('re-arming a spent one-time river alert reseeds its gauges, including revived ones', async () => {
  const parent = await save('safety', true, true, false, true);
  const spentGauge = await gauge(parent.id, 'A', 'safety', true, false);
  const live = await gauge(parent.id, 'B', 'safety', true, true);
  for (const id of [spentGauge, live]) await track(id);
  await db.query('update gauge_alert_subscriptions set one_shot_fired_at=$1, last_triggered_at=$1 where id=$2', [stamp, spentGauge]);
  // Spent: delivery switches the river alert off and stamps it.
  await db.query('update alert_subscriptions set enabled=false, fired_at=$1 where id=$2', [stamp, parent.id]);

  const rearmed = await save(null, null, null, true, false);
  assert.equal(rearmed.enabled, true);
  assert.deepEqual(await crossing('A'), { ...unseeded, last_triggered_at: null });
  assert.deepEqual(seenBefore(await crossing('B')), { last_state: null, last_condition_code: null });
  assert.equal((await db.query<{ enabled: boolean }>('select enabled from gauge_alert_subscriptions where id=$1', [spentGauge])).rows[0].enabled, true);
});

test('re-arming a live alert reseeds only the gauge it revives', async () => {
  // The river alert never went off, so only the spent gauge was frozen.
  const parent = await save('safety', true, true, false, true);
  const spentGauge = await gauge(parent.id, 'A', 'safety', true, false);
  const live = await gauge(parent.id, 'B', 'safety', true, true);
  for (const id of [spentGauge, live]) await track(id);
  await db.query('update gauge_alert_subscriptions set one_shot_fired_at=$1 where id=$2', [stamp, spentGauge]);
  await save(null, null, null, true, false);
  assert.deepEqual(seenBefore(await crossing('A')), { last_state: null, last_condition_code: null });
  assert.deepEqual(seenBefore(await crossing('B')), { last_state: 'inside', last_condition_code: 'low' });
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

test('a dam push can be recorded as reached when its ticket write fails, one event per row', async () => {
  const damEvent = (await db.query<{ id: string }>('insert into dam_generation_alert_events values(gen_random_uuid()) returning id')).rows[0].id;
  const insert = (columns: string, values: unknown[]) => db.query(
    `insert into alert_push_unrecorded_recipients(${columns},user_id,sent_at) values (${values.map((_, i) => `$${i + 1}`).join(',')},$${values.length + 1},$${values.length + 2})`,
    [...values, user, stamp]);
  await insert('dam_event_id', [damEvent]);
  // The worker's upsert conflict target exists.
  await db.query(`insert into alert_push_unrecorded_recipients(dam_event_id,user_id,sent_at) values ($1,$2,$3)
    on conflict (dam_event_id,user_id) do nothing`, [damEvent, user, stamp]);
  assert.equal((await db.query('select * from alert_push_unrecorded_recipients')).rows.length, 1);
  const gaugeEvent = (await db.query<{ id: string }>('insert into gauge_alert_events values(gen_random_uuid()) returning id')).rows[0].id;
  await assert.rejects(insert('dam_event_id,gauge_event_id', [damEvent, gaugeEvent]), /one_event/);
  await assert.rejects(db.query('insert into alert_push_unrecorded_recipients(user_id,sent_at) values ($1,$2)', [user, stamp]), /one_event/);
  // Pruned with its event.
  await db.query('delete from dam_generation_alert_events where id=$1', [damEvent]);
  assert.equal((await db.query('select * from alert_push_unrecorded_recipients')).rows.length, 0);
  await db.query('delete from gauge_alert_events where id=$1', [gaugeEvent]);
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
