import type { FloatPlan } from '@eddy/types';

const LEGACY_JACKS_FORK_TIP = 'The Jacks Fork rises and falls FAST after rain. Flash floods are a serious concern. If rain is forecast or the gauge is rising, postpone your trip.';

/** Omit only the retired paragraph in native plan results. Keep other river
 * guidance, future edited tips, and the server's live warnings untouched. */
export function planFloatTip(river: Pick<FloatPlan['river'], 'slug' | 'floatTip'>): string | null {
  if ((river.slug === 'jacks-fork' || river.slug === 'jacks-fork-river')
    && river.floatTip?.trim() === LEGACY_JACKS_FORK_TIP) return null;
  return river.floatTip ?? null;
}
