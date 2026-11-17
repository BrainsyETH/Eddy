import type { ConditionCode } from '@/types/api';
import { assessReadingTrust } from '@shared/reading-trust';

/** A missing rating is different from a missing or unreliable observation. */
export function readingPresentation(input: {
  value: number | null;
  ageHours: number | null | undefined;
  suspect: boolean;
  hasRating: boolean;
  condition?: ConditionCode;
}) {
  if (input.value == null || !Number.isFinite(input.value)) return 'missing';
  if (input.suspect) return 'flagged';
  if (!assessReadingTrust({ ageHours: input.ageHours }).trusted) return 'stale';
  // Official flood escalation can supply a verdict without a recreation ladder.
  if (!input.hasRating && (!input.condition || input.condition === 'unknown')) return 'unrated';
  return 'rated';
}
