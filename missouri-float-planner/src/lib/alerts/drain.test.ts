import assert from 'node:assert/strict';
import test from 'node:test';
import { planDrain, type DrainInput } from './drain';

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
