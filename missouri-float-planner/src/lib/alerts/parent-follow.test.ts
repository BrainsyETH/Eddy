import assert from 'node:assert/strict';
import test from 'node:test';
import { planFollowerUpdates, wasFollowing, type FollowerCandidate } from './parent-follow';

// A river alert's covered gauges are drawn as part of it, so a change to its
// setting has to reach them — and must not reach a gauge that was given its own
// trigger on purpose. Both halves are a promise the Alerts tab makes on the
// river's row, so both are pinned here.

function child(over: Partial<FollowerCandidate> & Pick<FollowerCandidate, 'id'>): FollowerCandidate {
  return {
    mode: 'condition',
    condition_kind: 'floatable',
    one_shot: false,
    one_shot_fired_at: null,
    ...over,
  };
}

const parent = { kind: 'floatable' as const, one_shot: false };

test('a gauge on the river alert’s setting was following it', () => {
  assert.equal(wasFollowing(child({ id: 'a' }), parent), true);
  // A null kind is the column default, which means `all`.
  assert.equal(wasFollowing(child({ id: 'a', condition_kind: null }), { kind: 'all', one_shot: false }), true);
});

test('a gauge with its own trigger was not', () => {
  assert.equal(wasFollowing(child({ id: 'a', condition_kind: 'safety' }), parent), false);
  assert.equal(wasFollowing(child({ id: 'a', one_shot: true }), parent), false);
  assert.equal(wasFollowing(child({ id: 'a', mode: 'threshold', condition_kind: null }), parent), false);
});

test('changing the river alert’s kind moves the gauges that followed it', () => {
  // THE POINT. Without this, switching a river alert from floatable to high
  // water left every covered gauge firing on the trigger just replaced.
  const updates = planFollowerUpdates(parent, { kind: 'safety' }, [
    child({ id: 'follows' }),
    child({ id: 'own-kind', condition_kind: 'all' }),
  ]);
  assert.deepEqual(updates, [{ id: 'follows', update: { condition_kind: 'safety' } }]);
});

test('switching to one-time moves them too', () => {
  const updates = planFollowerUpdates(parent, { oneShot: true }, [child({ id: 'a' })]);
  assert.deepEqual(updates, [{ id: 'a', update: { one_shot: true } }]);
});

test('a pause or resume alone writes to no child', () => {
  // Pausing is a gate, not a cascade — ADR 0006. The route never calls this
  // for an `enabled`-only request, and an empty change must stay empty.
  assert.deepEqual(planFollowerUpdates(parent, {}, [child({ id: 'a' })]), []);
});

test('re-sending the stored setting changes nothing', () => {
  // The app's Save sends kind and oneShot whether or not they moved.
  assert.deepEqual(
    planFollowerUpdates(parent, { kind: 'floatable', oneShot: false }, [child({ id: 'a' })]),
    [],
  );
});

test('re-arming the river alert re-arms the spent gauges that follow it', () => {
  const oneTime = { kind: 'floatable' as const, one_shot: true };
  const updates = planFollowerUpdates(oneTime, { rearm: true }, [
    child({ id: 'spent', one_shot: true, one_shot_fired_at: '2026-11-01T00:00:00.000Z' }),
    child({ id: 'armed', one_shot: true }),
  ]);
  // The armed one needs nothing; the spent one gets both columns and its
  // switch back, because delivery turned it off when it spent.
  assert.deepEqual(updates, [
    {
      id: 'spent',
      update: { one_shot_fired_at: null, last_triggered_at: null, enabled: true },
    },
  ]);
});

test('a spent gauge comes back when the alert stops being one-time', () => {
  // Otherwise it is no longer a one-shot, still switched off by its spend, and
  // can never fire.
  const oneTime = { kind: 'floatable' as const, one_shot: true };
  const updates = planFollowerUpdates(oneTime, { oneShot: false }, [
    child({ id: 'spent', one_shot: true, one_shot_fired_at: '2026-11-01T00:00:00.000Z' }),
  ]);
  assert.deepEqual(updates, [
    {
      id: 'spent',
      update: {
        one_shot: false,
        one_shot_fired_at: null,
        last_triggered_at: null,
        enabled: true,
      },
    },
  ]);
});

test('a kind change never re-enables a gauge paused by hand', () => {
  const updates = planFollowerUpdates(parent, { kind: 'all' }, [child({ id: 'a' })]);
  assert.equal('enabled' in updates[0].update, false);
});
