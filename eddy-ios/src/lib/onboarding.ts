// Whether this device has acknowledged the safety disclaimer and terms.
//
// ── The storage handle is resolved INSIDE the try, deliberately ─────────────
//
// These used to read `storage: OnboardingStorage = deviceStorage()`. A default
// parameter is evaluated when the function is CALLED, before its body — so the
// require() sat outside the try/catch that was written to protect it, and a
// missing or unlinked native module rejected the promise instead of being
// caught. OnboardingGate awaits this before it renders anything, so a rejection
// there left its `accepted` state null forever: a blank screen in colors.bg,
// which in dark mode is #1A1814 — byte-identical to the splash background in
// app.json. The app looked like it hung on the splash, and nothing was logged.
//
// Passing storage explicitly is still supported, and is how the tests inject a
// throwing stub. It just is not a default any more.

export const ONBOARDING_VERSION = 1;
export const ONBOARDING_KEY = `eddy.onboarding.accepted.v${ONBOARDING_VERSION}`;

export interface OnboardingStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

function deviceStorage(): OnboardingStorage {
  // Lazy so the pure contract remains importable by the web test harness.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@react-native-async-storage/async-storage').default as OnboardingStorage;
}

/**
 * Has this device accepted?
 *
 * FAILS CLOSED: any error answers `false`, which shows the gate again. Showing
 * it twice is a small annoyance; skipping it is a legal one, and a hang is
 * worse than either.
 */
export async function hasAcceptedTerms(storage?: OnboardingStorage): Promise<boolean> {
  try {
    const store = storage ?? deviceStorage();
    return (await store.getItem(ONBOARDING_KEY)) === 'accepted';
  } catch {
    return false;
  }
}

/**
 * Record the acceptance.
 *
 * THROWS on failure, and the caller is expected to continue anyway — the person
 * did accept, whatever the disk did. OnboardingGate reports it and lets the
 * session through, so the only cost of a failed write is being asked again next
 * launch. Swallowing it here would hide a real device problem from Sentry.
 */
export async function acceptTerms(storage?: OnboardingStorage): Promise<void> {
  const store = storage ?? deviceStorage();
  await store.setItem(ONBOARDING_KEY, 'accepted');
}
