import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateSubscription,
  ladderKey,
  nextCrossingState,
  planGaugeAlerts,
  thresholdState,
  buildGaugeNotification,
  type GaugeAlertSubscription,
  type LadderRow,
  type StationReading,
} from './gauge-threshold';
// Moved out of gauge-threshold so the river delivery pass can reach them too.
import { isQuietAt, suppressedByQuietHours } from './quiet-hours';
import type { NotificationPreferences } from '@/types/api';

const NOW = new Date('2026-07-28T18:00:00Z');
const FRESH = '2026-07-28T17:45:00Z';

function sub(overrides: Partial<GaugeAlertSubscription> = {}): GaugeAlertSubscription {
  return {
    id: 'sub-1',
    user_id: 'user-1',
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
    last_reading_at: '2026-07-28T16:45:00Z',
    last_triggered_at: null,
    one_shot_fired_at: null,
    last_condition_code: null,
    ...overrides,
  };
}

function reading(overrides: Partial<StationReading> = {}): StationReading {
  return {
    gauge_station_id: 'station-1',
    gauge_height_ft: 3.4,
    discharge_cfs: 480,
    qualifiers: ['P'],
    reading_at: FRESH,
    provider: 'usgs',
    ...overrides,
  };
}

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

function evaluate(s = sub(), r: StationReading | undefined = reading(), ladder: LadderRow | null = null) {
  return evaluateSubscription({ sub: s, reading: r, ladder, now: NOW });
}

// ── edge triggering: the whole reason last_state exists ──────────

test('fires once on the crossing, and stays silent while the water holds', () => {
  const first = evaluate();
  assert.equal(first.skip, null);
  assert.equal(first.fired?.kind, 'threshold');
  assert.equal(first.fired?.reading_value, 3.4);
  assert.equal(first.state?.last_state, 'inside');
  assert.ok(first.state?.last_triggered_at);

  // The next pass carries the state the first one wrote. Without the edge
  // trigger this is where a river that came up on Friday starts notifying
  // every fifteen minutes until it drops.
  const second = evaluateSubscription({
    sub: sub({ last_state: 'inside', last_reading_at: FRESH, last_triggered_at: NOW.toISOString() }),
    reading: reading({ gauge_height_ft: 3.9, reading_at: '2026-07-28T17:55:00Z' }),
    ladder: null,
    now: NOW,
  });
  assert.equal(second.fired, null);
  assert.equal(second.skip, 'no_crossing');
});

test('a rule with no seeded state records its side instead of firing', () => {
  // The POST route seeds last_state, so this is a row written some other way.
  // Firing here would notify about water the rule has never seen move.
  const result = evaluate(sub({ last_state: null }));
  assert.equal(result.fired, null);
  assert.equal(result.skip, 'seeding');
  assert.equal(result.state?.last_state, 'inside');
});

test('an unchanged reading is not re-evaluated', () => {
  // The national tier refreshes hourly while this cron runs every 15 minutes,
  // so seeing the same row four times running is the ordinary case.
  const result = evaluate(sub({ last_reading_at: FRESH }));
  assert.equal(result.skip, 'no_new_reading');
  assert.equal(result.state, null);
});

// ── hysteresis ───────────────────────────────────────────────────

test('re-arming needs the reading to clear the boundary by the band', () => {
  const inside = sub({ last_state: 'inside' });

  // 2.99 is below the 3.0 threshold but well inside sensor noise. Treating this
  // as "left the band" is what lets a gauge parked at 3.00 fire on every pass.
  assert.equal(nextCrossingState(inside, 2.99), 'inside');
  // 2.94 clears max(3 * 2%, 0.05) = 0.06.
  assert.equal(nextCrossingState(inside, 2.93), 'outside');

  // Arming is deliberately NOT damped — the user asked to be told on the cross.
  assert.equal(nextCrossingState(sub({ last_state: 'outside' }), 3.01), 'inside');
});

test('the hysteresis floor scales with the unit', () => {
  // 2% of 12,000 cfs is 240; the 0.05 floor that protects a foot reading is
  // meaningless here, and 1 cfs would be meaningless at 12,000.
  const cfs = sub({ metric: 'discharge_cfs', comparator: 'above', threshold_value: 12000, last_state: 'inside' });
  assert.equal(nextCrossingState(cfs, 11900), 'inside');
  assert.equal(nextCrossingState(cfs, 11700), 'outside');
});

