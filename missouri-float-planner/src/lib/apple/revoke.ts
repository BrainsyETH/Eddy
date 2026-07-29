// src/lib/apple/revoke.ts
// Apple Sign In token exchange and revocation.
//
// App Store Guideline 5.1.1(v): an app offering Sign in with Apple AND account
// deletion has had to call Apple's revocation endpoint since June 2022. Failing
// to is a rejection, and it is not something a reviewer has to hunt for — they
// delete an account and check.
//
// Follows the shape of src/lib/push/expo.ts: endpoint constants, an injectable
// `fetch` so the whole module is unit-testable offline, and the classification
// split out from the I/O as pure functions.
//
// ── The five-minute constraint ────────────────────────────────────────────
//
// Apple authorization codes expire in about five minutes. So the code CANNOT be
// stored at sign-in and exchanged later at deletion time — by then it is long
// dead. The exchange happens immediately at sign-in and the resulting refresh
// token is what gets stored (apple_refresh_tokens, migration 00211).
//
// ── Why `jose`, against this repo's general preference ────────────────────
//
// Apple's client secret is a JWT signed ES256 with a .p8 key. Hand-rolling that
// on node:crypto means converting the DER signature Node produces into the raw
// r||s form JOSE requires, and a subtly wrong conversion does not throw — it
// produces a valid-looking token that Apple answers with an opaque 400. That is
// a bad thing to debug against a third party, and a bad thing to get wrong on a
// submission gate, so this is one endpoint that earns a dependency.

import { SignJWT, importPKCS8 } from 'jose';

const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';

/** Apple's documented maximum for a client secret is six months; ten minutes is plenty. */
const CLIENT_SECRET_TTL_SECONDS = 600;

export type FetchLike = typeof fetch;

export interface AppleCredentials {
  teamId: string;
  keyId: string;
  /** The .p8 contents, PKCS#8 PEM. */
  privateKey: string;
  /** The bundle id — eddy.guide.app. */
  clientId: string;
}

/**
 * Read the Apple credentials, or null if the integration is not configured.
 *
 * Null rather than throwing, and every caller treats it as "skip". Deployments
 * without these variables — local development, preview branches — must still be
 * able to delete an account; a missing optional integration is not an error
 * condition, it is an absent one.
 *
 * Per-callsite process.env reads, matching the rest of the repo.
 */
export function appleCredentialsFromEnv(): AppleCredentials | null {
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const privateKey = process.env.APPLE_PRIVATE_KEY;
  const clientId = process.env.APPLE_CLIENT_ID;

  if (!teamId || !keyId || !privateKey || !clientId) return null;
  return {
    teamId,
    keyId,
    // Env vars cannot hold real newlines in most dashboards, so the PEM is
    // stored with literal \n. Without this the key fails to import with an
    // error that names neither the variable nor the cause.
    privateKey: privateKey.replace(/\\n/g, '\n'),
    clientId,
  };
}

/**
 * The client secret JWT. ES256, signed with the .p8 key.
 *
 * `aud` is Apple's issuer and `sub` is the client id — not the user. Getting
 * those two the wrong way round is the classic mistake here and produces the
 * same opaque 400 as a malformed signature.
 */
export async function appleClientSecret(
  creds: AppleCredentials,
  nowSeconds: number,
): Promise<string> {
  const key = await importPKCS8(creds.privateKey, 'ES256');
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: creds.keyId })
    .setIssuer(creds.teamId)
    .setIssuedAt(nowSeconds)
    .setExpirationTime(nowSeconds + CLIENT_SECRET_TTL_SECONDS)
    .setAudience('https://appleid.apple.com')
    .setSubject(creds.clientId)
    .sign(key);
}

export interface TokenExchangeResult {
  ok: boolean;
  refreshToken?: string;
  /** Apple's error slug, for the log. Never surfaced to a user. */
  error?: string;
}

/**
 * Exchange an authorization code for a refresh token.
 *
 * Called at sign-in, because the code is dead in five minutes.
 */
export async function exchangeAuthorizationCode(
  code: string,
  creds: AppleCredentials,
  deps: { fetch?: FetchLike; nowSeconds?: number } = {},
): Promise<TokenExchangeResult> {
  const doFetch = deps.fetch ?? fetch;
  const nowSeconds = deps.nowSeconds ?? Math.floor(Date.now() / 1000);

  try {
    const secret = await appleClientSecret(creds, nowSeconds);
    const response = await doFetch(APPLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: creds.clientId,
        client_secret: secret,
        code,
        grant_type: 'authorization_code',
      }).toString(),
    });

    const body = (await response.json().catch(() => null)) as {
      refresh_token?: string;
      error?: string;
    } | null;

    if (!response.ok || !body?.refresh_token) {
      return { ok: false, error: body?.error ?? `http_${response.status}` };
    }
    return { ok: true, refreshToken: body.refresh_token };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown' };
  }
}

export interface RevokeResult {
  ok: boolean;
  error?: string;
}

/**
 * Revoke a refresh token.
 *
 * Apple answers 200 with an empty body on success. A token that was already
 * revoked also answers 200, so this is safely idempotent — which matters,
 * because a deletion that is retried after a partial failure will call it
 * again.
 */
export async function revokeAppleToken(
  refreshToken: string,
  creds: AppleCredentials,
  deps: { fetch?: FetchLike; nowSeconds?: number } = {},
): Promise<RevokeResult> {
  const doFetch = deps.fetch ?? fetch;
  const nowSeconds = deps.nowSeconds ?? Math.floor(Date.now() / 1000);

  try {
    const secret = await appleClientSecret(creds, nowSeconds);
    const response = await doFetch(APPLE_REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: creds.clientId,
        client_secret: secret,
        token: refreshToken,
        token_type_hint: 'refresh_token',
      }).toString(),
    });

    if (!response.ok) return { ok: false, error: `http_${response.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown' };
  }
}
