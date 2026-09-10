/** What the UI should do after a Premium prose request fails. */
export type PremiumReadFailure = 'denied' | 'retryable';
export type AccountEntitlementState = boolean | null | 'pending';
export type PremiumTakeState = AccountEntitlementState | 'error';

/**
 * Preserve the distinction the report APIs expose.
 *
 * 402/403 mean the server has made a current entitlement decision, so the UI
 * should show the locked offer. A stale token, server fault, timeout, or lost
 * connection is not evidence that a subscriber stopped paying; those cases
 * keep the public facts on screen and offer a retry.
 */
export function classifyPremiumReadFailure(status?: number): PremiumReadFailure {
  return status === 402 || status === 403 ? 'denied' : 'retryable';
}

/** Turn account state plus the separate prose request into a render state. */
export function resolvePremiumTakeState(
  account: AccountEntitlementState,
  resolved: boolean,
  failure: PremiumReadFailure | null,
): PremiumTakeState {
  if (account !== true) return account;
  if (!resolved) return 'pending';
  if (failure === 'denied') return false;
  if (failure === 'retryable') return 'error';
  return true;
}