// ── comparators ──────────────────────────────────────────────────

test('thresholdState covers above, below and between', () => {
  assert.equal(thresholdState({ comparator: 'above', threshold_value: 3, threshold_value_max: null }, 3.1), 'inside');
  assert.equal(thresholdState({ comparator: 'above', threshold_value: 3, threshold_value_max: null }, 3), 'outside');
  assert.equal(thresholdState({ comparator: 'below', threshold_value: 3, threshold_value_max: null }, 2.9), 'inside');
  assert.equal(thresholdState({ comparator: 'below', threshold_value: 3, threshold_value_max: null }, 3), 'outside');

  const between = { comparator: 'between' as const, threshold_value: 2, threshold_value_max: 4 };
  assert.equal(thresholdState(between, 2), 'inside');
  assert.equal(thresholdState(between, 4), 'inside');
  assert.equal(thresholdState(between, 4.1), 'outside');
  assert.equal(thresholdState(between, 1.9), 'outside');
});

test('a between rule re-arms off either end, with a band sized per end', () => {
  const inside = sub({ comparator: 'between', threshold_value: 2, threshold_value_max: 4, last_state: 'inside' });
  // Each bound gets its own band — max(2 * 2%, 0.05) = 0.05 at the bottom,
  // max(4 * 2%, 0.05) = 0.08 at the top. Sharing one band would make the wider
  // end easier to trip out of than the arithmetic says.
  assert.equal(nextCrossingState(inside, 3), 'inside');
  assert.equal(nextCrossingState(inside, 1.96), 'inside'); // out of range, inside the band
  assert.equal(nextCrossingState(inside, 1.94), 'outside');
  assert.equal(nextCrossingState(inside, 4.05), 'inside');
  assert.equal(nextCrossingState(inside, 4.09), 'outside');
});

// ── suppression ──────────────────────────────────────────────────

test('a spent one-shot stays spent, but still tracks the river', () => {
  const result = evaluate(sub({ one_shot: true, one_shot_fired_at: '2026-01-01T00:00:00Z' }));
  assert.equal(result.fired, null);
  assert.equal(result.skip, 'one_shot_spent');
  // The state must still advance. A suppressed rule that stopped tracking would
  // come out of its silence still believing the water was where it left it.
  assert.equal(result.state?.last_state, 'inside');
});

test('a one-shot whose push never landed is still armed', () => {
  // THE regression. last_triggered_at is stamped HERE, at evaluation, two crons
  // before anything is delivered — so reading it as the spend meant a rule was
  // consumed by a notification that failed every attempt or was dropped by
  // quiet hours. The user's single shot at "tell me when the Current comes
  // down" was burned by a push they never saw, with nothing to show it had
  // happened. Only delivery spends a one-shot now.
  //
  // last_triggered_at is set here to a time outside the cooldown so that this
  // asserts the one-shot rule specifically and not the cooldown.
  const longAgo = '2020-01-01T00:00:00Z';
  const result = evaluate(
    sub({ one_shot: true, last_triggered_at: longAgo, one_shot_fired_at: null }),
  );
  assert.equal(result.skip, null);
  assert.ok(result.fired, 'an undelivered one-shot must be free to fire again');
});

test('evaluation still stamps last_triggered_at, because the cooldown depends on it', () => {
  // Moving this stamp to delivery would delay the cooldown by two crons, and a
  // gauge sitting on a threshold could re-fire before its first push landed —
  // turning a missed notification into a duplicate storm.
  const result = evaluate(sub({ one_shot: true }));
  assert.ok(result.fired);
  assert.ok(result.state?.last_triggered_at, 'the cooldown clock must start at evaluation');
});

test('the per-rule cooldown suppresses a second crossing', () => {
  const recent = new Date(NOW.getTime() - 60 * 60 * 1000).toISOString();
  const result = evaluate(sub({ last_triggered_at: recent }));
  assert.equal(result.skip, 'cooldown');
  assert.equal(result.state?.last_state, 'inside');

  const old = new Date(NOW.getTime() - 7 * 60 * 60 * 1000).toISOString();
  assert.equal(evaluate(sub({ last_triggered_at: old })).skip, null);
});

test('a disabled rule is not evaluated at all', () => {
  assert.equal(evaluate(sub({ enabled: false })).skip, 'disabled');
});

