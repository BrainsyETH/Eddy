import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PUSH_COOLDOWN_MS,
  planDeliveries,
  subscriptionKindsFor,
  type FanoutEvent,
  type FanoutSubscription,
  type FanoutToken,
  type PlanInput,
} from './fanout';
import type { EventKind } from './event-kind';
import type { NotificationPreferences } from '@/types/api';

const NOW = new Date('2026-07-25T12:00:00.000Z');
const RIVER = 'river-1';
const USER = 'user-1';

function event(kind: EventKind, overrides: Partial<FanoutEvent> = {}): FanoutEvent {
  return {
    id: `evt-${kind}`,
    river_id: RIVER,
    kind,
    old_condition_code: 'low',
    new_condition_code: kind === 'warning' ? 'dangerous' : 'good',
    river_name: 'Current River',
    river_slug: 'current',
    ...overrides,
  };
}

function sub(overrides: Partial<FanoutSubscription> = {}): FanoutSubscription {
  return {
    id: 'sub-1',
    user_id: USER,
    river_id: RIVER,
    kind: 'all',
    one_shot: false,
    fired_at: null,
    ...overrides,
  };
}

function token(overrides: Partial<FanoutToken> = {}): FanoutToken {
  return {
    id: 'tok-1',
    user_id: USER,
    expo_push_token: 'ExponentPushToken[aaa]',
    disabled_at: null,
    ...overrides,
  };
}

function plan(overrides: Partial<PlanInput> = {}) {
  return planDeliveries({
    events: [event('floatable')],
    subscriptions: [sub()],
    tokens: [token()],
    now: NOW,
    ...overrides,
  });
}

// ── kind mapping ─────────────────────────────────────────────────

test('maps event kinds onto the subscription vocabulary', () => {
  assert.deepEqual(subscriptionKindsFor('floatable'), ['floatable', 'all']);
  assert.deepEqual(subscriptionKindsFor('warning'), ['safety', 'all']);
  assert.deepEqual(subscriptionKindsFor('easing'), ['safety', 'all']);
  assert.deepEqual(subscriptionKindsFor('recovery'), [], 'all-clear is feed-only');
  assert.deepEqual(subscriptionKindsFor('info'), []);
});

test('a floatable subscription does not receive safety events, and vice versa', () => {
  const floatOnly = plan({
    events: [event('warning')],
    subscriptions: [sub({ kind: 'floatable' })],
  });
  assert.equal(floatOnly.messages.length, 0);

  const safetyOnly = plan({
    events: [event('floatable')],
    subscriptions: [sub({ kind: 'safety' })],
  });
  assert.equal(safetyOnly.messages.length, 0);
});

test('the "all" subscription catches both', () => {
  assert.equal(plan({ events: [event('floatable')] }).messages.length, 1);
  assert.equal(plan({ events: [event('warning')] }).messages.length, 1);
});

test('recovery and info are never pushed', () => {
  const result = plan({ events: [event('recovery'), event('info')] });
  assert.equal(result.messages.length, 0);
  assert.equal(result.skipped.not_pushable_kind, 2);
});

// ── no entitlement policy ────────────────────────────────────────

test('every pushable kind reaches a subscriber, paid or not', () => {
  // Alerting is free in its entirety. This replaces a pair of tests asserting
  // that `floatable` and `easing` required an entitlement while `warning` did
  // not — a split that made `warning` unreachable in practice, since the only
  // route that could create a subscription demanded payment for all three.
  for (const kind of ['floatable', 'warning', 'easing'] as const) {
    const result = plan({ events: [event(kind)] });
    assert.equal(result.messages.length, 1, `${kind} should reach the subscriber`);
  }
});

// ── one-shot ─────────────────────────────────────────────────────

test('a spent one-shot is not re-sent', () => {
  const result = plan({
    subscriptions: [sub({ one_shot: true, fired_at: '2026-07-20T00:00:00.000Z' })],
  });
  assert.equal(result.messages.length, 0);
  assert.equal(result.skipped.one_shot_spent, 1);
});

test('an unfired one-shot sends and is reported for stamping', () => {
  const result = plan({ subscriptions: [sub({ one_shot: true, fired_at: null })] });
  assert.equal(result.messages.length, 1);
  assert.deepEqual(result.oneShotSubscriptionIds, ['sub-1']);
});

test('a non-one-shot subscription is never stamped', () => {
  assert.deepEqual(plan().oneShotSubscriptionIds, []);
});

// ── cooldown ─────────────────────────────────────────────────────

test('suppresses a repeat for the same user, river and kind within the window', () => {
  const result = plan({
    recentDeliveries: [
      { user_id: USER, river_id: RIVER, kind: 'floatable', sent_at: '2026-07-25T10:00:00.000Z' },
    ],
  });
  assert.equal(result.messages.length, 0);
  assert.equal(result.skipped.cooldown, 1);
});

