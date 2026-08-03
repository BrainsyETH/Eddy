import assert from 'node:assert/strict';
import test from 'node:test';
import { scrubEvent, type ScrubbableEvent } from '../../../eddy-ios/src/lib/scrub-event';

// ── why this file exists ─────────────────────────────────────────
//
// The iOS scrubber decides what a third party is allowed to see, and it lived
// inside monitoring.ts, which imports @sentry/react-native — so this runner
// could not load it and eddy-ios has no runner of its own. It was the one part
// of the reporting path that nothing checked.
//
// It was also wrong. Scrubbing covered `message` and `extra`; Sentry's
// captureException writes the thrown text to `exception.values[].value`, which
// is the path every caught error and every uncaught one takes. The tests below
// pin that field first, because it is the one that shipped unredacted.

const JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEifQ.Xf9k2LqPmN8vB3wQzR5tYhJ7cA1dE0gS4uI6oK';

test('a token in a thrown error message is redacted', () => {
  // The regression this module was extracted to fix. authed() puts a Supabase
  // access token in an Authorization header on every /api/me/* request, so it
  // is one throw away from exception.values[].value.
  const event = scrubEvent({
    exception: { values: [{ value: `request failed carrying ${JWT}` }] },
  });

  const scrubbed = event.exception?.values?.[0]?.value as string;
  assert.ok(!scrubbed.includes(JWT), 'the raw JWT survived in exception.values[].value');
  assert.match(scrubbed, /\[redacted-jwt\]/);
});

test('an Authorization header quoted into an error is redacted', () => {
  // The same token by the route it usually arrives on. The bearer rule runs
  // before the JWT one and claims this first — either marker is fine, the
  // assertion that matters is that the value itself is gone.
  const event = scrubEvent({
    exception: { values: [{ value: `fetch failed: Authorization: Bearer ${JWT}` }] },
  });

  const scrubbed = event.exception?.values?.[0]?.value as string;
  assert.ok(!scrubbed.includes(JWT), 'the raw token survived a bearer-shaped message');
});

test('every exception value is scrubbed, not just the first', () => {
  // A chained error arrives as several values, and the cause is often the one
  // holding the request detail.
  const event = scrubEvent({
    exception: {
      values: [{ value: 'outer failure' }, { value: 'caused by evan@eddy.guide' }],
    },
  });

  assert.equal(event.exception?.values?.[1]?.value, 'caused by [redacted-email]');
});

test('an email in the event message is still redacted', () => {
  // Regression guard on the extraction itself: `message` and `extra` were the
  // two fields the old in-file scrubber did cover, and they must keep working.
  const event = scrubEvent({ message: 'no account for evan@eddy.guide' });
  assert.equal(event.message, 'no account for [redacted-email]');
});

test('extras are redacted value by value, with keys left alone', () => {
  const event = scrubEvent({
    extra: { siteId: '07068000', note: 'token=abc123def456' },
  });

  const extra = event.extra as Record<string, unknown>;
  assert.equal(extra.siteId, '07068000', 'a harmless value should be untouched');
  assert.equal(extra.note, 'token=[redacted]');
});

test('the formatted-message path is covered too', () => {
  const event = scrubEvent({ logentry: { message: 'signed in as evan@eddy.guide' } });
  assert.equal(event.logentry?.message, 'signed in as [redacted-email]');
});

test('an event with nothing to scrub passes through unchanged', () => {
  // Most events are this shape. The scrubber must not invent fields, because
  // beforeSend returns exactly what it is handed.
  const event: ScrubbableEvent = scrubEvent({ message: 'launch stalled' });
  assert.equal(event.message, 'launch stalled');
  assert.equal(event.exception, undefined);
  assert.equal(event.extra, undefined);
});

test('missing and null containers do not throw', () => {
  // Sentry omits these fields entirely on most events, and a scrubber that
  // threw here would take out the reporter itself — the one failure that
  // guarantees no report at all.
  assert.doesNotThrow(() => scrubEvent({}));
  assert.doesNotThrow(() => scrubEvent({ exception: null, logentry: null }));
  assert.doesNotThrow(() => scrubEvent({ exception: { values: null } }));
  assert.doesNotThrow(() => scrubEvent({ exception: { values: [null] } }));
});

test('a non-string exception value is left alone', () => {
  // Defensive: the field is typed loosely because it crosses a module boundary
  // without Sentry's types, and redactText would stringify whatever it got.
  const event = scrubEvent({ exception: { values: [{ value: undefined }] } });
  assert.equal(event.exception?.values?.[0]?.value, undefined);
});

test('a coordinate pair in a thrown error is redacted', () => {
  // Location never leaves the device by design, so a coordinate can only reach
  // Sentry inside a message. The privacy policy says this is stripped.
  const event = scrubEvent({
    exception: { values: [{ value: 'locate failed near 37.15412, -91.56231' }] },
  });

  const scrubbed = event.exception?.values?.[0]?.value as string;
  assert.match(scrubbed, /\[redacted-coords\]/);
  assert.ok(!scrubbed.includes('37.15412'), 'the raw latitude survived redaction');
});
