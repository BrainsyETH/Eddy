interface ReadPremiumAccess {
  sessionReady: boolean;
  userId: string | null;
  loaded: boolean;
  error: string | null;
  profileId: string | null;
  isActive: boolean;
}

/** Unknown or previous-account state must never be presented as a sales offer. */
export function canOfferReadPremium(state: ReadPremiumAccess): boolean {
  if (!state.sessionReady || !state.loaded || state.error) return false;
  if (state.profileId !== state.userId) return false;
  return !state.isActive;
}
