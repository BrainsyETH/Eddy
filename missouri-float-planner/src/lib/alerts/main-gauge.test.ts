import assert from 'node:assert/strict';
import test from 'node:test';
import { FakeOutboxDb } from './fake-outbox-db';
import {
  ladderKey,
  planGaugeAlerts,
  type GaugeAlertSubscription,
  type LadderRow,
  type StationReading,
} from './gauge-threshold';
import { coveredByMainGauge, loadMainGauges, loadParentAlerts, withoutCovered } from './main-gauge';

// A gauge someone added to a river alert, which a later migration made the
// river's primary gauge, pushed alongside the river alert for the same change.
// These pin the evaluator's side of that: the push is withheld, the rule's
// state still follows the water, and a failed lookup withholds nothing.

const NOW = new Date('2026-07-28T18:00:00Z');
const FRESH = '2026-07-28T17:45:00Z';
const RIVER = 'river-current';
const PARENT = 'parent-1';

const LADDER: LadderRow = {
  levelTooLow: 1,
  levelLow: 2,
  levelOptimalMin: 2.5,
  levelOptimalMax: 4,
  levelHigh: 5,
  levelDangerous: 7,
  thresholdUnit: 'ft',
  floodStageFt: null,
};

function rule(id: string, overrides: Partial<GaugeAlertSubscription> = {}): GaugeAlertSubscription {
  return {
    id,
    user_id: 'user-1',
    gauge_station_id: 'station-main',
    river_id: RIVER,
    mode: 'condition',
    condition_kind: 'all',
    metric: null,
    comparator: null,
    threshold_value: null,
    threshold_value_max: null,
    enabled: true,
    one_shot: false,
    last_state: null,
    last_value: 1.8,
    last_reading_at: '2026-07-28T16:45:00Z',
    last_triggered_at: null,
    one_shot_fired_at: null,
    last_condition_code: 'low',
    parent_subscription_id: PARENT,
    ...overrides,
  };
}

function reading(station: string, height: number): StationReading {
  return { gauge_station_id: station, gauge_height_ft: height, discharge_cfs: 400, qualifiers: ['P'], reading_at: FRESH, provider: 'usgs' };
}

function db() {
  return new FakeOutboxDb(NOW.toISOString())
    .seed('alert_subscriptions', [{ id: PARENT, river_id: RIVER, enabled: true }, { id: 'parent-paused', river_id: 'river-other', enabled: false }])
    .seed('river_gauges', [
      { river_id: RIVER, gauge_station_id: 'station-main', is_primary: true },
      { river_id: RIVER, gauge_station_id: 'station-side', is_primary: false },
      // The main gauge of some other river: not this alert's.
      { river_id: 'river-other', gauge_station_id: 'station-side', is_primary: true },
    ]);
}

test('a gauge added to a river alert that is now its main gauge is planned but not pushed', async () => {
  const fake = db();
  const rules = [
    rule('child-main'),
    rule('child-side', { gauge_station_id: 'station-side' }),
    // Standalone, at the same gauge: the user made it on its own, and the
    // editor shows it as separate. Not a duplicate of anything here.
    rule('standalone-main', { parent_subscription_id: null }),
    // A threshold at the main gauge is a different trigger from the river
    // alert's condition change.
    rule('child-main-threshold', {
      mode: 'threshold', metric: 'gauge_height_ft', comparator: 'above', threshold_value: 3,
      last_state: 'outside', last_condition_code: null,
    }),
  ];

  const parents = await loadParentAlerts(fake, [PARENT, 'parent-paused']);
  assert.deepEqual([...parents.paused], ['parent-paused']);
  assert.equal(parents.riverOf.get(PARENT), RIVER);
  const mainGauges = await loadMainGauges(fake, [RIVER]);
  assert.deepEqual([...mainGauges], [`${RIVER}:station-main`]);

  const plan = planGaugeAlerts({
    subscriptions: rules,
    readings: new Map([['station-main', reading('station-main', 3.2)], ['station-side', reading('station-side', 3.2)]]),
    ladders: new Map([
      [ladderKey(RIVER, 'station-main'), LADDER],
      [ladderKey(RIVER, 'station-side'), LADDER],
    ]),
    now: NOW,
  });
  // Every rule came true on this reading: low → flowing, or above 3 ft.
  assert.deepEqual(plan.fired.map((f) => f.subscription_id).sort(),
    ['child-main', 'child-main-threshold', 'child-side', 'standalone-main']);

  const covered = new Set(rules.filter((r) => coveredByMainGauge(r, parents.riverOf, mainGauges)).map((r) => r.id));
  assert.deepEqual([...covered], ['child-main']);

  const result = withoutCovered(plan, covered);
  assert.equal(result.covered, 1);
  assert.deepEqual(result.fired.map((f) => f.subscription_id).sort(),
    ['child-main-threshold', 'child-side', 'standalone-main']);

  // Its state still follows the water, without starting a cooldown: if the
  // primary flag ever moves back, it resumes from what the river is doing now.
  const state = result.stateUpdates.find((u) => u.id === 'child-main');
  assert.equal(state?.last_condition_code, 'flowing');
  assert.equal(state?.last_reading_at, FRESH);
  assert.equal('last_triggered_at' in (state ?? {}), false);
  // The others keep their cooldown stamp.
  assert.ok(result.stateUpdates.find((u) => u.id === 'child-side')?.last_triggered_at);
});

test('a parent this pass could not resolve suppresses nothing', () => {
  assert.equal(coveredByMainGauge(rule('child'), new Map(), new Set([`${RIVER}:station-main`])), false);
  assert.equal(coveredByMainGauge(rule('child'), new Map([[PARENT, RIVER]]), new Set()), false);
});

test('a failed main-gauge read suppresses nothing, and a failed parent read gates nothing', async () => {
  const fake = db().fail({ table: 'river_gauges', mode: 'select' }).fail({ table: 'alert_subscriptions', mode: 'select' });
  assert.equal((await loadMainGauges(fake, [RIVER])).size, 0);
  const parents = await loadParentAlerts(fake, [PARENT, 'parent-paused']);
  assert.equal(parents.paused.size, 0);
  assert.equal(parents.riverOf.size, 0);
});

test('with nothing covered the plan is unchanged', () => {
  const plan = { fired: [], stateUpdates: [], skipped: {} };
  assert.deepEqual(withoutCovered(plan, new Set()), { ...plan, covered: 0 });
});
