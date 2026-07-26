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
 */
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
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
