// eddy-ios/src/lib/secure-session-store.ts
// Keychain-backed storage for the Supabase session.
//
// ── Why the Keychain and not AsyncStorage ─────────────────────────────────
//
// The session is what ties a person to their purchase. RevenueCat is keyed on
// the Supabase user id, so losing the session means losing the entitlement: the
// app would acquire a fresh anonymous identity and a paying subscriber would
// find their subscription gone, with no route back short of support.
//
// AsyncStorage is a plaintext SQLite file inside the app container that is
// removed with the app. Keychain items are encrypted at rest and outlive a
// reinstall, which is the durability the identity needs — the strategy calls
// for exactly this ("persist the session refresh token in iOS Keychain so
// reinstalls keep identity").
//
// The chunking this delegates to is not incidental: expo-secure-store warns
// above 2048 bytes and a Supabase session is routinely larger. See
// chunked-store.ts, which holds that logic and its tests.

import * as SecureStore from 'expo-secure-store';
import { createChunkedStore } from '@/lib/chunked-store';

/**
 * Readable after the FIRST unlock following a reboot, rather than only while
 * the device is unlocked. Token refresh runs from a background AppState
 * transition, which can happen with the screen locked; the stricter default
 * (WHEN_UNLOCKED) would fail those refreshes and log the user out.
 *
 * THIS_DEVICE_ONLY, deliberately. Without it the item rides along in
 * encrypted backups and restores onto other devices — a long-lived refresh
 * token in every backup, for nothing: the durability this store exists for
 * ("reinstalls keep identity", above) is the Keychain surviving reinstall on
 * THIS device, which the device-only class provides. A restored phone signs
 * in with Apple once, exactly as a new phone does.
 *
 * Existing items do NOT migrate on the next write. expo-secure-store's set()
 * hits errSecDuplicateItem for a key that exists and falls through to
 * SecItemUpdate with a dictionary of kSecValueData only, so the accessibility
 * class an item was created with is the class it keeps; chunked-store
 * overwrites chunk keys in place rather than deleting first. Sessions that
 * existed before this class was chosen keep AFTER_FIRST_UNLOCK (backup-
 * included) until sign-out or account deletion recreates the items. Reads are
 * unaffected — the query does not filter on accessibility — so nobody is
 * logged out by this. A real migration is remove-then-add behind a one-time
 * flag, with the crash-between-the-two case handled; not done here.
 */
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

/**
 * The storage adapter supabase-js expects.
 *
 * Errors are swallowed by createChunkedStore rather than thrown: a Keychain
 * that cannot be read is indistinguishable from a first launch, and the app is
 * designed to work with no session at all. Throwing here would turn a
 * recoverable storage fault into a crash on startup.
 */
export const secureSessionStore = createChunkedStore({
  getItem: (key) => SecureStore.getItemAsync(key, OPTIONS),
  setItem: (key, value) => SecureStore.setItemAsync(key, value, OPTIONS),
  removeItem: (key) => SecureStore.deleteItemAsync(key, OPTIONS),
});
