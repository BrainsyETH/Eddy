// Failure-path tests for the alert pipeline: each one breaks something the
// passes depend on and asserts the system RECOVERS — nothing lost, nothing
// sent twice. The pure planners have their own exhaustive tests; these cover
// the glue around them, which is where every one of these bugs actually was.

import assert from 'node:assert/strict';
import test from 'node:test';
import { FakeOutboxDb } from './fake-outbox-db';
import { drainRiverEvents } from './river-delivery';
import { deliverGaugeAlerts } from './gauge-delivery';
import { DeliveryReadError } from './delivery-io';
import { persistGaugeAlertPlan } from './gauge-alert-persist';
import { loadLastTold } from './gauge-last-told';
import { planGaugeAlerts, type GaugeAlertSubscription, type StationReading } from './gauge-threshold';
import { sendExpoPush, type ExpoMessage, type ExpoTicket } from '@/lib/push/expo';

const NOW = new Date('2026-07-25T12:00:00.000Z');
const RIVER = 'river-1';

/** A transport that records what it was asked to send and fails the tokens it is told to. */
function transport(failing: Set<string> = new Set()) {
  const sent: string[] = [];
  const send = async (messages: ExpoMessage[]): Promise<ExpoTicket[]> =>
    messages.map((m) => {
      const to = String(m.to);
      if (failing.has(to)) return { status: 'error', message: 'injected', details: { error: 'MessageRateExceeded' } } as ExpoTicket;
      sent.push(to);
      return { status: 'ok', id: `ticket-${to}-${sent.length}` } as ExpoTicket;
    });
  return { send, sent, failing };
}

function riverEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt-1',
    river_id: RIVER,
    kind: 'warning',
    old_condition_code: 'good',
    new_condition_code: 'dangerous',
    reading_at: '2026-07-25T11:45:00.000Z',
    reading_value: 9.1,
    reading_unit: 'ft',
    detected_at: '2026-07-25T11:50:00.000Z',
    push_attempts: 0,
    push_delivered_at: null,
    rivers: { name: 'Current River', slug: 'current' },
    river_gauges: null,
    ...overrides,
  };
}

/** One river event and three subscribers (a, b, c), one device each. */
function riverWorld() {
  return new FakeOutboxDb(NOW.toISOString())
    .seed('river_condition_events', [riverEvent()])
    .seed(
      'alert_subscriptions',
      ['a', 'b', 'c'].map((u) => ({ id: `sub-${u}`, user_id: u, river_id: RIVER, kind: 'all', one_shot: false, fired_at: null, enabled: true })),
    )
    .seed(
      'device_tokens',
      ['a', 'b', 'c'].map((u) => ({ id: `tok-${u}`, user_id: u, expo_push_token: `ExponentPushToken[${u}]`, disabled_at: null, failure_count: 0 })),
    );
}

const event = (db: FakeOutboxDb, id = 'evt-1') =>
  db.rows('river_condition_events').find((r) => r.id === id) as Record<string, unknown>;

const run = (db: FakeOutboxDb, t: ReturnType<typeof transport>) =>
  drainRiverEvents(db, { now: NOW, send: t.send, pauseMs: 0 });

// ── 1. A failed lookup leaves the work pending ───────────────────────────────

for (const table of ['alert_subscriptions', 'device_tokens', 'notification_preferences', 'alert_push_deliveries']) {
  test(`a failed ${table} read aborts the river pass with nothing sent and nothing drained`, async () => {
    // Each of these used to read as "empty": no subscribers drained the batch,
    // no tokens planned nothing (= finished), no preferences ignored quiet
    // hours, no recent sends defeated the cooldown.
    const db = riverWorld().fail({ table, mode: 'select' });
    const t = transport();

    await assert.rejects(run(db, t), DeliveryReadError);

    assert.deepEqual(t.sent, [], 'Nothing may be sent on a guess');
    assert.equal(event(db).push_delivered_at, null, 'The event stays in the outbox');
    assert.equal(event(db).push_attempts, 0, 'An aborted pass does not burn an attempt');

    // And it recovers once the database does.
    db.heal();
    await run(db, t);
    assert.deepEqual(t.sent.sort(), ['ExponentPushToken[a]', 'ExponentPushToken[b]', 'ExponentPushToken[c]']);
    assert.ok(event(db).push_delivered_at);
  });
}

