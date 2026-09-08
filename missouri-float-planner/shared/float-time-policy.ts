// shared/float-time-policy.ts
// One cross-platform decision for when Eddy must not quote a float time.

import type { ConditionCode } from './condition-system';
import type { ReachRiverType } from './reach-types';

/**
 * Why a float time is being withheld, or null when it is not.
 *
 * `dangerous` means a time exists but publishing it would invite a float that
 * should not happen. `regulated` means a dam release can change during the
 * trip, so one duration is not a truthful model.
 */
export type FloatTimeWithholdReason = 'dangerous' | 'regulated';

export function floatTimeWithholding(
  conditionCode: ConditionCode,
  riverType?: ReachRiverType | null,
): FloatTimeWithholdReason | null {
  if (conditionCode === 'dangerous') return 'dangerous';
  if (riverType === 'dam_tailwater') return 'regulated';
  return null;
}