test('allows a send once the window has passed', () => {
  const longAgo = new Date(NOW.getTime() - PUSH_COOLDOWN_MS - 1000).toISOString();
  const result = plan({
    recentDeliveries: [{ user_id: USER, river_id: RIVER, kind: 'floatable', sent_at: longAgo }],
  });
  assert.equal(result.messages.length, 1);
});

test('a recent floatable never suppresses a safety warning', () => {
  // The cooldown is scoped per kind precisely so hazard alerts are not
  // swallowed by unrelated good news.
  const result = plan({
    events: [event('warning')],
    recentDeliveries: [
      { user_id: USER, river_id: RIVER, kind: 'floatable', sent_at: '2026-07-25T11:59:00.000Z' },
    ],
  });
  assert.equal(result.messages.length, 1);
});

test('two events of the same kind in one pass only notify once', () => {
  const result = plan({
    events: [event('floatable', { id: 'a' }), event('floatable', { id: 'b' })],
  });
  assert.equal(result.messages.length, 1);
  assert.equal(result.skipped.cooldown, 1);
});

// ── tokens ───────────────────────────────────────────────────────

test('disabled tokens are excluded', () => {
  const result = plan({ tokens: [token({ disabled_at: '2026-07-01T00:00:00.000Z' })] });
  assert.equal(result.messages.length, 0);
  assert.equal(result.skipped.no_active_token, 1);
});

test('a subscriber with no token is counted, not crashed on', () => {
  const result = plan({ tokens: [] });
  assert.equal(result.messages.length, 0);
  assert.equal(result.skipped.no_active_token, 1);
});

test('a user with several devices gets one message per device', () => {
  const result = plan({
    tokens: [token({ id: 'tok-1' }), token({ id: 'tok-2', expo_push_token: 'ExponentPushToken[bbb]' })],
  });
  assert.equal(result.messages.length, 2);
  assert.deepEqual(result.messages.map((m) => m.deviceTokenId).sort(), ['tok-1', 'tok-2']);
});

test('a subscription for another river is ignored', () => {
  const result = plan({ subscriptions: [sub({ river_id: 'other-river' })] });
  assert.equal(result.messages.length, 0);
  assert.equal(result.skipped.no_subscription, 1);
});

// ── ordering ─────────────────────────────────────────────────────

test('safety warnings are ordered ahead of floatable news', () => {
  const result = plan({
    events: [
      event('floatable', { id: 'f', river_id: RIVER }),
      event('warning', { id: 'w', river_id: 'river-2' }),
    ],
    subscriptions: [
      sub({ id: 's1', river_id: RIVER }),
      sub({ id: 's2', river_id: 'river-2' }),
    ],
  });
  assert.equal(result.messages.length, 2);
  assert.equal(result.messages[0].kind, 'warning', 'warning must go first');
});

// ── message content ──────────────────────────────────────────────

test('the notification names the river and carries routing data', () => {
  const [planned] = plan().messages;
  assert.match(planned.message.title ?? '', /Current River/);
  assert.equal(planned.message.data?.riverSlug, 'current');
  assert.equal(planned.message.data?.kind, 'floatable');
  assert.equal(planned.message.data?.eventId, 'evt-floatable');
});

test('warnings send at high priority and carry a verify-locally caveat', () => {
  const [planned] = plan({ events: [event('warning')] }).messages;
  assert.equal(planned.message.priority, 'high');
  assert.match(planned.message.body ?? '', /verify locally/i);
});

test('floatable copy avoids promising real-time accuracy', () => {
  // Alerts land ~20-75 min behind the real transition, so the copy must not
  // imply "right now".
  const [planned] = plan().messages;
  assert.match(planned.message.body ?? '', /check the latest reading/i);
});

// ── Naming the gauge that moved ─────────────────────────────────────────────
//
// river_condition_events has always stored river_gauge_id, reading_value and
// reading_unit; nothing read them, so an alert said "the Current River is
// running high" and gave the recipient no way to check it. On a river whose
// pairings disagree — the Jacks Fork reads floatable at one gauge and too low
// at another — "which one" decides whether the alert is actionable.

test('a river alert names the gauge and the reading that moved', () => {
  const [planned] = plan({
    events: [
      event('warning', {
        gauge_name: 'Black River at Poplar Bluff',
        reading_value: 3100.4,
        reading_unit: 'cfs',
      }),
    ],
  }).messages;
  assert.match(planned.message.body ?? '', /3,100 cfs at Black River at Poplar Bluff/);
  // The safety caveat is not displaced by the enrichment.
  assert.match(planned.message.body ?? '', /verify locally/i);
});

