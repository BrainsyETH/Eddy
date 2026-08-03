import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  acceptTerms,
  completePersonalization,
  hasAcceptedTerms,
  markPersonalizationPending,
  needsMigrationRecord,
  ONBOARDING_KEY,
  ONBOARDING_VERSION,
  PERSONALIZATION_KEY,
  PERSONALIZATION_VERSION,
  readPersonalization,
  resolveFirstRun,
  stepAfterLegal,
  type OnboardingStorage,
} from '../../../eddy-ios/src/lib/onboarding';

function memoryStorage(): OnboardingStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) { values.set(key, value); },
  };
}

test('onboarding is blocked until the current agreement is accepted', async () => {
  const storage = memoryStorage();
  assert.equal(await hasAcceptedTerms(storage), false);
  await acceptTerms(storage);
  assert.equal(await hasAcceptedTerms(storage), true);
});

test('the acceptance key is versioned for future material changes', () => {
  assert.match(ONBOARDING_KEY, new RegExp(`v${ONBOARDING_VERSION}$`));
});

test('storage read failures fail closed', async () => {
  const storage: OnboardingStorage = {
    async getItem() { throw new Error('unavailable'); },
    async setItem() {},
  };
  assert.equal(await hasAcceptedTerms(storage), false);
});

test('an acceptance write failure cannot trap the current session', () => {
  const gate = readFileSync('../eddy-ios/src/components/OnboardingGate.tsx', 'utf8');
  // The acknowledgement happened even if the write did not: the finally block
  // must advance the step regardless, or a failed disk traps the session on the
  // legal pane forever.
  assert.match(gate, /catch \(error\)[\s\S]*report\(error,[\s\S]*setStep\(next\)/);
});

// The regression these two cover is a HANG, not a thrown error, so neither
// would have failed loudly without being asserted. Resolving the storage handle
// used to be a default parameter — evaluated before the function body, and so
// outside the try that exists to protect it. A missing native module therefore
// rejected instead of returning false, OnboardingGate never left its null
// state, and the app sat on a blank screen the exact colour of the splash.

test('a storage handle that cannot be constructed fails closed, not rejected', async () => {
  const exploding = new Proxy({} as OnboardingStorage, {
    get() { throw new Error('native module unavailable'); },
  });
  assert.equal(await hasAcceptedTerms(exploding), false);
});

test('the gate never awaits an uncaught promise before its first render', () => {
  const gate = readFileSync('../eddy-ios/src/components/OnboardingGate.tsx', 'utf8');
  // The launch read decides whether children mount at all; an unhandled
  // rejection there is indistinguishable from a stuck splash.
  assert.match(gate, /hasAcceptedTerms\(\), readPersonalization\(\)\][\s\S]{0,200}\.catch\(/);
});

// ── First-run routing ───────────────────────────────────────────────────────
//
// The picker is pane 2 of a two-pane first run, and the whole routing problem is
// that ONE stored state — "legal accepted, nothing personalised" — is reached by
// two populations who need opposite treatment:
//
//   • everyone who installed before the picker existed → straight into the app
//   • everyone who just tapped "I understand" → the picker
//
// A boolean cannot tell them apart, and the failure is silent: every new install
// skips the picker, on device only. The tri-state below is what separates them,
// and these tests are the reason it is not simplified back to a flag.

test('a brand new install is routed to the legal pane, then the picker', () => {
  const launch = { legalAccepted: false, personalization: null } as const;
  assert.equal(resolveFirstRun(launch), 'legal');
  // Decided against the LAUNCH snapshot. Re-reading storage here would see the
  // acceptance that was just written and route this person into the app.
  assert.equal(stepAfterLegal(launch), 'picker');
});

test('an install from before the picker shipped never sees it', () => {
  const launch = { legalAccepted: true, personalization: null } as const;
  assert.equal(resolveFirstRun(launch), 'app');
  assert.equal(needsMigrationRecord(launch), true);
});

test('a finished first run is not asked again', () => {
  const launch = { legalAccepted: true, personalization: 'done' } as const;
  assert.equal(resolveFirstRun(launch), 'app');
  assert.equal(needsMigrationRecord(launch), false);
});

test('onboarding interrupted mid-picker resumes at the picker', () => {
  // 'pending' is written the moment the legal pane is cleared, so a kill between
  // the two panes is recoverable instead of being read as a migration.
  assert.equal(resolveFirstRun({ legalAccepted: true, personalization: 'pending' }), 'picker');
});

test('a legal re-gate does not resurrect the picker for an existing user', () => {
  // Bumping ONBOARDING_VERSION clears the legal key but not the personalization
  // one, so a copy change re-asks for consent without re-running onboarding.
  const launch = { legalAccepted: false, personalization: 'done' } as const;
  assert.equal(resolveFirstRun(launch), 'legal');
  assert.equal(stepAfterLegal(launch), 'app');
});

test('the migration is recorded, so it is not re-derived after a legal re-gate', async () => {
  const storage = memoryStorage();
  await acceptTerms(storage); // An existing user: legal only, no personalization.

  const launch = {
    legalAccepted: await hasAcceptedTerms(storage),
    personalization: await readPersonalization(storage),
  };
  assert.equal(needsMigrationRecord(launch), true);
  await completePersonalization(storage);

  // Now bump the legal key out from under them, as a version bump would.
  storage.values.delete(ONBOARDING_KEY);
  assert.equal(
    stepAfterLegal({
      legalAccepted: await hasAcceptedTerms(storage),
      personalization: await readPersonalization(storage),
    }),
    'app',
  );
});

test('personalization is stored under its own versioned key', () => {
  assert.match(PERSONALIZATION_KEY, new RegExp(`v${PERSONALIZATION_VERSION}$`));
  assert.notEqual(PERSONALIZATION_KEY, ONBOARDING_KEY);
});

test('personalization round-trips through both of its writers', async () => {
  const storage = memoryStorage();
  assert.equal(await readPersonalization(storage), null);
  await markPersonalizationPending(storage);
  assert.equal(await readPersonalization(storage), 'pending');
  await completePersonalization(storage);
  assert.equal(await readPersonalization(storage), 'done');
});

test('an unrecognised personalization value reads as never-asked', async () => {
  const storage = memoryStorage();
  await storage.setItem(PERSONALIZATION_KEY, 'yes');
  assert.equal(await readPersonalization(storage), null);
});

// The legal gate FAILS CLOSED — an unreadable value shows it again, because
// asking twice is an annoyance and skipping it is a legal problem. The picker
// fails the OTHER way on purpose: it is skippable chrome, and a storage fault
// must never be able to stand between someone and the app.

test('personalization fails open where the legal gate fails closed', async () => {
  const exploding = new Proxy({} as OnboardingStorage, {
    get() { throw new Error('native module unavailable'); },
  });
  assert.equal(await hasAcceptedTerms(exploding), false); // closed: re-gate
  assert.equal(await readPersonalization(exploding), null); // open: migrate in
});

test('personalization writes never throw at the caller', async () => {
  const failing: OnboardingStorage = {
    async getItem() { return null; },
    async setItem() { throw new Error('disk full'); },
  };
  await markPersonalizationPending(failing);
  await completePersonalization(failing);
});
