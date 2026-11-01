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
import { planGaugeAlerts, type GaugeAlertSubscription, type StationReading } from './gauge-threshold';
import type { ExpoMessage, ExpoTicket } from '@/lib/push/expo';

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
      if ('push_outcome' in payload) db.fail({ table, mode: 'update', code: 'PGRST204', times: 1 });
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
