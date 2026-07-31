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

export async function hasAcceptedTerms(storage: OnboardingStorage = deviceStorage()): Promise<boolean> {
  try {
    return (await storage.getItem(ONBOARDING_KEY)) === 'accepted';
  } catch {
    return false;
  }
}

export async function acceptTerms(storage: OnboardingStorage = deviceStorage()): Promise<void> {
  await storage.setItem(ONBOARDING_KEY, 'accepted');
}