// ── 1b. The cooldown reads what an earlier warning SAID ──────────────────────

/** User `a` was pushed `kind` about this river two hours ago, for event `eventId`. */
function priorSend(db: FakeOutboxDb, eventId: string, overrides: Record<string, unknown> = {}) {
  return db.seed('alert_push_deliveries', [
    {
      event_id: eventId,
      device_token_id: 'tok-a',
      user_id: 'a',
      river_id: RIVER,
      kind: 'warning',
      status: 'sent',
      event_source: 'river_condition',
      sent_at: '2026-07-25T10:00:00.000Z',
      ...overrides,
    },
  ]);
}

test('a river that went high, then dangerous, warns the same person twice', async () => {
  // End to end through the ledger: the earlier send is a `warning` row with no
  // condition on it, and the pass has to look the event up to learn it said
  // "high" — otherwise the flood warning is read as a repeat and dropped.
  const db = riverWorld().seed('river_condition_events', [
    riverEvent({ id: 'evt-high', new_condition_code: 'high', push_delivered_at: '2026-07-25T10:00:00.000Z' }),
  ]);
  priorSend(db, 'evt-high');
  const t = transport();

  await run(db, t);

  assert.ok(t.sent.includes('ExponentPushToken[a]'), 'The flood warning reaches the person already told "high"');
});

test('a river already announced as dangerous does not warn the same person again', async () => {
  const db = riverWorld().seed('river_condition_events', [
    riverEvent({ id: 'evt-earlier', new_condition_code: 'dangerous', push_delivered_at: '2026-07-25T10:00:00.000Z' }),
  ]);
  priorSend(db, 'evt-earlier');
  const t = transport();

  await run(db, t);

  assert.deepEqual(t.sent.sort(), ['ExponentPushToken[b]', 'ExponentPushToken[c]']);
});

test('a gauge alert sent about the same river does not cool down the river alert', async () => {
  // Same ledger, same river id, same kind — a different stretch of water.
  const db = riverWorld();
  priorSend(db, 'gauge-evt-1', { event_source: 'gauge_alert' });
  // Seeded as `dangerous` so that only the source can let this through.
  db.seed('river_condition_events', [
    riverEvent({ id: 'gauge-evt-1', new_condition_code: 'dangerous', push_delivered_at: '2026-07-25T10:00:00.000Z' }),
  ]);
  const t = transport();

  await run(db, t);

  assert.ok(t.sent.includes('ExponentPushToken[a]'));
});

// ── 2. One successful recipient does not strand the rest ─────────────────────

test('a partly delivered river event retries exactly the recipients it missed', async () => {
  const db = riverWorld();
  const t = transport(new Set(['ExponentPushToken[b]', 'ExponentPushToken[c]']));

  const first = await run(db, t);
  assert.equal(first.status, 200);
  assert.deepEqual(t.sent, ['ExponentPushToken[a]']);
  assert.equal(event(db).push_delivered_at, null, 'One of three reached is not done');
  assert.equal(event(db).push_attempts, 1);

  t.failing.clear();
  await run(db, t);
  assert.deepEqual(
    t.sent.sort(),
    ['ExponentPushToken[a]', 'ExponentPushToken[b]', 'ExponentPushToken[c]'],
    'b and c are retried; a is not pushed a second time',
  );
  assert.ok(event(db).push_delivered_at);
  assert.equal(event(db).push_outcome, 'sent');
});

// ── 3. A failed send does not suppress its own retry ─────────────────────────

