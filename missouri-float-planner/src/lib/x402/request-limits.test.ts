import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest, NextResponse } from 'next/server';
import { MAX_PAYMENT_HEADER_BYTES, paymentHeadersWithinLimit } from './request-limits';

test('payment header limits cover combined payloads and all supported header names', () => {
  assert.equal(paymentHeadersWithinLimit(new Headers()), true);
  for (const name of ['PAYMENT-SIGNATURE', 'X-PAYMENT', 'SIGN-IN-WITH-X']) {
    assert.equal(paymentHeadersWithinLimit(new Headers({ [name]: 'a'.repeat(MAX_PAYMENT_HEADER_BYTES) })), true);
    assert.equal(paymentHeadersWithinLimit(new Headers({ [name]: 'a'.repeat(MAX_PAYMENT_HEADER_BYTES + 1) })), false);
  }
  assert.equal(paymentHeadersWithinLimit(new Headers({
    'payment-signature': 'a'.repeat(MAX_PAYMENT_HEADER_BYTES / 2),
    'sign-in-with-x': 'a'.repeat(MAX_PAYMENT_HEADER_BYTES / 2 + 1),
  })), false);
});

test('oversized agent payment headers are refused before facilitator access or the route handler', async () => {
  const names = ['X402_WALLET_ADDRESS', 'X402_SOLANA_ADDRESS', 'X402_SIWX_ENABLED', 'X402_BAZAAR_ENABLED'] as const;
  const original = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  let fetches = 0;
  let handled = 0;
  process.env.X402_WALLET_ADDRESS = '0x0000000000000000000000000000000000000001';
  process.env.X402_SOLANA_ADDRESS = '';
  process.env.X402_SIWX_ENABLED = 'false';
  process.env.X402_BAZAAR_ENABLED = 'false';
  globalThis.fetch = async () => {
    fetches++;
    throw new Error('No network access is permitted in this test');
  };
  try {
    const { withX402Route } = await import('./engine');
    const handler = withX402Route(async () => {
      handled++;
      return NextResponse.json({ ok: true });
    }, '/api/rivers');
    const response = await handler(new NextRequest('https://eddy.guide/api/rivers', {
      headers: { 'User-Agent': 'ClaudeBot', 'Payment-Signature': 'a'.repeat(MAX_PAYMENT_HEADER_BYTES + 1) },
    }), { params: Promise.resolve({}) });
    assert.equal(response.status, 431);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(fetches, 0);
    assert.equal(handled, 0);
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of names) {
      if (original[name] === undefined) delete process.env[name];
      else process.env[name] = original[name];
    }
  }
});
