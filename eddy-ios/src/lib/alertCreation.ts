import type { AlertComparator, AlertMetric, AlertRuleMode, AlertSubscriptionKind } from '@eddy/types';

export interface AlertDraft {
  mode: AlertRuleMode;
  conditionKind: AlertSubscriptionKind;
  metric: AlertMetric;
  comparator: AlertComparator;
  value: string;
  valueMax: string;
  oneShot: boolean;
}

/** Only fields that would be saved count; hidden threshold defaults don't. */
export function alertDraftChanged(draft: AlertDraft, initial: AlertDraft): boolean {
  if (draft.mode !== initial.mode || draft.oneShot !== initial.oneShot) return true;
  if (draft.mode === 'condition') return draft.conditionKind !== initial.conditionKind;
  return draft.metric !== initial.metric || draft.comparator !== initial.comparator ||
    draft.value.trim() !== initial.value.trim() ||
    (draft.comparator === 'between' && draft.valueMax.trim() !== initial.valueMax.trim());
}

/**
 * A threshold as typed. The decimal pad offers only the locale's separator,
 * which in much of the world is a comma; `Number('3,40')` is NaN, so Save
 * stayed disabled with nothing to say why, and the prefilled "3.40" could
 * not even be retyped. Either separator reads as the decimal point; thousands
 * grouping is not accepted, so "1,250" is 1.25 and the hint below says so.
 */
export function parseThresholdInput(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return NaN;
  return Number(trimmed.replace(',', '.'));
}

export function alertAnchor(value: number | null, metric: AlertMetric): string {
  return value == null ? '' : metric === 'discharge_cfs' ? String(Math.round(value)) : value.toFixed(2);
}

/** A synchronous lock: React's next render is too late to reject a second tap.
 * Commit immediately after the API write, before refresh or presentation work.
 * A successful write must never become retryable because follow-up work failed.
 */
export function createAlertSaveTask() {
  let busy = false;
  let saved = false;
  return {
    get busy() { return busy; },
    get saved() { return saved; },
    async run<T>(write: (commit: () => void) => Promise<T>): Promise<T | null> {
      if (busy || saved) return null;
      busy = true;
      try {
        return await write(() => { saved = true; });
      } finally {
        busy = false;
      }
    },
  };
}
