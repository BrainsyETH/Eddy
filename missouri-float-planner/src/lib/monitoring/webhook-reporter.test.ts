// Guards the F19 audit fix: the monitoring sink must redact secrets/PII,
// dedupe repeats, cap volume, and never throw into the request path.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createWebhookReporter, redactText } from './webhook-reporter';

function collector() {
  const sent: Array<{ url: string; body: Record<string, unknown> }> = [];
  const send = (async (url: unknown, init?: { body?: unknown }) => {
    sent.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return new Response('ok');
  }) as unknown as typeof fetch;
  return { sent, send };
}

test('redactText strips emails, bearer tokens, hex secrets, and jwt shapes', () => {
  const input =
    'user evan@example.com sent Bearer abc.def-123 with ' +
    'token=sk_live_verysecretvalue and hmac deadbeefdeadbeefdeadbeefdeadbeef01 ' +
    'and jwt eyJhbGciOi.eyJzdWIiOi.sig-part';
  const out = redactText(input);
  assert.ok(!out.includes('evan@example.com'));
  assert.ok(!out.includes('abc.def-123'));
  assert.ok(!out.includes('sk_live_verysecretvalue'));
  assert.ok(!out.includes('deadbeefdeadbeefdeadbeefdeadbeef01'));
  assert.ok(!out.includes('eyJhbGciOi.eyJzdWIiOi.sig-part'));
});

test('reports carry redacted message, stack, and context', () => {
  const { sent, send } = collector();
  const report = createWebhookReporter('https://hooks.test/x', { send, now: () => 1_000 });

  report(new Error('login failed for evan@example.com'), {
    path: '/api/admin/login',
    authorization: 'Bearer secret-token-value',
  });

  assert.equal(sent.length, 1);
  const body = sent[0].body;
  assert.ok(String(body.text).includes('[redacted-email]'));
  assert.ok(!JSON.stringify(body).includes('evan@example.com'));
  assert.ok(!JSON.stringify(body).includes('secret-token-value'));
  assert.equal((body.context as Record<string, unknown>).path, '/api/admin/login');
});

test('same fingerprint is deduplicated within the cooldown, distinct ones pass', () => {
  const { sent, send } = collector();
  let clock = 0;
  const report = createWebhookReporter('https://hooks.test/x', { send, now: () => clock });

  report(new Error('boom'));
  report(new Error('boom')); // suppressed — same fingerprint, inside cooldown
  report(new Error('different'));
  assert.equal(sent.length, 2);

  clock = 6 * 60 * 1000; // past the 5-minute cooldown
  report(new Error('boom'));
  assert.equal(sent.length, 3);
});

test('global per-minute cap bounds an error storm', () => {
  const { sent, send } = collector();
  const report = createWebhookReporter('https://hooks.test/x', { send, now: () => 1_000 });
  for (let i = 0; i < 50; i++) report(new Error(`storm ${i}`));
  assert.equal(sent.length, 10);
});

test('a throwing transport never propagates into the caller', () => {
  const report = createWebhookReporter('https://hooks.test/x', {
    send: (() => {
      throw new Error('transport exploded');
    }) as unknown as typeof fetch,
    now: () => 1_000,
  });
  assert.doesNotThrow(() => report(new Error('boom')));
});