// ── the gate ─────────────────────────────────────────────────────

test('a suspect or stale reading never moves state', () => {
  // Ice-affected. Letting this through is how a stuck sensor manufactures an
  // alert; the gate is shared with the river path for exactly this reason.
  const iced = evaluate(sub(), reading({ qualifiers: ['P', 'Ice'] }));
  assert.equal(iced.skip, 'gated');
  assert.equal(iced.state, null);

  const stale = evaluate(sub(), reading({ reading_at: '2026-07-28T09:00:00Z' }));
  assert.equal(stale.skip, 'gated');
});

test('a cfs rule is not satisfied by a stage reading', () => {
  // The cross-unit fallback is the bug: 3.4 ft would sail past a 500 cfs
  // threshold if the metric were inferred rather than declared.
  const cfsRule = sub({ metric: 'discharge_cfs', threshold_value: 500 });
  const noDischarge = evaluate(cfsRule, reading({ discharge_cfs: null }));
  assert.equal(noDischarge.skip, 'gated');

  const withDischarge = evaluate(cfsRule, reading({ discharge_cfs: 640 }));
  assert.equal(withDischarge.skip, null);
  assert.equal(withDischarge.fired?.reading_unit, 'cfs');
  assert.equal(withDischarge.fired?.reading_value, 640);
});

// ── condition mode ───────────────────────────────────────────────

function conditionSub(overrides: Partial<GaugeAlertSubscription> = {}) {
  return sub({
    mode: 'condition',
    condition_kind: 'all',
    metric: null,
    comparator: null,
    threshold_value: null,
    river_id: 'river-1',
    last_state: null,
    last_condition_code: 'low',
    ...overrides,
  });
}

test('condition mode grades against the ladder and classifies the transition', () => {
  // 3.4 ft sits in the optimal band → flowing. low → flowing is the floatable
  // moment the whole funnel is named for.
  const result = evaluate(conditionSub(), reading(), LADDER);
  assert.equal(result.skip, null);
  assert.equal(result.fired?.kind, 'floatable');
  assert.equal(result.fired?.condition_code, 'flowing');
  assert.equal(result.state?.last_condition_code, 'flowing');
});

test('condition mode records its first verdict without announcing it', () => {
  // "unknown → good" is initialization, not news — the same rule the river
  // outbox applies.
  const result = evaluate(conditionSub({ last_condition_code: null }), reading(), LADDER);
  assert.equal(result.fired, null);
  assert.equal(result.skip, 'seeding');
  assert.equal(result.state?.last_condition_code, 'flowing');
});

test('a floatable-only rule ignores a warning, and a safety rule takes it', () => {
  const dangerous = reading({ gauge_height_ft: 7.5 });

  const floatableOnly = evaluate(
    conditionSub({ condition_kind: 'floatable' }),
    dangerous,
    LADDER,
  );
  assert.equal(floatableOnly.fired, null);
  assert.equal(floatableOnly.skip, 'kind_not_wanted');

  const safety = evaluate(conditionSub({ condition_kind: 'safety' }), dangerous, LADDER);
  assert.equal(safety.fired?.kind, 'warning');
  assert.equal(safety.fired?.condition_code, 'dangerous');
});

test('a recovery is recorded but never pushed', () => {
  // dangerous → flowing. The all-clear was deliberately removed from the push
  // path; it still has to advance the stored code or the next real warning
  // would classify from a code four hours out of date.
  const result = evaluate(conditionSub({ last_condition_code: 'dangerous' }), reading(), LADDER);
  assert.equal(result.fired, null);
  assert.equal(result.skip, 'not_pushable_kind');
  assert.equal(result.state?.last_condition_code, 'flowing');
});

test('condition mode on an unrated station is a no-op, not an error', () => {
  // The national tier's permanent state: 16,500 stations wired to no river.
  assert.equal(evaluate(conditionSub(), reading(), null).skip, 'no_ladder');
});

// ── quiet hours ──────────────────────────────────────────────────

function prefs(overrides: Partial<NotificationPreferences> = {}): NotificationPreferences {
  return {
    quietHoursEnabled: true,
    quietStartMinute: 22 * 60,
    quietEndMinute: 7 * 60,
    timezone: 'America/Chicago',
    safetyOverridesQuiet: true,
    ...overrides,
  };
}

