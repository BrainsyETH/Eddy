import type { ConditionCode } from '@/types/api';

export interface ConditionSnapshotReading {
  conditionCode: ConditionCode | string;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
}

function canonicalConditionCode(code: ConditionCode | string): string {
  return code === 'optimal' ? 'flowing' : code;
}

/** Match the precision shown to users: integer cfs or one decimal foot. */
export function displayedConditionValue(
  snapshot: Pick<ConditionSnapshotReading, 'gaugeHeightFt' | 'dischargeCfs'>,
  thresholdUnit: string | null | undefined,
): number | null {
  if (thresholdUnit === 'cfs') {
    return snapshot.dischargeCfs == null ? null : Math.round(snapshot.dischargeCfs);
  }
  return snapshot.gaugeHeightFt == null
    ? null
    : Math.round(snapshot.gaugeHeightFt * 10) / 10;
}

/**
 * AI prose is safe to show only beside the exact condition/value snapshot it
 * was written from. Matching a broad "floatable" class is insufficient: copy
 * such as "sweet spot" can contradict a merely-low badge, and an old numeric
 * reading is visibly wrong even when it remains inside the same band.
 */
export function conditionSnapshotMatches(
  proseSnapshot: ConditionSnapshotReading,
  currentSnapshot: ConditionSnapshotReading,
  thresholdUnit: string | null | undefined,
): boolean {
  if (
    canonicalConditionCode(proseSnapshot.conditionCode) !==
    canonicalConditionCode(currentSnapshot.conditionCode)
  ) {
    return false;
  }

  const proseValue = displayedConditionValue(proseSnapshot, thresholdUnit);
  const currentValue = displayedConditionValue(currentSnapshot, thresholdUnit);
  return proseValue !== null && currentValue !== null && proseValue === currentValue;
}
