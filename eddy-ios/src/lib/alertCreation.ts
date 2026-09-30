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
