// src/lib/apple/revoke.test.ts
// Offline coverage for the Apple integration, via the injected fetch.
//
// None of this can be exercised against Apple from CI, and every failure mode
// it guards surfaces as the same opaque 400 from appleid.apple.com — which is
// exactly why the wire format is asserted here rather than discovered during a
// submission.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { generateKeyPairSync } from 'node:crypto';
import { decodeJwt, decodeProtectedHeader } from 'jose';
import {
  appleClientSecret,
  appleCredentialsFromEnv,
  exchangeAuthorizationCode,
  revokeAppleToken,
  type AppleCredentials,
} from './revoke';

/** A throwaway P-256 key, the curve Apple's ES256 requires. */
function testCredentials(): AppleCredentials {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return {
    teamId: 'TEAM123456',
    keyId: 'KEY1234567',
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    clientId: 'eddy.guide.app',
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('the client secret is ES256 with the team as issuer and the bundle id as subject', async () => {
  // Swapping `sub` and `aud` is the classic mistake here, and Apple answers it
  // with the same opaque 400 as a malformed signature — indistinguishable from
  // a key problem when you are debugging against a third party.
  const creds = testCredentials();
  const token = await appleClientSecret(creds, 1_700_000_000);

  assert.equal(decodeProtectedHeader(token).alg, 'ES256');
  assert.equal(decodeProtectedHeader(token).kid, creds.keyId);

  const claims = decodeJwt(token);
  assert.equal(claims.iss, creds.teamId);
  assert.equal(claims.sub, creds.clientId);
  assert.equal(claims.aud, 'https://appleid.apple.com');
  assert.ok((claims.exp ?? 0) > (claims.iat ?? 0));
});

test('an authorization code is exchanged as a form post, not JSON', async () => {
  // Apple's token endpoint accepts application/x-www-form-urlencoded only. A
  // JSON body is a 400 that says nothing about the content type.
  const creds = testCredentials();
  let seen: { url: string; contentType: string | null; body: URLSearchParams } | null = null;

  const result = await exchangeAuthorizationCode('CODE', creds, {
    fetch: async (url, init) => {
      seen = {
        url: String(url),
        contentType: new Headers(init?.headers).get('Content-Type'),
        body: new URLSearchParams(String(init?.body)),
      };
      return jsonResponse({ refresh_token: 'REFRESH' });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.refreshToken, 'REFRESH');
  assert.equal(seen!.url, 'https://appleid.apple.com/auth/token');
  assert.equal(seen!.contentType, 'application/x-www-form-urlencoded');
  assert.equal(seen!.body.get('grant_type'), 'authorization_code');
  assert.equal(seen!.body.get('code'), 'CODE');
  assert.equal(seen!.body.get('client_id'), creds.clientId);
});

test('a rejected exchange reports rather than throws', async () => {
  // The caller is a sign-in path. A throw here would surface a working sign-in
  // as broken over a compliance side-effect the user cannot act on.
  const result = await exchangeAuthorizationCode('CODE', testCredentials(), {
    fetch: async () => jsonResponse({ error: 'invalid_grant' }, 400),
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, 'invalid_grant');
});

test('a 200 with no refresh token is a failure, not a success', async () => {
  // Otherwise an empty body stores `undefined` and revocation silently has
  // nothing to revoke months later.
  const result = await exchangeAuthorizationCode('CODE', testCredentials(), {
    fetch: async () => jsonResponse({}),
  });

  assert.equal(result.ok, false);
});

test('a network throw during exchange is caught', async () => {
  const result = await exchangeAuthorizationCode('CODE', testCredentials(), {
    fetch: async () => {
      throw new Error('ENOTFOUND');
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, 'ENOTFOUND');
});

test('revocation names the token type it is sending', async () => {
  // Apple requires token_type_hint; without it the endpoint cannot tell a
  // refresh token from an access token and rejects the call.
  let body: URLSearchParams | null = null;

  const result = await revokeAppleToken('REFRESH', testCredentials(), {
    fetch: async (url, init) => {
      assert.equal(String(url), 'https://appleid.apple.com/auth/revoke');
      body = new URLSearchParams(String(init?.body));
      return new Response(null, { status: 200 });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(body!.get('token'), 'REFRESH');
  assert.equal(body!.get('token_type_hint'), 'refresh_token');
});

test('a failed revocation reports rather than throws', async () => {
  const result = await revokeAppleToken('REFRESH', testCredentials(), {
    fetch: async () => new Response(null, { status: 500 }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, 'http_500');
});

test('partial Apple configuration reads as absent, not as broken', async () => {
  // A deployment with no APPLE_* vars — local dev, a preview branch — must
  // still be able to delete an account. Half-configured is the same as unset:
  // signing with three of four values produces a token Apple rejects.
  const original = { ...process.env };
  try {
    delete process.env.APPLE_TEAM_ID;
    process.env.APPLE_KEY_ID = 'KEY';
    process.env.APPLE_PRIVATE_KEY = 'PEM';
    process.env.APPLE_CLIENT_ID = 'eddy.guide.app';
    assert.equal(appleCredentialsFromEnv(), null);
  } finally {
    process.env = original;
  }
});

test('an escaped private key from the environment is unescaped', async () => {
  // Dashboards cannot hold real newlines, so the PEM arrives with literal \\n.
  // Left as-is the key fails to import with an error naming neither the
  // variable nor the cause.
  const original = { ...process.env };
  try {
    process.env.APPLE_TEAM_ID = 'TEAM';
    process.env.APPLE_KEY_ID = 'KEY';
    process.env.APPLE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\\nAAAA\\n-----END PRIVATE KEY-----';
    process.env.APPLE_CLIENT_ID = 'eddy.guide.app';

    const creds = appleCredentialsFromEnv();
    assert.ok(creds);
    assert.ok(creds.privateKey.includes('\n'));
    assert.ok(!creds.privateKey.includes('\\n'));
  } finally {
    process.env = original;
  }
});
