// What a gauge alert's push tells the app to open. The routing key is chosen
// by the rule's scope (exactly one of riverSlug / gaugeSiteId); a gauge push
// also names the river the rule graded against, so a station that rates
// several rivers opens that river's ladder. 07014000 is primary for the
// Huzzah and also rates the Courtois: a Courtois alert there must not open
// the Huzzah ladder. The app half is notificationDestination (ios-routes.test.ts).

import assert from 'node:assert/strict';
import test from 'node:test';
import { FakeOutboxDb } from './fake-outbox-db';
import { deliverGaugeAlerts } from './gauge-delivery';
import type { ExpoMessage, ExpoTicket } from '@/lib/push/expo';
import { notificationDestination } from '../../../../eddy-ios/src/lib/notificationDestination';

const NOW = new Date('2026-07-25T12:00:00.000Z');
const COURTOIS = 'river-courtois';

function world(overrides: Record<string, unknown> = {}, rule: Record<string, unknown> = {}) {
  return new FakeOutboxDb(NOW.toISOString())
    .seed('gauge_alert_events', [
      {
        id: 'gevt-1',
        subscription_id: 'gsub-1',
        user_id: 'a',
        gauge_station_id: 'station-steelville',
        river_id: COURTOIS,
        kind: 'warning',
        reading_value: 9.1,
        reading_unit: 'ft',
        reading_at: '2026-07-25T11:45:00.000Z',
        condition_code: 'dangerous',
        detected_at: '2026-07-25T11:50:00.000Z',
        push_attempts: 0,
        push_delivered_at: null,
        gauge_stations: { name: 'Huzzah Creek near Steelville', usgs_site_id: '07014000', site_id_external: null },
        rivers: { name: 'Courtois Creek', slug: 'courtois', timezone: 'America/Chicago' },
        gauge_alert_subscriptions: {
          // A gauge covered by the user's Courtois river alert.
          scope: 'gauge',
          mode: 'condition',
          condition_kind: 'all',
          metric: null,
          comparator: null,
          threshold_value: null,
          threshold_value_max: null,
          enabled: true,
          one_shot: false,
          parent_subscription_id: 'sub-courtois',
          ...rule,
        },
        ...overrides,
      },
    ])
    .seed('alert_subscriptions', [{ id: 'sub-courtois', user_id: 'a', river_id: COURTOIS, kind: 'all', one_shot: false, fired_at: null, enabled: true }])
    .seed('device_tokens', [{ id: 'tok-a', user_id: 'a', expo_push_token: 'ExponentPushToken[a]', disabled_at: null, failure_count: 0 }]);
}

async function deliveredData(db: FakeOutboxDb) {
  const messages: ExpoMessage[] = [];
  const send = async (batch: ExpoMessage[]): Promise<ExpoTicket[]> => {
    messages.push(...batch);
    return batch.map((_, i) => ({ status: 'ok', id: `ticket-${i}` }) as ExpoTicket);
  };
  await deliverGaugeAlerts(db, NOW, { send, pauseMs: 0 });
  assert.equal(messages.length, 1);
  return messages[0].data as Record<string, unknown>;
}

test('a covered-gauge push names the river alert it belongs to, as context not a routing key', async () => {
  const data = await deliveredData(world());
  assert.equal(data.gaugeSiteId, '07014000');
  assert.equal(data.riverSlug, null, 'Still exactly one routing key');
  assert.equal(data.gaugeRiverId, COURTOIS);
  assert.equal(data.gaugeRiverSlug, 'courtois');

  // End to end: the tap opens the station on the Courtois ladder.
  assert.deepEqual(notificationDestination(data), {
    pathname: '/gauge/[siteId]',
    params: { siteId: '07014000', riverId: COURTOIS, riverSlug: 'courtois', alertId: 'gsub-1', alertSource: 'gauge' },
  });
});

test('a gauge push on a station that rates no river carries no river context', async () => {
  const data = await deliveredData(
    world(
      { river_id: null, rivers: null, kind: 'threshold', condition_code: null },
      { mode: 'threshold', condition_kind: null, metric: 'gauge_height_ft', comparator: 'above', threshold_value: 3, parent_subscription_id: null },
    ),
  );
  assert.equal(data.gaugeSiteId, '07014000');
  assert.equal('gaugeRiverId' in data, false);
  assert.equal('gaugeRiverSlug' in data, false);
  assert.deepEqual(notificationDestination(data), {
    pathname: '/gauge/[siteId]',
    params: { siteId: '07014000', alertId: 'gsub-1', alertSource: 'gauge' },
  });
});

test('a river-scoped rule still routes to the river alone', async () => {
  const data = await deliveredData(world({}, { scope: 'river', parent_subscription_id: null }));
  assert.equal(data.riverSlug, 'courtois');
  assert.equal(data.gaugeSiteId, null);
  assert.equal('gaugeRiverId' in data, false);
  assert.equal('gaugeRiverSlug' in data, false);
});
