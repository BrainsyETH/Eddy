// eddy-ios/src/lib/pushLedger.ts
// What this device last told the server about its push token, kept on disk.
//
// Two jobs, both about the same row in device_tokens:
//
//   Skip a registration that would change nothing. The app re-registered on
//   every foreground, against a limit of 30 per 15 minutes that fails CLOSED:
//   enough app switching, or a limiter outage, answered 429, `registered`
//   went false, and Settings said "Connecting now" for a device whose row
//   was fine. A registration is now sent when the account, the token or a
//   day has changed, and never otherwise.
//
//   Finish an unregister that could not happen at sign-out. Signing out with
//   no signal used to drop the DELETE on the floor, and the account that left
//   kept being notified on this phone until another account signed in on it.
//   The account's credentials are gone by the time there is signal, so the
//   retry goes to /api/device-tokens/release, which accepts the push token
//   together with the row id the server handed back at registration: two
//   values only this install holds.
//
// Pure, with storage passed in, so the web suite tests it
// (missouri-float-planner/src/lib/push-opt-out.test.ts).

export const PUSH_LEDGER_KEY = 'eddy.push.ledger.v1';

/** Registrations older than this are refreshed: the server's last_seen_at. */
export const REREGISTER_AFTER_MS = 24 * 60 * 60_000;

export interface PushRegistration {
  userId: string;
  expoPushToken: string;
  /** The device_tokens row id from the registration response. */
  deviceId: string | null;
  syncedAt: number;
}

export interface PushRelease {
  expoPushToken: string;
  deviceId: string;
}

export interface PushLedger {
  registration: PushRegistration | null;
  /** An unregister owed to the server that this device could not send. */
  release: PushRelease | null;
}

export const EMPTY_PUSH_LEDGER: PushLedger = { registration: null, release: null };

export interface PushLedgerStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

function deviceStorage(): PushLedgerStorage {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@react-native-async-storage/async-storage').default as PushLedgerStorage;
}

const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

/** A stored ledger, or the empty one if it is missing or unreadable. Never throws. */
export async function readPushLedger(storage: PushLedgerStorage = deviceStorage()): Promise<PushLedger> {
  try {
    const raw = await storage.getItem(PUSH_LEDGER_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<PushLedger>) : null;
    const registration = parsed?.registration;
    const release = parsed?.release;
    return {
      registration:
        registration && text(registration.userId) && text(registration.expoPushToken) &&
        typeof registration.syncedAt === 'number' && Number.isFinite(registration.syncedAt)
          ? {
              userId: registration.userId,
              expoPushToken: registration.expoPushToken,
              deviceId: text(registration.deviceId) ? registration.deviceId : null,
              syncedAt: registration.syncedAt,
            }
          : null,
      release: release && text(release.expoPushToken) && text(release.deviceId)
        ? { expoPushToken: release.expoPushToken, deviceId: release.deviceId }
        : null,
    };
  } catch {
    return EMPTY_PUSH_LEDGER;
  }
}

/** Best effort: a ledger that cannot be written only costs a redundant request. */
export async function writePushLedger(ledger: PushLedger, storage: PushLedgerStorage = deviceStorage()): Promise<void> {
  try {
    await storage.setItem(PUSH_LEDGER_KEY, JSON.stringify(ledger));
  } catch {
    // Next launch registers again; nothing is lost but a request.
  }
}

/** Whether this account and token need sending to the server now. */
export function needsRegistration(ledger: PushLedger, userId: string, expoPushToken: string, now: number): boolean {
  const last = ledger.registration;
  if (!last || last.userId !== userId || last.expoPushToken !== expoPushToken) return true;
  return !(now - last.syncedAt >= 0 && now - last.syncedAt < REREGISTER_AFTER_MS);
}

/**
 * The server holds this registration. Any release still owed is dropped: the
 * row it named is now this registration's (the same token, re-keyed or
 * refreshed), and releasing it would unregister the account that just signed in.
 */
export function registered(userId: string, expoPushToken: string, deviceId: string | null, now: number): PushLedger {
  return { registration: { userId, expoPushToken, deviceId, syncedAt: now }, release: null };
}

/**
 * The account is leaving this device. If its DELETE landed there is nothing
 * owed; if not, and the row id is known, a release is owed for it.
 */
export function unregistered(ledger: PushLedger, delivered: boolean): PushLedger {
  const last = ledger.registration;
  if (delivered || !last?.deviceId) return { registration: null, release: delivered ? null : ledger.release };
  return { registration: null, release: { expoPushToken: last.expoPushToken, deviceId: last.deviceId } };
}

/**
 * The row id this install holds for `expoPushToken`, sent with a registration
 * as `previousDeviceId`. If that row still belongs to another account (a
 * release owed and not yet delivered, an account switch), it is the proof the
 * server asks for before moving the token: knowing a token alone is not
 * holding the device. A release owed is preferred: it names the row the
 * leaving account still has.
 */
export function heldDeviceId(ledger: PushLedger, expoPushToken: string): string | null {
  if (ledger.release?.expoPushToken === expoPushToken) return ledger.release.deviceId;
  if (ledger.registration?.expoPushToken === expoPushToken) return ledger.registration.deviceId;
  return null;
}

/** The release was accepted, or the server has no such row: nothing more is owed. */
export function released(ledger: PushLedger): PushLedger {
  return { ...ledger, release: null };
}
