export type ConditionEventKind = 'floatable' | 'warning' | 'easing' | 'recovery' | 'info';
export type SubscriptionKind = 'floatable' | 'safety' | 'all';

const ELEVATED = new Set(['high', 'dangerous']);
const FLOATABLE = new Set(['good', 'flowing']);
const LOW = new Set(['low', 'too_low']);

export function classifyConditionEvent(oldCode: string, newCode: string): ConditionEventKind {
  if (LOW.has(oldCode) && FLOATABLE.has(newCode)) return 'floatable';
  if (newCode === 'dangerous' || (!ELEVATED.has(oldCode) && ELEVATED.has(newCode))) return 'warning';
  if (oldCode === 'dangerous' && newCode === 'high') return 'easing';
  if (ELEVATED.has(oldCode) && !ELEVATED.has(newCode)) return 'recovery';
  return 'info';
}

export function subscriptionMatches(subscription: SubscriptionKind, event: ConditionEventKind): boolean {
  if (event === 'info') return false;
  if (subscription === 'all') return true;
  if (subscription === 'floatable') return event === 'floatable';
  return event === 'warning' || event === 'easing' || event === 'recovery';
}

export function hasSuspectQualifier(qualifiers: string[]): boolean {
  const suspect = new Set(['e', 'estimated', 'eqp', 'ice']);
  return qualifiers.some((value) => suspect.has(value.trim().toLowerCase()));
}

export function retryDelayMs(attempt: number): number {
  return Math.min(60 * 60_000, 30_000 * 2 ** Math.max(0, attempt - 1));
}
