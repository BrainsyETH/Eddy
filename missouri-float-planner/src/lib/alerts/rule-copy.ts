// src/lib/alerts/rule-copy.ts
// How an alert rule is described in words. Pure and I/O-free.
//
// MIRRORED, by hand, from describeAlertRule/formatAlertValue in
// packages/eddy-types/index.ts. @eddy/types is not resolvable from this app's
// tsconfig — Vercel installs only missouri-float-planner/ — which is the same
// reason /api/gauges declares its own GaugeStation rather than importing
// MapGauge. Keep the two in step: a user who reads "above 3.00 ft" in the app's
// manage list and "over 3 feet" in the push body has to work out for themselves
// whether those are the same alert.

import type { AlertComparator, AlertMetric, AlertRuleMode, AlertSubscriptionKind } from '@/types/api';

/** The subset of a rule this module needs. Keeps the copy testable from literals. */
export interface DescribableRule {
  mode: AlertRuleMode;
  conditionKind: AlertSubscriptionKind | null;
  metric: AlertMetric | null;
  comparator: AlertComparator | null;
  thresholdValue: number | null;
  thresholdValueMax: number | null;
}

/** Stage to two decimals, discharge whole — the precision each is reported at. */
export function formatAlertValue(value: number, metric: AlertMetric): string {
  if (metric === 'gauge_height_ft') return `${value.toFixed(2)} ft`;
  return `${Math.round(value).toLocaleString('en-US')} cfs`;
}

/**
 * The rule's trigger as one sentence fragment — "when it rises above 3.00 ft".
 *
 * Deliberately excludes the river or gauge name: every caller already has the
 * target and puts it in the title, so including it here yields "Huzzah Creek —
 * Huzzah Creek rises above 3.00 ft".
 */
export function describeAlertRule(rule: DescribableRule): string {
  if (rule.mode === 'condition') {
    switch (rule.conditionKind) {
      case 'floatable':
        return 'when it becomes floatable';
      case 'safety':
        return 'on high and dangerous water';
      default:
        return 'on any condition change';
    }
  }

  const metric = rule.metric ?? 'gauge_height_ft';
  const low = rule.thresholdValue;
  if (low == null) return 'when conditions change';

  switch (rule.comparator) {
    case 'below':
      return `when it drops below ${formatAlertValue(low, metric)}`;
    case 'between': {
      const high = rule.thresholdValueMax;
      // The database rejects a `between` rule with no upper bound, so this can
      // only be a truncated payload. Degrade to the half the rule does state
      // rather than printing "between 3.00 ft and null".
      if (high == null) return `when it rises above ${formatAlertValue(low, metric)}`;
      return `while it is between ${formatAlertValue(low, metric)} and ${formatAlertValue(high, metric)}`;
    }
    default:
      return `when it rises above ${formatAlertValue(low, metric)}`;
  }
}