test('a failed send is retried on the next pass instead of being read as a recent send', async () => {
  // The ledger row of a failed send has sent_at = now(). The cooldown used to
  // count it, so the retry planned nothing and the event drained unsent.
  const db = riverWorld();
  db.rows('alert_subscriptions').splice(1); // just subscriber a
  const t = transport(new Set(['ExponentPushToken[a]']));

  await run(db, t);
  assert.equal(event(db).push_delivered_at, null);
  assert.equal(db.rows('alert_push_deliveries')[0].status, 'error');

  t.failing.clear();
  await run(db, t);
  assert.deepEqual(t.sent, ['ExponentPushToken[a]']);
  assert.equal(event(db).push_outcome, 'sent');
});

// ── 4. A failed "already sent" read cannot cause a duplicate ─────────────────

test('a failed prior-delivery read after a partial pass aborts rather than re-pushing', async () => {
  const db = riverWorld();
  const t = transport(new Set(['ExponentPushToken[b]']));
  await run(db, t);
  assert.deepEqual(t.sent.sort(), ['ExponentPushToken[a]', 'ExponentPushToken[c]']);

  t.failing.clear();
  db.fail({ table: 'alert_push_deliveries', mode: 'select' });
  await assert.rejects(run(db, t), DeliveryReadError);
  assert.equal(t.sent.length, 2, 'a and c were not pushed again on a failed read');
});

// ── 5. Outcomes are recorded, and their absence never blocks the drain ───────

test('expired and skipped events are labelled, not merged into "delivered"', async () => {
  const db = riverWorld()
    .seed('river_condition_events', [
      riverEvent({ id: 'old', detected_at: '2026-07-25T07:00:00.000Z' }),
      riverEvent({ id: 'lonely', river_id: 'river-2' }),
    ]);
  await run(db, transport());
  assert.equal(event(db, 'old').push_outcome, 'expired');
  assert.equal(event(db, 'lonely').push_outcome, 'skipped');
  assert.equal(event(db, 'evt-1').push_outcome, 'sent');
});

test('a database without the push_outcome column still drains', async () => {
  // The column ships in its own migration; code deployed first must not stall.
  const db = riverWorld();
  const realFrom = db.from.bind(db);
  db.from = (table: string) => {
    const q = realFrom(table);
    const update = q.update.bind(q);
    q.update = (payload: Record<string, unknown>) => {
      if ('push_outcome' in payload) db.fail({ table, mode: 'update', code: 'PGRST204', message: "Could not find the 'one_shot_rule_id' column", times: 1 });
      return update(payload);
    };
    return q;
  };
  await run(db, transport());
  assert.ok(event(db).push_delivered_at, 'Drained even though the outcome write failed');
});

test('retries give up by draining at MAX_ATTEMPTS, labelled given_up', async () => {
  const db = riverWorld();
  event(db).push_attempts = 4;
  await run(db, transport(new Set(['ExponentPushToken[c]'])));
  assert.ok(event(db).push_delivered_at);
  assert.equal(event(db).push_outcome, 'given_up');
});

// ── Gauge pass ───────────────────────────────────────────────────────────────

function gaugeWorld() {
  return new FakeOutboxDb(NOW.toISOString())
    .seed('gauge_alert_events', [
      {
        id: 'gevt-1',
        subscription_id: 'gsub-1',
        user_id: 'a',
        gauge_station_id: 'station-1',
        river_id: null,
        kind: 'threshold',
        reading_value: 3.4,
        reading_unit: 'ft',
        reading_at: '2026-07-25T11:45:00.000Z',
        condition_code: null,
        detected_at: '2026-07-25T11:50:00.000Z',
        push_attempts: 0,
        push_delivered_at: null,
        gauge_stations: { name: 'Van Buren', usgs_site_id: '07067000', site_id_external: null },
        rivers: null,
        gauge_alert_subscriptions: {
          scope: 'gauge',
          mode: 'threshold',
          condition_kind: null,
          metric: 'gauge_height_ft',
          comparator: 'above',
          threshold_value: 3,
          threshold_value_max: null,
          enabled: true,
          parent_subscription_id: null,
        },
      },
    ])
    .seed('device_tokens', [{ id: 'tok-a', user_id: 'a', expo_push_token: 'ExponentPushToken[a]', disabled_at: null, failure_count: 0 }]);
}

