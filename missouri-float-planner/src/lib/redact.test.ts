import assert from 'node:assert/strict';
import test from 'node:test';
import { redactText as webRedact } from './monitoring/webhook-reporter';
import {
  redactText as appRedact,
  redactValue,
  redactContext,
  isContextBag,
} from '../../../eddy-ios/src/lib/redact';

// ── why this file exists ─────────────────────────────────────────
//
// The iOS app cannot import webhook-reporter.ts: it pulls in @/lib/logger, a
// Next-only path alias Metro cannot resolve. So the redaction table is written
// twice, and a table that drifts fails SILENTLY in the direction where a token
// ships to a third party. Same arrangement, and same reason, as
// entitlement-id.test.ts.
//
// The corpus below is the contract. Adding a pattern to one table and not the
// other fails here rather than in a Sentry event nobody reads.

const CORPUS = [
  'contact evan@eddy.guide about this',
  'Authorization: Bearer sk_live_abcdef0123456789.token~value',
  'session id 0123456789abcdef0123456789abcdef0123456789',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NSJ9.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk',
  'api_key: pk_test_notreal',
  'password="hunter2"',
  'token=abc123def456',
  'at 37.15412, -91.56231 when it threw',
  'gauge read 3.40, 2.80 at the time',
  'no secrets in this one at all',
  '',
];

test('the app and web redaction tables agree on every case in the corpus', () => {
  // The whole point. If someone tightens one table, this names the input that
  // stopped matching rather than leaving the app the weaker of the two.
  for (const input of CORPUS) {
    assert.equal(
      appRedact(input),
      webRedact(input),
      `redaction drifted between eddy-ios and the web app for: ${JSON.stringify(input)}`,
    );
  }
});

test('a Supabase session token never survives redaction', () => {
  // The specific value this exists to stop. authed() puts one in an
  // Authorization header on every /api/me/* request, so it is reachable from
  // any error thrown near that call.
  const jwt =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEifQ.Xf9k2LqPmN8vB3wQzR5tYhJ7cA1dE0gS4uI6oK';

  const out = appRedact(`failed with token ${jwt}`);
  assert.match(out, /\[redacted-jwt\]/);
  assert.ok(!out.includes(jwt), 'the raw JWT survived redaction');
});

test('an email in a thrown message is redacted', () => {
  // Apple returns a real address on first authorisation, and it passes through
  // signInWithApple — so it is one throw away from an error report.
  assert.equal(appRedact('no account for evan@eddy.guide'), 'no account for [redacted-email]');
});

test('a coordinate pair never survives redaction', () => {
  // The privacy policy states that coordinates are stripped before anything
  // leaves the device. Location is computed on-device and never sent, so the
  // only way one reaches a reporter is inside a message — which is this.
  const out = appRedact('locate failed near 37.15412, -91.56231');
  assert.match(out, /\[redacted-coords\]/);
  assert.ok(!out.includes('37.15412'), 'the raw latitude survived redaction');
  assert.ok(!out.includes('-91.56231'), 'the raw longitude survived redaction');
});

test("the coordinate rule does not eat the app's own two-decimal readings", () => {
  // A stage and a discharge printed together are the shape this rule is most
  // likely to catch by accident, and a report that redacted its own gauge
  // numbers would be useless for the bugs it exists to diagnose.
  const readings = 'gauge height 3.40, discharge 2.80';
  assert.equal(appRedact(readings), readings);
  // River mile and distance, the other pairing that shows up in this app.
  assert.equal(appRedact('mile 12.75, 4.20 away'), 'mile 12.75, 4.20 away');
});

test('redactValue leaves non-strings that cannot carry a secret alone', () => {
  // Stringifying everything would turn a readable report into quoted noise;
  // numbers, booleans and null have nowhere to hide a token.
  assert.equal(redactValue(42), 42);
  assert.equal(redactValue(true), true);
  assert.equal(redactValue(null), null);
  assert.equal(redactValue(undefined), undefined);
});

test('redactValue caps a runaway string', () => {
  // An error carrying a whole response body would otherwise be sent verbatim.
  const out = redactValue('x'.repeat(5_000)) as string;
  assert.ok(out.length <= 501, `expected a capped string, got ${out.length} chars`);
  assert.ok(out.endsWith('…'));
});

test('redactContext redacts values but leaves keys readable', () => {
  // Keys are ours and are what make a report navigable; values are the ones
  // that arrive from the wire.
  const out = redactContext({ riverSlug: 'current-river', email: 'evan@eddy.guide' });
  assert.deepEqual(out, { riverSlug: 'current-river', email: '[redacted-email]' });
});

test('redactContext passes through null and undefined', () => {
  // report() is called with no context far more often than with one.
  assert.equal(redactContext(undefined), undefined);
  assert.equal(redactContext(null), undefined);
});

test('an Error is not treated as a bag of fields', () => {
  // Spreading an Error yields {} — message and stack are non-enumerable. A
  // reporter that got this wrong would file "something went wrong" with no
  // indication of what, which is the failure mode this whole branch exists to
  // avoid. Most warn() call sites pass a caught error, so this is the common path.
  assert.equal(isContextBag(new Error('boom')), false);
  assert.equal(isContextBag(new TypeError('boom')), false);
});

test('a plain object is a bag and an array is not', () => {
  // Arrays would spread into numeric keys — unreadable extras.
  assert.equal(isContextBag({ previousId: 'a', nextId: 'b' }), true);
  assert.equal(isContextBag(['a', 'b']), false);
  assert.equal(isContextBag(null), false);
  assert.equal(isContextBag('a string'), false);
});
