import assert from 'node:assert/strict';
import test from 'node:test';
import { planRearm, REARMED_RULE_STATE, type SuppressedEvent } from './quiet-hours-rearm';
import type { NotificationPreferences } from '@/types/api';

// 22:00–07:00 Central, the default window the app offers.
const CENTRAL_NIGHT: NotificationPreferences = {
  quietHoursEnabled: true,
  quietStartMinute: 22 * 60,
  quietEndMinute: 7 * 60,
  timezone: 'America/Chicago',
  safetyOverridesQuiet: true,
};

// September, no DST edge: 08:00 Central is 13:00Z; 03:00 Central is 08:00Z.
const MORNING = new Date('2026-09-05T13:00:00Z');
const SMALL_HOURS = new Date('2026-09-05T08:00:00Z');

const event = (over: Partial<SuppressedEvent> = {}): SuppressedEvent => ({
  id: 'evt-1',
  subscriptionId: 'sub-1',
  userId: 'user-1',
  mode: 'threshold',
  ...over,
});

test('a threshold rule is re-armed once its user is out of the window', () => {
  const plan = planRearm([event()], new Map([['user-1', CENTRAL_NIGHT]]), MORNING);
  assert.deepEqual(plan.subscriptionIds, ['sub-1']);
  assert.deepEqual(plan.eventIds, ['evt-1']);
});

test('nothing moves while the window is still in force', () => {
  const plan = planRearm([event()], new Map([['user-1', CENTRAL_NIGHT]]), SMALL_HOURS);
  assert.deepEqual(plan.subscriptionIds, []);
  assert.deepEqual(plan.eventIds, []);
});

test('a user who has since turned quiet hours off is resolved immediately', () => {
  // A null preferences row is "never quiet" — the same rule isQuietAt applies —
  // so a suppressed event left over from before the setting was cleared does
  // not wait for a window that no longer exists.
  const plan = planRearm([event()], new Map(), SMALL_HOURS);
  assert.deepEqual(plan.subscriptionIds, ['sub-1']);
  assert.deepEqual(plan.eventIds, ['evt-1']);
});

test('condition rules are stamped but never re-armed', () => {
  // Their previous verdict is not stored, so there is nothing to put back; and
  // a floatable call from the night should not be re-issued off the same look.
  const plan = planRearm(
    [event({ id: 'evt-c', subscriptionId: 'sub-c', mode: 'condition' })],
    new Map([['user-1', CENTRAL_NIGHT]]),
    MORNING,
  );
  assert.deepEqual(plan.subscriptionIds, []);
  assert.deepEqual(plan.eventIds, ['evt-c']);
});

test('one rule suppressed several times through the night is re-armed once', () => {
  const plan = planRearm(
    [event({ id: 'a' }), event({ id: 'b' }), event({ id: 'c' })],
    new Map([['user-1', CENTRAL_NIGHT]]),
    MORNING,
  );
  assert.deepEqual(plan.subscriptionIds, ['sub-1']);
  assert.deepEqual(plan.eventIds, ['a', 'b', 'c']);
});

test("users are judged on their own windows, not each other's", () => {
  const denver: NotificationPreferences = { ...CENTRAL_NIGHT, timezone: 'America/Denver' };
  // 13:00Z is 08:00 Central (window over) and 07:00 Mountain (window just over
  // too); 12:30Z is 07:30 Central (over) but 06:30 Mountain (still quiet).
  const plan = planRearm(
    [event({ id: 'c', userId: 'central' }), event({ id: 'd', userId: 'denver', subscriptionId: 'sub-d' })],
    new Map([
      ['central', CENTRAL_NIGHT],
      ['denver', denver],
    ]),
    new Date('2026-09-05T12:30:00Z'),
  );
  assert.deepEqual(plan.eventIds, ['c']);
  assert.deepEqual(plan.subscriptionIds, ['sub-1']);
});

test('re-arming clears the cooldown and the last-reading stamp, and sets the far side', () => {
  // last_triggered_at was stamped at the suppressed evaluation; left in place,
  // the six-hour cooldown would swallow the morning crossing. last_reading_at
  // left in place would make the next pass skip the reading it already holds.
  assert.deepEqual(REARMED_RULE_STATE, {
    last_state: 'outside',
    last_triggered_at: null,
    last_reading_at: null,
  });
});