const gaugeEvent = (db: FakeOutboxDb) => db.rows('gauge_alert_events')[0] as Record<string, unknown>;

test('a failed token read leaves the gauge alert pending and reports the pass as failed', async () => {
  const db = gaugeWorld().fail({ table: 'device_tokens', mode: 'select' });
  const t = transport();
  const stats = await deliverGaugeAlerts(db, NOW, { send: t.send, pauseMs: 0 });

  assert.ok(stats.error, 'The caller must be able to tell this from an empty outbox');
  assert.deepEqual(t.sent, []);
  assert.equal(gaugeEvent(db).push_delivered_at, null);
  assert.equal(gaugeEvent(db).push_attempts, 0);
});

test('a gauge alert delivered but never stamped drained is not sent again', async () => {
  // The drain write failed after a successful send. The ledger knows.
  const db = gaugeWorld().fail({ table: 'gauge_alert_events', mode: 'update', times: 1 });
  const t = transport();
  await deliverGaugeAlerts(db, NOW, { send: t.send, pauseMs: 0 });
  assert.deepEqual(t.sent, ['ExponentPushToken[a]']);
  assert.equal(gaugeEvent(db).push_delivered_at, null, 'Drain write failed');

  await deliverGaugeAlerts(db, NOW, { send: t.send, pauseMs: 0 });
  assert.deepEqual(t.sent, ['ExponentPushToken[a]'], 'No second push');
  assert.ok(gaugeEvent(db).push_delivered_at);
  assert.equal(gaugeEvent(db).push_outcome, 'sent');
});

// ── 5a. A ledger write that fails after the send does not resend ─────────────

test('a river ledger write that fails after sending still drains, so nothing is sent twice', async () => {
  // The pushes have left. Aborting the pass here used to leave every event
  // pending, and the next pass sent them all again.
  const db = riverWorld().fail({ table: 'alert_push_deliveries', mode: 'upsert', times: 1 });
  const t = transport();
  await run(db, t);
  assert.equal(t.sent.length, 3);
  assert.ok(event(db).push_delivered_at, 'Drained from this pass’s own tally');

  await run(db, t);
  assert.equal(t.sent.length, 3, 'No second push');
});

test('a mixed river send survives a failed ledger write and retries only the missed phone', async () => {
  const db = riverWorld().fail({ table: 'alert_push_deliveries', mode: 'upsert' });
  const t = transport(new Set(['ExponentPushToken[b]']));
  await run(db, t);
  assert.equal(event(db).push_delivered_at, null);
  t.failing.clear();
  await run(db, t);
  assert.deepEqual(t.sent.sort(), ['ExponentPushToken[a]', 'ExponentPushToken[b]', 'ExponentPushToken[c]']);
  assert.ok(event(db).push_delivered_at);
});

test('a failure reading the fallback recipients defers the pass before any send', async () => {
  const db = riverWorld().fail({ table: 'alert_push_unrecorded_recipients', mode: 'select' });
  const t = transport();
  await assert.rejects(run(db, t), DeliveryReadError);
  assert.deepEqual(t.sent, []);
  assert.equal(event(db).push_delivered_at, null);
});

