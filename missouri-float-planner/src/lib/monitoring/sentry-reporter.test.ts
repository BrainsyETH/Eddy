// src/lib/monitoring/sentry-reporter.test.ts
// The reporter's one job that is silent when broken: nothing leaves unredacted.
//
// A leak here is invisible from the outside — errors keep arriving, the
// dashboard looks healthy, and the bearer token is sitting in the issue title.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createSentryReporter } from './sentry-reporter';

function fakeSentry() {
  const captured: { error: unknown; hint?: { extra?: Record<string, unknown> } }[] = [];
  return {
    sentry: {
      captureException(error: unknown, hint?: { extra?: Record<string, unknown> }) {
        captured.push({ error, hint });
      },
    },
    captured,
  };
}

test('an email in the error message never reaches Sentry', () => {
  // Sentry GROUPS on the message, so an unredacted email does not merely leak —
  // it mints one issue per user and buries the actual fault.
  const { sentry, captured } = fakeSentry();
  createSentryReporter(sentry)(new Error('could not load profile for paddler@example.com'));

  const message = (captured[0].error as Error).message;
  assert.ok(!message.includes('paddler@example.com'));
  assert.match(message, /\[redacted-email\]/);
});

test('a bearer token in a stack trace is redacted', () => {
  // Stacks routinely carry the arguments of the frame that threw.
  const { sentry, captured } = fakeSentry();
  const error = new Error('request failed');
  error.stack = 'Error: request failed\n  at fetch (Authorization: Bearer abc.def.ghi)';

  createSentryReporter(sentry)(error);

  assert.ok(!(captured[0].error as Error).stack?.includes('abc.def.ghi'));
});

test('a JWT in the context bag is redacted without losing the key', () => {
  // The shape of the context is what makes an issue diagnosable, so values are
  // scrubbed one at a time rather than the bag being dropped.
  const { sentry, captured } = fakeSentry();
  createSentryReporter(sentry)(new Error('boom'), {
    route: '/api/me/profile',
    token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature',
  });

  const extra = captured[0].hint?.extra;
  assert.equal(extra?.route, '/api/me/profile');
  assert.match(String(extra?.token), /\[redacted-jwt\]/);
});

test('the error name and grouping survive redaction', () => {
  // Redaction rebuilds the Error, and a rebuilt error that loses its name
  // collapses every ApiError into a generic Error in the dashboard.
  const { sentry, captured } = fakeSentry();
  const error = new Error('nope');
  error.name = 'ApiError';

  createSentryReporter(sentry)(error);

  assert.equal((captured[0].error as Error).name, 'ApiError');
});

test('a thrown non-Error still reports', () => {
  // `throw 'string'` is rare but real, and dropping it would lose the incident
  // entirely rather than logging it badly.
  const { sentry, captured } = fakeSentry();
  createSentryReporter(sentry)('plain failure');

  assert.match((captured[0].error as Error).message, /plain failure/);
});
