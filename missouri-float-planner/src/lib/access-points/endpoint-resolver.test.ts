// src/lib/access-points/endpoint-resolver.test.ts
// The one gate every route-building entry point goes through.
//
// Four of these cases are regressions of real defects this module was written
// to close, and they are named as such: /api/plan resolved endpoints without a
// river filter, /api/shuttle without an approved filter, /api/plan/save without
// any check at all, and the first version of this file answered a database
// outage with 404.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyEndpoints,
  endpointFailureStatus,
  resolveFloatEndpoints,
  type EndpointRow,
} from './endpoint-resolver';

const RIVER = 'river-current';
const OTHER_RIVER = 'river-jacks-fork';

function row(overrides: Partial<EndpointRow> & { id: string }): EndpointRow {
  return {
    river_id: RIVER,
    approved: true,
    is_float_endpoint: true,
    ...overrides,
  };
}

const putIn = row({ id: 'baptist-camp' });
const takeOut = row({ id: 'cedargrove' });
const ask = { riverId: RIVER, putInId: 'baptist-camp', takeOutId: 'cedargrove' };

test('two approved endpoints on the asked-for river resolve', () => {
  const result = classifyEndpoints([putIn, takeOut], ask);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.putIn.id, 'baptist-camp');
  assert.equal(result.takeOut.id, 'cedargrove');
});

test('a missing id is not-found', () => {
  const result = classifyEndpoints([putIn], ask);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, 'not-found');
  assert.match(result.detail, /take-out/);
});

test('an unapproved point is refused as not-approved, not as missing', () => {
  const result = classifyEndpoints([putIn, row({ id: 'cedargrove', approved: false })], ask);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, 'not-approved');
});

test('a non-endpoint is refused — the Montauk case', () => {
  // Approved, real, has a page and a pin. Still not a launch.
  const result = classifyEndpoints(
    [row({ id: 'baptist-camp', is_float_endpoint: false }), takeOut],
    ask,
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, 'not-an-endpoint');
  assert.match(result.detail, /put-in/);
});

test('two points on different rivers are refused', () => {
  // /api/plan accepted this until the resolver existed: riverId was resolved a
  // few lines above the query and never applied to it.
  const result = classifyEndpoints([putIn, row({ id: 'cedargrove', river_id: OTHER_RIVER })], ask);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, 'wrong-river');
});

test('riverId null skips the river check but nothing else', () => {
  // /api/shuttle and /api/og/float have no river in hand. They compare the two
  // points to each other instead; eligibility still applies here.
  const anyRiver = { riverId: null, putInId: 'baptist-camp', takeOutId: 'cedargrove' };
  assert.equal(
    classifyEndpoints([putIn, row({ id: 'cedargrove', river_id: OTHER_RIVER })], anyRiver).ok,
    true,
  );
  const stillRefused = classifyEndpoints(
    [putIn, row({ id: 'cedargrove', is_float_endpoint: false })],
    anyRiver,
  );
  assert.equal(stillRefused.ok, false);
  if (stillRefused.ok) return;
  assert.equal(stillRefused.reason, 'not-an-endpoint');
});

test('the same point at both ends is not a float', () => {
  const result = classifyEndpoints([putIn], {
    riverId: RIVER,
    putInId: 'baptist-camp',
    takeOutId: 'baptist-camp',
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, 'same-point');
});

test('a non-launch reads as a non-launch even when the river also mismatches', () => {
  // Order matters for the message the caller shows: "that is not a launch" is
  // actionable, "that is not on this river" about a park is confusing.
  const result = classifyEndpoints(
    [putIn, row({ id: 'cedargrove', is_float_endpoint: false, river_id: OTHER_RIVER })],
    ask,
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, 'not-an-endpoint');
});

test('a failed read is 500, and a clean miss is 404', () => {
  // The regression this guards: folding the error branch into `not-found` told
  // callers "no such access point" during an outage — a 4xx for a 5xx, so the
  // client did not retry and the incident stayed invisible in the error rate.
  assert.equal(endpointFailureStatus('read-failed'), 500);
  assert.equal(endpointFailureStatus('not-found'), 404);
  assert.equal(endpointFailureStatus('not-approved'), 400);
  assert.equal(endpointFailureStatus('not-an-endpoint'), 400);
  assert.equal(endpointFailureStatus('wrong-river'), 400);
  assert.equal(endpointFailureStatus('same-point'), 400);
});

/** Minimal stand-in for the one read this module performs. */
function fakeClient(result: { data: unknown; error: unknown }) {
  return {
    from: () => ({ select: () => ({ in: () => Promise.resolve(result) }) }),
  } as never;
}

test('a database error surfaces as read-failed, never as a missing access point', async () => {
  const result = await resolveFloatEndpoints(
    fakeClient({ data: null, error: { message: 'connection refused' } }),
    ask,
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, 'read-failed');
  assert.equal(endpointFailureStatus(result.reason), 500);
});

test('a successful read that returns nothing is still not-found', async () => {
  const result = await resolveFloatEndpoints(fakeClient({ data: [], error: null }), ask);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, 'not-found');
  assert.equal(endpointFailureStatus(result.reason), 404);
});

test('a caller cannot project away the columns it is checked on', async () => {
  // `columns` is the caller's projection; the four this decision needs are
  // appended so no caller can opt out of being checked by asking for less.
  let asked = '';
  const client = {
    from: () => ({
      select: (cols: string) => {
        asked = cols;
        return { in: () => Promise.resolve({ data: [putIn, takeOut], error: null }) };
      },
    }),
  } as never;

  await resolveFloatEndpoints(client, { ...ask, columns: 'id, name' });
  for (const required of ['id', 'river_id', 'approved', 'is_float_endpoint']) {
    assert.ok(asked.includes(required), `projection is missing ${required}: ${asked}`);
  }
  assert.ok(asked.includes('name'), 'the caller’s own columns are still requested');
});