test('an unregistered ticket cannot retire a phone that registered again during the send', async () => {
  const db = riverWorld();
  for (const token of db.rows('device_tokens')) token.last_seen_at = NOW.toISOString();
  await drainRiverEvents(db, { now: NOW, pauseMs: 0, send: async batch => {
    db.rows('device_tokens')[0].last_seen_at = new Date(NOW.getTime() + 1000).toISOString();
    return batch.map(() => ({ status: 'error', details: { error: 'DeviceNotRegistered' } }));
  } });
  const [fresh, older] = db.rows('device_tokens');
  assert.equal(fresh.disabled_at, null);
  assert.ok(older.disabled_at);
});

test('a one-time gauge alert spends once even when ticket persistence and the first drain fail', async () => {
  const db = gaugeWorld().fail({ table: 'alert_push_deliveries', mode: 'upsert' })
    .fail({ table: 'gauge_alert_events', mode: 'update', times: 1 });
  const setting = { id: 'gsub-1', one_shot: true, one_shot_fired_at: null, enabled: true };
  Object.assign(gaugeEvent(db).gauge_alert_subscriptions as object, setting);
  db.seed('gauge_alert_subscriptions', [setting]);
  const t = transport();
  const stats = await deliverGaugeAlerts(db, NOW, { send: t.send, pauseMs: 0 });
  assert.equal(stats.error, undefined);
  assert.equal(gaugeEvent(db).push_delivered_at, null);
  assert.equal(db.rows('gauge_alert_subscriptions')[0].one_shot_fired_at, NOW.toISOString());
  assert.equal(db.rows('alert_push_unrecorded_recipients').length, 1);

  await deliverGaugeAlerts(db, NOW, { send: t.send, pauseMs: 0 });
  assert.deepEqual(t.sent, ['ExponentPushToken[a]'], 'No second push');
  assert.ok(gaugeEvent(db).push_delivered_at);
});

test('a ledger without the one-time spend column still records every ticket', async () => {
  // Code deployed before migration 20261120150000: the column is missing, so
  // the rows are written without it instead of not at all.
  const db = riverWorld()
    .fail({ table: 'alert_push_unrecorded_recipients', mode: 'select', code: 'PGRST205' })
    .fail({ table: 'alert_push_deliveries', mode: 'upsert', code: 'PGRST204', message: "Could not find the 'one_shot_rule_id' column", times: 1 });
  const t = transport();
  await run(db, t);
  const rows = db.rows('alert_push_deliveries');
  assert.equal(rows.length, 3);
  for (const row of rows) assert.equal('one_shot_rule_id' in row, false);
  assert.ok(event(db).push_delivered_at);
});

// ── 5b. A warning nobody received does not cool down the next one ────────────

/** gaugeWorld, with its one event a condition rule's flood warning. */
function floodWorld() {
  const db = gaugeWorld();
  Object.assign(gaugeEvent(db), {
    kind: 'warning',
    condition_code: 'dangerous',
    river_id: RIVER,
    rivers: { name: 'Current River', slug: 'current' },
    gauge_alert_subscriptions: {
      ...(gaugeEvent(db).gauge_alert_subscriptions as object),
      mode: 'condition',
      condition_kind: 'safety',
      metric: null,
      comparator: null,
      threshold_value: null,
    },
  });
  return db;
}

/** The rule behind that event, as the evaluator loads it: fired ten minutes ago. */
const FLOOD_RULE = {
  id: 'gsub-1',
  mode: 'condition',
  last_triggered_at: '2026-07-25T11:50:00.000Z',
} as GaugeAlertSubscription;

