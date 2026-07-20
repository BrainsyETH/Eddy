import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import {
  ADMIN_SESSION_COOKIE,
  createAdminToken,
  requireAdminAuth,
} from './admin-auth';

const SECRET = 'test-only-admin-secret';

function withAdminSecret<T>(run: () => T): T {
  const originalSecret = process.env.ADMIN_API_SECRET;
  process.env.ADMIN_API_SECRET = SECRET;
  try {
    return run();
  } finally {
    if (originalSecret === undefined) delete process.env.ADMIN_API_SECRET;
    else process.env.ADMIN_API_SECRET = originalSecret;
  }
}

function request(
  method: string,
  token?: string,
  headers: Record<string, string> = {}
) {
  return new NextRequest('https://eddy.guide/api/admin/rivers', {
    method,
    headers: {
      ...headers,
      ...(token ? { cookie: `${ADMIN_SESSION_COOKIE}=${token}` } : {}),
    },
  });
}

test('admin auth accepts a valid HttpOnly-session token', () => {
  withAdminSecret(() => {
    const token = createAdminToken();
    assert.equal(requireAdminAuth(request('GET', token)), null);
  });
});

test('admin auth rejects requests without a session', () => {
  withAdminSecret(() => {
    const response = requireAdminAuth(request('GET'));
    assert.equal(response?.status, 401);
    assert.equal(response?.headers.get('cache-control'), 'private, no-store');
  });
});

test('cookie-authenticated writes require the exact same Origin', () => {
  withAdminSecret(() => {
    const token = createAdminToken();
    const missingOrigin = requireAdminAuth(request('POST', token));
    const foreignOrigin = requireAdminAuth(
      request('POST', token, { origin: 'https://attacker.example' })
    );
    const sameOrigin = requireAdminAuth(
      request('POST', token, { origin: 'https://eddy.guide' })
    );

    assert.equal(missingOrigin?.status, 403);
    assert.equal(foreignOrigin?.status, 403);
    assert.equal(sameOrigin, null);
  });
});

test('valid bearer tokens remain available for trusted scripts', () => {
  withAdminSecret(() => {
    const token = createAdminToken();
    const bearerRequest = new NextRequest('https://eddy.guide/api/admin/rivers', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(requireAdminAuth(bearerRequest), null);
  });
});