test('an overnight window wraps across midnight', () => {
  // 03:00 Chicago is 08:00Z in July (CDT). The wrap-around case is the ONLY one
  // anybody actually sets, and a naive BETWEEN returns false for all of it.
  assert.equal(isQuietAt(prefs(), new Date('2026-07-28T08:00:00Z')), true);
  // 18:00 Chicago — awake.
  assert.equal(isQuietAt(prefs(), new Date('2026-07-28T23:00:00Z')), false);
  // 07:00 exactly: the window is half-open, so this is already morning.
  assert.equal(isQuietAt(prefs(), new Date('2026-07-28T12:00:00Z')), false);
});

test('quiet hours fail OPEN on a bad timezone', () => {
  // An unwanted 3am buzz beats a silenced danger alert.
  assert.equal(isQuietAt(prefs({ timezone: 'Not/AZone' }), new Date('2026-07-28T08:00:00Z')), false);
});

test('a zero-length window is not "always quiet"', () => {
  const zero = prefs({ quietStartMinute: 480, quietEndMinute: 480 });
  assert.equal(isQuietAt(zero, new Date('2026-07-28T13:00:00Z')), false);
});

test('warnings break through quiet hours; everything else is dropped', () => {
  const night = new Date('2026-07-28T08:00:00Z');
  assert.equal(suppressedByQuietHours(prefs(), 'threshold', night), true);
  assert.equal(suppressedByQuietHours(prefs(), 'floatable', night), true);
  assert.equal(suppressedByQuietHours(prefs(), 'warning', night), false);
  // Easing is good news about bad water — it can wait until morning.
  assert.equal(suppressedByQuietHours(prefs(), 'easing', night), true);
  // Opted out of the breakthrough.
  assert.equal(suppressedByQuietHours(prefs({ safetyOverridesQuiet: false }), 'warning', night), true);
  // Nothing set: never suppressed.
  assert.equal(suppressedByQuietHours(null, 'threshold', night), false);
});

// ── plan + copy ──────────────────────────────────────────────────

test('planGaugeAlerts tallies every rule exactly once', () => {
  const plan = planGaugeAlerts({
    subscriptions: [
      sub({ id: 'a' }),
      sub({ id: 'b', enabled: false }),
      sub({ id: 'c', gauge_station_id: 'missing' }),
      conditionSub({ id: 'd', last_condition_code: null }),
    ],
    readings: new Map([['station-1', reading()]]),
    ladders: new Map([[ladderKey('river-1', 'station-1'), LADDER]]),
    now: NOW,
  });

  assert.deepEqual(plan.fired.map((f) => f.subscription_id), ['a']);
  assert.equal(plan.skipped.disabled, 1);
  assert.equal(plan.skipped.no_reading, 1);
  assert.equal(plan.skipped.seeding, 1);
  // 'a' fired and 'd' seeded; the disabled and reading-less rules write nothing.
  assert.equal(plan.stateUpdates.length, 2);
});

test('the notification reads the rule back so it explains itself', () => {
  const note = buildGaugeNotification({
    stationName: 'Huzzah Creek near Steelville, MO',
    riverName: 'Huzzah Creek',
    kind: 'threshold',
    readingValue: 3.4,
    readingUnit: 'ft',
    conditionCode: null,
    rule: {
      mode: 'threshold',
      conditionKind: null,
      metric: 'gauge_height_ft',
      comparator: 'above',
      thresholdValue: 3,
      thresholdValueMax: null,
    },
  });

  assert.equal(note.title, 'Huzzah Creek is at 3.40 ft');
  // Someone with several alerts on one river cannot otherwise tell which fired.
  assert.match(note.body, /rises above 3\.00 ft/);
});

test('the national tier falls back to the station name', () => {
  const note = buildGaugeNotification({
    stationName: 'SF PAYETTE R AT LOWMAN ID',
    riverName: null,
    kind: 'threshold',
    readingValue: 1240,
    readingUnit: 'cfs',
    conditionCode: null,
    rule: {
      mode: 'threshold',
      conditionKind: null,
      metric: 'discharge_cfs',
      comparator: 'above',
      thresholdValue: 1000,
      thresholdValueMax: null,
    },
  });
  assert.equal(note.title, 'SF PAYETTE R AT LOWMAN ID is at 1,240 cfs');
});