test('a flood warning that exhausts its retries is not counted as told', async () => {
  // Every send fails until the event is given up. Until then it is on its way
  // and must hold the rule; afterwards the user has heard nothing, and the
  // cooldown must not treat the next flood warning as a repeat of this one.
  const db = floodWorld();
  const t = transport(new Set(['ExponentPushToken[a]']));

  await deliverGaugeAlerts(db, NOW, { send: t.send, pauseMs: 0 });
  assert.equal(gaugeEvent(db).push_delivered_at, null, 'Still retrying');
  assert.equal((await loadLastTold(db, [FLOOD_RULE], NOW)).get('gsub-1'), 'dangerous', 'On its way counts');

  for (let pass = 0; pass < 6 && gaugeEvent(db).push_delivered_at == null; pass++) {
    await deliverGaugeAlerts(db, NOW, { send: t.send, pauseMs: 0 });
  }
  assert.equal(gaugeEvent(db).push_outcome, 'given_up');
  assert.deepEqual(t.sent, []);

  const lastTold = await loadLastTold(db, [FLOOD_RULE], NOW);
  assert.equal(lastTold.has('gsub-1'), true);
  assert.equal(lastTold.get('gsub-1'), null, 'Nothing reached this person');
});

test('a flood warning that was delivered is what the user was told', async () => {
  const db = floodWorld();
  const t = transport();
  await deliverGaugeAlerts(db, NOW, { send: t.send, pauseMs: 0 });
  assert.deepEqual(t.sent, ['ExponentPushToken[a]']);
  assert.equal((await loadLastTold(db, [FLOOD_RULE], NOW)).get('gsub-1'), 'dangerous');
});

// ── 6. A failed insert preserves the crossing ────────────────────────────────

function rule(overrides: Partial<GaugeAlertSubscription> = {}): GaugeAlertSubscription {
  return {
    id: 'gsub-1',
    user_id: 'a',
    gauge_station_id: 'station-1',
    river_id: null,
    mode: 'threshold',
    condition_kind: null,
    metric: 'gauge_height_ft',
    comparator: 'above',
    threshold_value: 3,
    threshold_value_max: null,
    enabled: true,
    one_shot: false,
    last_state: 'outside',
    last_value: 2.5,
    last_reading_at: '2026-07-25T10:45:00.000Z',
    last_triggered_at: null,
    one_shot_fired_at: null,
    last_condition_code: null,
    ...overrides,
  };
}

const rising: StationReading = {
  gauge_station_id: 'station-1',
  gauge_height_ft: 3.4,
  discharge_cfs: 480,
  qualifiers: ['P'],
  reading_at: '2026-07-25T11:45:00.000Z',
  provider: 'usgs',
};

function evaluate(db: FakeOutboxDb) {
  const subscriptions = db.rows('gauge_alert_subscriptions') as unknown as GaugeAlertSubscription[];
  const plan = planGaugeAlerts({
    subscriptions: subscriptions.map((s) => ({ ...s })),
    readings: new Map([['station-1', rising]]),
    ladders: new Map(),
    now: NOW,
  });
  return persistGaugeAlertPlan(db, plan).then((result) => ({ plan, result }));
}

test('a failed outbox insert keeps the crossing, and the rule fires on the next pass', async () => {
  const db = new FakeOutboxDb(NOW.toISOString())
    .seed('gauge_alert_subscriptions', [
      { ...rule() },
      { ...rule({ id: 'gsub-quiet', last_state: 'inside', last_reading_at: '2026-07-25T10:45:00.000Z' }) },
    ])
    .fail({ table: 'gauge_alert_events', mode: 'upsert', times: 1 });

  const first = await evaluate(db);
  assert.equal(first.plan.fired.length, 1);
  assert.equal(first.result.outboxFailed, true);
  assert.equal(first.result.heldBack, 1);
  const held = db.rows('gauge_alert_subscriptions').find((r) => r.id === 'gsub-1')!;
  assert.equal(held.last_state, 'outside', 'The crossing was not consumed');
  assert.equal(held.last_triggered_at, null);
  const other = db.rows('gauge_alert_subscriptions').find((r) => r.id === 'gsub-quiet')!;
  assert.equal(other.last_reading_at, rising.reading_at, 'Rules that did not fire still advance');

  const second = await evaluate(db);
  assert.equal(second.plan.fired.length, 1, 'Re-fires on the same reading');
  assert.equal(db.rows('gauge_alert_events').length, 1);
  assert.equal(held.last_state, 'inside');
});

