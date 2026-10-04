interface ReadPremiumAccess {
  sessionReady: boolean;
  userId: string | null;
  loaded: boolean;
  error: string | null;
  profileId: string | null;
  isActive: boolean;
}

/** A preview may only use an entitlement verified for the current session. */
export function premiumReadUserId(state: ReadPremiumAccess): string | null {
  return state.sessionReady && state.loaded && !state.error && state.isActive && state.profileId === state.userId
    ? state.userId : null;
}

/** Unknown or previous-account state must never be presented as a sales offer. */
export function canOfferReadPremium(state: ReadPremiumAccess): boolean {
  if (!state.sessionReady || !state.loaded || state.error) return false;
  if (state.profileId !== state.userId) return false;
  return !state.isActive;
}
