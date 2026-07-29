import assert from 'node:assert/strict';
import test from 'node:test';
import { planDrain, spentOneShots, type DrainInput } from './drain';

const MAX = 5;

function drain(overrides: Partial<DrainInput> = {}) {
  return planDrain({
    events: [{ id: 'evt-1', attempts: 0 }],
    plannedByEvent: new Map([['evt-1', 2]]),
    successByEvent: new Map([['evt-1', 2]]),
    maxAttempts: MAX,
    ...overrides,
  });
}

// ── the bug this module exists to prevent ────────────────────────

test('an event whose every send failed is NOT drained', () => {
  // The regression: the cron used to stamp push_delivered_at on every event in
  // the pass regardless of outcome, so one totally failed pass lost the alert
  // permanently. Expo returns an error ticket per message on a whole-request
  // failure, so "all of them failed" is a real and reachable state.
  const result = drain({ successByEvent: new Map() });

  assert.deepEqual(result.delivered, []);
  assert.deepEqual(result.retryByNextAttempt.get(1), ['evt-1']);
  assert.equal(result.givenUp, 0);
});

test('one success is enough to consider the event delivered', () => {
  // Partial delivery is still delivery: the per-device ledger stops the
  // successful phones being notified twice, and re-running the event to chase
  // one broken token would re-notify everyone else.
  const result = drain({ successByEvent: new Map([['evt-1', 1]]) });
  assert.deepEqual(result.delivered, ['evt-1']);
});

test('an event with nothing to send is drained, not retried', () => {
  // No subscriber, everyone on cooldown, a spent one-shot. Retrying these would
  // refill the outbox every five minutes with events nobody ever wanted.
  const result = drain({ plannedByEvent: new Map(), successByEvent: new Map() });
  assert.deepEqual(result.delivered, ['evt-1']);
  assert.equal(result.retryByNextAttempt.size, 0);
});

// ── bounded retries ──────────────────────────────────────────────

test('retries stop at maxAttempts, and give up by DRAINING', () => {
  // Leaving it undelivered would strand it: the outbox query filters on
  // push_attempts < MAX_ATTEMPTS, so the row would never be selected again and
  // would sit behind the partial index forever.
  const result = drain({
    events: [{ id: 'evt-1', attempts: MAX - 1 }],
    successByEvent: new Map(),
  });

  assert.deepEqual(result.delivered, ['evt-1']);
  assert.equal(result.retryByNextAttempt.size, 0);
  assert.equal(result.givenUp, 1);
});

test('the last retry before the limit still happens', () => {
  const result = drain({
    events: [{ id: 'evt-1', attempts: MAX - 2 }],
    successByEvent: new Map(),
  });
  assert.deepEqual(result.retryByNextAttempt.get(MAX - 1), ['evt-1']);
  assert.equal(result.givenUp, 0);
});

// ── per-event, not per-pass ──────────────────────────────────────

test('a mixed pass drains only the events that actually landed', () => {
  const result = drain({
    events: [
      { id: 'ok', attempts: 0 },
      { id: 'failed', attempts: 2 },
      { id: 'nobody', attempts: 0 },
    ],
    plannedByEvent: new Map([
      ['ok', 1],
      ['failed', 3],
    ]),
    successByEvent: new Map([['ok', 1]]),
  });

  assert.deepEqual(result.delivered, ['ok', 'nobody']);
  assert.deepEqual(result.retryByNextAttempt.get(3), ['failed']);
});

test('retries are grouped by the value written, not one statement per event', () => {
  // The caller issues one UPDATE per group; PostgREST cannot do
  // `push_attempts = push_attempts + 1`, so a flat list would be one round trip
  // per event and a pass carries up to 200.
  const result = drain({
    events: [
      { id: 'a', attempts: 0 },
      { id: 'b', attempts: 0 },
      { id: 'c', attempts: 1 },
    ],
    plannedByEvent: new Map([
      ['a', 1],
      ['b', 1],
      ['c', 1],
    ]),
    successByEvent: new Map(),
  });

  assert.equal(result.retryByNextAttempt.size, 2);
  assert.deepEqual(result.retryByNextAttempt.get(1), ['a', 'b']);
  assert.deepEqual(result.retryByNextAttempt.get(2), ['c']);
});

// ── one-shots: planned is not delivered ──────────────────────────

test('a one-shot whose every send failed is NOT spent', () => {
  // The regression, and the reason this function exists. The cron stamped
  // fired_at on every one-shot the plan had merely produced messages for,
  // without looking at a single ticket. It compounds rather than losing one
  // push: the next pass then skips the subscription as one_shot_spent, which
  // leaves the event with nothing planned, which planDrain above correctly
  // reads as finished. The retry cancels itself and the alert is gone without
  // even reaching givenUp.
  assert.deepEqual(spentOneShots(['sub-1'], new Map()), []);
});

test('one success is enough to spend a one-shot', () => {
  // Matches planDrain's partial-delivery rule. A subscription fans out to every
  // device its owner registered, so reaching one of them has reached the
  // person, and re-arming to chase a second phone would notify them twice.
  assert.deepEqual(spentOneShots(['sub-1'], new Map([['sub-1', 1]])), ['sub-1']);
});

test('one subscription failing does not spare another that succeeded', () => {
  // Per-subscription, not per-pass. An aggregate "did anything send" check
  // would spend every one-shot in a pass where a single unrelated push landed.
  const success = new Map([
    ['ok', 2],
    ['dead', 0],
  ]);

  assert.deepEqual(spentOneShots(['ok', 'dead'], success), ['ok']);
});

test('success on a subscription that was not a one-shot candidate spends nothing', () => {
  // The tally counts every message in the pass, most of them from ordinary
  // repeating subscriptions. Only fanout decides what was a one-shot candidate;
  // this function narrows that list and must never widen it.
  assert.deepEqual(spentOneShots([], new Map([['repeating-sub', 3]])), []);
});