test('a failed state write after a good insert re-fires harmlessly: no second event', async () => {
  const db = new FakeOutboxDb(NOW.toISOString())
    .seed('gauge_alert_subscriptions', [{ ...rule() }])
    .fail({ table: 'gauge_alert_subscriptions', mode: 'update', times: 1 });

  const first = await evaluate(db);
  assert.equal(first.result.inserted, 1);
  assert.equal(first.result.stateFailed, 1);

  const second = await evaluate(db);
  assert.equal(second.result.inserted, 0, 'The duplicate (subscription, reading) is ignored');
  assert.equal(db.rows('gauge_alert_events').length, 1);
  assert.equal(db.rows('gauge_alert_subscriptions')[0].last_state, 'inside');
});

test('one failed Expo batch cannot disable a healthy device and stop the retry', async () => {
  const db = new FakeOutboxDb(NOW.toISOString());
  for (let i = 0; i < 5; i++) {
    db.seed('river_condition_events', [riverEvent({ id: `e${i}`, river_id: `r${i}` })]);
    db.seed('alert_subscriptions', [{ id: `s${i}`, river_id: `r${i}`, user_id: 'a', kind: 'all', enabled: true, one_shot: false }]);
  }
  db.seed('device_tokens', [{ id: 't', user_id: 'a', expo_push_token: 'ExpoPushToken[fixture]', disabled_at: null, failure_count: 4 }]);
  const failed = await drainRiverEvents(db, { now: NOW, pauseMs: 0, send: messages =>
    sendExpoPush(messages, { fetchImpl: async () => new Response(null, { status: 503 }), sleepImpl: async () => {} })
  });
  assert.equal(failed.body.failed, 5);
  assert.equal(db.rows('device_tokens')[0].disabled_at, null);
  const healthy = transport();
  await run(db, healthy);
  assert.equal(healthy.sent.length, 5);
});

test('push deadlines use the reading and detection times and stay fixed across retries', async () => {
  const db = riverWorld();
  const messages: { sentAt: Date; message: ExpoMessage }[] = [];
  const retryAt = new Date(NOW.getTime() + 300_000);
  await drainRiverEvents(db, { now: NOW, pauseMs: 0, send: async batch => {
    messages.push(...batch.map(message => ({ sentAt: NOW, message })));
    return batch.map(() => ({ status: 'error' as const }));
  } });
  await drainRiverEvents(db, { now: retryAt, pauseMs: 0, send: async batch => {
    messages.push(...batch.map(message => ({ sentAt: retryAt, message })));
    return batch.map(() => ({ status: 'ok' as const, id: 'ok' }));
  } });
  assert.equal(messages.length, 6);
  for (const { sentAt, message } of messages) {
    // Sent as a ttl that counts down to the same deadline on every retry.
    assert.equal(sentAt.getTime() / 1000 + (message.ttl ?? 0), Date.parse('2026-07-25T14:45:00Z') / 1000);
    assert.match(message.body ?? '', /6:45 AM CDT on Saturday/);
    assert.equal(message.interruptionLevel, 'time-sensitive');
  }
});

test('a one-time river rule waits for its first crossing to resolve before draining the second', async () => {
  const db = riverWorld();
  const [rule] = db.rows('alert_subscriptions');
  db.rows('alert_subscriptions').splice(1);
  rule.one_shot = true;
  db.seed('river_condition_events', [riverEvent({ id: 'second', kind: 'floatable', detected_at: NOW.toISOString() })]);
  const t = transport(new Set(['ExponentPushToken[a]']));
  await run(db, t);
  assert.equal(event(db, 'second').push_delivered_at, null);
  assert.equal(event(db, 'second').push_attempts, 0);
  t.failing.clear();
  await run(db, t);
  await run(db, t);
  assert.deepEqual(t.sent, ['ExponentPushToken[a]']);
  assert.equal(event(db, 'second').push_outcome, 'skipped');
});
