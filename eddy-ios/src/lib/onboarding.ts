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

/**
 * Whether this device has been through the river picker.
 *
 * SEPARATE FROM THE LEGAL KEY ON PURPOSE, and separately versioned. The two
 * answer different questions and fail in opposite directions: the legal record
 * is a compliance fact that must survive a copy change (bump ONBOARDING_VERSION
 * to re-gate everyone), while this is a "have we already asked?" flag whose only
 * job is to not ask twice.
 *
 * Folding them into one key would mean a legal re-gate also re-ran the picker
 * for people who have been following rivers for months.
 */
export const PERSONALIZATION_VERSION = 1;
export const PERSONALIZATION_KEY = `eddy.onboarding.personalized.v${PERSONALIZATION_VERSION}`;

/** What the app should show first, resolved once per launch. */
export type FirstRunStep = 'legal' | 'picker' | 'app';

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

/**
 * Where the picker has got to on this device.
 *
 * ── Why this is tri-state and not a boolean ────────────────────────────────
 *
 * With a boolean, "legal accepted + not personalised" is ambiguous, and the two
 * things it can mean need opposite handling:
 *
 *   • an EXISTING user, from before the picker shipped — must go straight in
 *   • a NEW user who just tapped "I understand" — must see the picker
 *
 * That ambiguity is not theoretical. It is the state every single person hits
 * for the instant between accepting the terms and the picker appearing, so a
 * boolean forces the answer to depend on *when* it is read — and the failure
 * mode is that every new install silently skips the picker, on device only,
 * with nothing to see in a test.
 *
 * `pending` removes the ambiguity by recording the intent as soon as the legal
 * pane is cleared, which also means an onboarding interrupted by a kill or a
 * crash RESUMES at the picker instead of being lost. `null` then unambiguously
 * means "no record at all" — a pre-picker install — and the gate records the
 * migration so a future legal re-gate does not resurrect the picker.
 */
export type PersonalizationState = 'pending' | 'done' | null;

/** Never throws: an unreadable value answers `null`, which migrates in. */
export async function readPersonalization(
  storage?: OnboardingStorage,
): Promise<PersonalizationState> {
  try {
    const store = storage ?? deviceStorage();
    const value = await store.getItem(PERSONALIZATION_KEY);
    return value === 'pending' || value === 'done' ? value : null;
  } catch {
    return null;
  }
}

/**
 * Record that the picker is owed, the moment the legal pane is cleared.
 *
 * Never throws. A failed write costs the picker, not the launch — and losing a
 * skippable pane is a far better outcome than wedging someone on a blank screen
 * before they have seen the app.
 */
export async function markPersonalizationPending(storage?: OnboardingStorage): Promise<void> {
  try {
    const store = storage ?? deviceStorage();
    await store.setItem(PERSONALIZATION_KEY, 'pending');
  } catch {
    // Intentionally swallowed — see above.
  }
}

/** Record that the picker is finished, followed or skipped. Never throws. */
export async function completePersonalization(storage?: OnboardingStorage): Promise<void> {
  try {
    const store = storage ?? deviceStorage();
    await store.setItem(PERSONALIZATION_KEY, 'done');
  } catch {
    // Intentionally swallowed — see above.
  }
}

export interface FirstRunSnapshot {
  legalAccepted: boolean;
  personalization: PersonalizationState;
}

/**
 * Which pane the app opens on, from a snapshot read once at launch.
 *
 * Pure and total, so it is safe to call whenever — but the caller must pass the
 * LAUNCH snapshot, not a live re-read. See stepAfterLegal.
 */
export function resolveFirstRun(snapshot: FirstRunSnapshot): FirstRunStep {
  if (!snapshot.legalAccepted) return 'legal';
  if (snapshot.personalization === 'pending') return 'picker';
  // 'done', or null for an install that predates the picker entirely.
  return 'app';
}

/**
 * Which pane follows the legal one, decided against the LAUNCH snapshot.
 *
 * Deliberately not a re-read of storage: by the time this is called the legal
 * key says "accepted", which is indistinguishable from the pre-picker install
 * this is supposed to send straight through.
 *
 * `personalization == null` is the new-install case — nothing has ever been
 * recorded. A legal re-gate (ONBOARDING_VERSION bumped) leaves an existing
 * user's `done` in place, so they re-accept the terms and go back to the app
 * without being asked to pick rivers a second time.
 */
export function stepAfterLegal(snapshot: FirstRunSnapshot): FirstRunStep {
  return snapshot.personalization == null ? 'picker' : 'app';
}

/**
 * Does this launch represent a user who predates the picker?
 *
 * They are sent straight to the app, and the gate records the migration so the
 * question is settled permanently rather than being re-derived on every launch.
 */
export function needsMigrationRecord(snapshot: FirstRunSnapshot): boolean {
  return snapshot.legalAccepted && snapshot.personalization == null;
}
