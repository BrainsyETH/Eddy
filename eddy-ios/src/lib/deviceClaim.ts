// eddy-ios/src/lib/deviceClaim.ts
// The app's half of proving this iPhone holds its push token, when another
// account's row still holds it and there is no row id in the ledger to prove
// it with (a reinstall keeps the iOS token and loses the ledger).
//
// POST /api/me/device-tokens answers 409 token_held and pushes a short-lived
// code to the token (missouri-float-planner/src/lib/push/device-claim.ts).
// Only this phone can read it; sending it back moves the token here.
//
// The push and the 409 race: the server sends the push before it answers, so
// the code can arrive first. Codes are therefore kept for their lifetime when
// they arrive, and whichever of the two lands second redeems them.
//
// Pure, so the web suite tests it (src/lib/push-opt-out.test.ts).

/** Must match DEVICE_CLAIM_DATA_KEY on the server. */
export const DEVICE_CLAIM_DATA_KEY = 'eddyDeviceClaim';

/** Must match DEVICE_CLAIM_TTL_MS on the server. */
export const DEVICE_CLAIM_TTL_MS = 15 * 60_000;

/** What the server said about the code when it refused the token. */
export type DeviceClaimState = 'sent' | 'limited' | 'unavailable' | 'unknown';

/** The claim code a notification carries, or null if it is any other notification. */
export function deviceClaimCode(data: unknown): string | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const code = (data as Record<string, unknown>)[DEVICE_CLAIM_DATA_KEY];
  return typeof code === 'string' && code.length > 0 && code.length <= 200 ? code : null;
}

/** The `claim` field of a 409 token_held body. */
export function deviceClaimState(body: unknown): DeviceClaimState {
  const claim = body && typeof body === 'object' ? (body as Record<string, unknown>).claim : null;
  return claim === 'sent' || claim === 'limited' || claim === 'unavailable' ? claim : 'unknown';
}

/** Codes received and not yet redeemed, newest last. */
export function createDeviceClaimInbox() {
  let held: { code: string; receivedAt: number } | null = null;
  return {
    note(code: string, now: number): void {
      held = { code, receivedAt: now };
    },
    /** The newest unexpired code, once: a redeemed or refused code is not offered again. */
    take(now: number): string | null {
      const code = held && now - held.receivedAt >= 0 && now - held.receivedAt < DEVICE_CLAIM_TTL_MS ? held.code : null;
      held = null;
      return code;
    },
  };
}
