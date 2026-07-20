import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ADMIN_SESSION_COOKIE,
  hasAdminCredential,
} from './admin-session';

function requestWith(options: { authorization?: string; cookie?: string }) {
  return {
    headers: {
      get(name: string) {
        return name === 'authorization' ? options.authorization ?? null : null;
      },
    },
    cookies: {
      get(name: string) {
        if (name !== ADMIN_SESSION_COOKIE || options.cookie === undefined) {
          return undefined;
        }
        return { value: options.cookie };
      },
    },
  };
}

test('central admin gate accepts an HttpOnly cookie session', () => {
  assert.equal(hasAdminCredential(requestWith({ cookie: 'expiry.signature' })), true);
});

test('central admin gate retains Bearer support for trusted scripts', () => {
  assert.equal(
    hasAdminCredential(requestWith({ authorization: 'Bearer expiry.signature' })),
    true,
  );
});

test('central admin gate rejects missing or empty credentials', () => {
  assert.equal(hasAdminCredential(requestWith({})), false);
  assert.equal(hasAdminCredential(requestWith({ cookie: '  ' })), false);
  assert.equal(hasAdminCredential(requestWith({ authorization: 'Bearer   ' })), false);
});