test('feet keep one decimal, cfs is whole and thousands-separated', () => {
  const [feet] = plan({
    events: [event('warning', { gauge_name: 'G', reading_value: 7.82, reading_unit: 'ft' })],
  }).messages;
  assert.match(feet.message.body ?? '', /7\.8 ft at G/);

  const [cfs] = plan({
    events: [event('warning', { gauge_name: 'G', reading_value: 14293.6, reading_unit: 'cfs' })],
  }).messages;
  assert.match(cfs.message.body ?? '', /14,294 cfs at G/);
});

test('a partial reading is omitted entirely rather than half-stated', () => {
  // A gauge with no number invites the reader to assume one; a number with no
  // gauge is the ambiguity this was added to remove. Neither ships.
  for (const partial of [
    { gauge_name: 'G', reading_value: null, reading_unit: 'cfs' },
    { gauge_name: null, reading_value: 900, reading_unit: 'cfs' },
    { gauge_name: 'G', reading_value: 900, reading_unit: null },
  ]) {
    const [planned] = plan({ events: [event('warning', partial)] }).messages;
    assert.doesNotMatch(planned.message.body ?? '', / at /);
  }
});

test('an event with no gauge is still delivered', () => {
  // The gauge is enrichment. Dropping a dangerous-water push for want of a
  // pairing would be the worst possible way to save a line of copy.
  const planned = plan({ events: [event('warning')] });
  assert.equal(planned.messages.length, 1);
});

// ── quiet hours ──────────────────────────────────────────────────
//
// This pass ignored them completely until the preferences map existed: the
// gauge pass suppressed, the river pass — every "Eddy's call" subscription,
// which is most of what anybody has — did not, so a user who set a window was
// still woken by the alerts that setting most obviously governs.

/** 10pm–7am Central, the app's own default window. */
function quiet(overrides: Partial<NotificationPreferences> = {}): Map<string, NotificationPreferences> {
  return new Map([
    [
      USER,
      {
        quietHoursEnabled: true,
        quietStartMinute: 22 * 60,
        quietEndMinute: 7 * 60,
        timezone: 'America/Chicago',
        safetyOverridesQuiet: true,
        ...overrides,
      },
    ],
  ]);
}

// 07:00Z is 02:00 in Chicago — inside the window. NOW (12:00Z) is 07:00, outside.
const NIGHT = new Date('2026-07-25T07:00:00.000Z');

test('a floatable push is suppressed inside the quiet window', () => {
  const planned = plan({ now: NIGHT, preferences: quiet() });
  assert.equal(planned.messages.length, 0);
  assert.equal(planned.skipped.quiet_hours, 1);
});

test('the same push goes out once the window has passed', () => {
  assert.equal(plan({ preferences: quiet() }).messages.length, 1);
});

test('a warning breaks through, unless the user turned that off', () => {
  const through = plan({ events: [event('warning')], now: NIGHT, preferences: quiet() });
  assert.equal(through.messages.length, 1, 'safety overrides quiet by default');

  const silenced = plan({
    events: [event('warning')],
    now: NIGHT,
    preferences: quiet({ safetyOverridesQuiet: false }),
  });
  assert.equal(silenced.messages.length, 0);
});

test('a user with no preferences row is never treated as quiet', () => {
  // The common case by a wide margin. Defaulting the other way would silence
  // everybody who has never opened the settings screen.
  assert.equal(plan({ now: NIGHT }).messages.length, 1);
  assert.equal(plan({ now: NIGHT, preferences: new Map() }).messages.length, 1);
});

test('a suppressed push does not consume the cooldown', () => {
  // Otherwise the 4h window would be eaten by a notification nobody was sent,
  // and the next transition after the window closed would be skipped too.
  const planned = plan({ now: NIGHT, preferences: quiet() });
  assert.equal(planned.messages.length, 0);

  const after = planDeliveries({
    events: [event('floatable')],
    subscriptions: [sub()],
    tokens: [token()],
    preferences: quiet(),
    // 07:30 Chicago, half an hour after the window closed.
    now: new Date('2026-07-25T12:30:00.000Z'),
    recentDeliveries: [],
  });
  assert.equal(after.messages.length, 1);
});

test('one subscriber being quiet does not suppress another', () => {
  const planned = plan({
    now: NIGHT,
    subscriptions: [sub(), sub({ id: 'sub-2', user_id: 'user-2' })],
    tokens: [token(), token({ id: 'tok-2', user_id: 'user-2' })],
    preferences: quiet(),
  });
  assert.equal(planned.messages.length, 1);
  assert.equal(planned.messages[0].userId, 'user-2');
});
