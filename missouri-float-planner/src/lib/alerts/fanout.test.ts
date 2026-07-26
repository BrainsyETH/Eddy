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
    entitledUserIds: new Set([USER]),
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

// ── entitlement policy ───────────────────────────────────────────

test('safety warnings reach users with no entitlement', () => {
  // Hazard information is never paywalled.
  const result = plan({ events: [event('warning')], entitledUserIds: new Set() });
  assert.equal(result.messages.length, 1);
});

test('floatable and easing require an entitlement', () => {
  const floatable = plan({ events: [event('floatable')], entitledUserIds: new Set() });
  assert.equal(floatable.messages.length, 0);
  assert.equal(floatable.skipped.not_entitled, 1);

  const easing = plan({ events: [event('easing')], entitledUserIds: new Set() });
  assert.equal(easing.messages.length, 0);
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
