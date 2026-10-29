// src/lib/push/device-claim.ts
// Proof that the caller holds the iPhone a push token addresses, when the
// token's row still belongs to another account and the app has no row id to
// prove it with.
//
// ── Why this exists ─────────────────────────────────────────────────────────
//
// POST /api/me/device-tokens moves a token off another account only with
// proof: knowing a token is not holding the device, and tokens turn up in
// logs. The usual proof is the previous row's id, which the app keeps in its
// push ledger. A reinstall loses the ledger but, on iOS, keeps the push token
// (Expo documents that it survives reinstalling). So: A registers, the app is
// deleted without signing out, it is reinstalled and B signs in. B has no row
// id, A's row still holds the token, and every retry answered 409 forever
// while Settings promised "Eddy will retry on the next launch".
//
// The device can still prove possession the one way only it can: receive a
// push. The server sends a short-lived code TO THE TOKEN, and only the phone
// that token addresses can read it and send it back. Someone who merely knows
// the token triggers a push to the victim's phone, which they never see, so
// the protection holds; the victim gets a notification that says to ignore it
// if they did not just sign in.
//
// ── The code ───────────────────────────────────────────────────────────────
//
// Stateless: `<expiresAtMs>.<HMAC-SHA256, base64url>` over the account, the
// token and the id of the row that holds it. Bound to all three, so a code
// cannot be replayed by another account, for another token, or after the
// holding row changes (once it is re-keyed, the code is spent). No table: the
// expiry and the binding are the whole state. The key is derived from
// DEVICE_CLAIM_SECRET when set, otherwise from the service-role key the server
// already holds, under a label of its own, so the claim key is never the raw
// secret and no deploy has to add a variable for this to work.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { ExpoMessage } from './expo';

/** How long a sent code can be redeemed. Long enough to switch back to Eddy. */
export const DEVICE_CLAIM_TTL_MS = 15 * 60_000;

/** The notification data key the app looks for. */
export const DEVICE_CLAIM_DATA_KEY = 'eddyDeviceClaim';

export interface DeviceClaimBinding {
  userId: string;
  expoPushToken: string;
  /** The device_tokens row (another account's) that holds the token now. */
  holderId: string;
}

/** The signing key, or null when the server has no secret to derive it from. */
export function deviceClaimKey(env: Record<string, string | undefined> = process.env): Buffer | null {
  const secret = env.DEVICE_CLAIM_SECRET || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) return null;
  return createHmac('sha256', secret).update('eddy:device-claim:v1').digest();
}

function mac(key: Buffer, binding: DeviceClaimBinding, expiresAt: number): string {
  return createHmac('sha256', key)
    .update(['v1', binding.userId, binding.expoPushToken, binding.holderId, String(expiresAt)].join('|'))
    .digest('base64url');
}

export function mintDeviceClaim(key: Buffer, binding: DeviceClaimBinding, now: number): string {
  const expiresAt = now + DEVICE_CLAIM_TTL_MS;
  return `${expiresAt}.${mac(key, binding, expiresAt)}`;
}

/** True only for an unexpired code minted for exactly this account, token and holding row. */
export function verifyDeviceClaim(key: Buffer, code: unknown, binding: DeviceClaimBinding, now: number): boolean {
  if (typeof code !== 'string' || code.length > 200) return false;
  const match = /^(\d{13})\.([A-Za-z0-9_-]{43})$/.exec(code.trim());
  if (!match) return false;
  const expiresAt = Number(match[1]);
  // Expired, or further out than any code this server mints.
  if (!(expiresAt >= now) || expiresAt > now + DEVICE_CLAIM_TTL_MS) return false;
  const expected = Buffer.from(mac(key, binding, expiresAt));
  const received = Buffer.from(match[2]);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/**
 * The rate-limit key for codes sent to one token. Hashed: a raw push token in
 * a limiter key would sit in another store's logs.
 */
export function deviceClaimLimitKey(expoPushToken: string): string {
  return `device-claim:${createHash('sha256').update(expoPushToken).digest('hex').slice(0, 32)}`;
}

/**
 * The push that carries the code. The app completes the claim silently when
 * Eddy is open (its foreground handler does not show this one); if Eddy is
 * not open the text says what to do, and says to ignore it if the person did
 * not just sign in, which is the case when someone else sent it.
 */
export function deviceClaimMessage(expoPushToken: string, code: string): ExpoMessage {
  return {
    to: expoPushToken,
    title: 'Confirm alerts on this iPhone',
    body: 'Open Eddy to move river alerts to the account you just signed in to. If that wasn’t you, ignore this.',
    data: { [DEVICE_CLAIM_DATA_KEY]: code },
    sound: null,
    priority: 'high',
  };
}
