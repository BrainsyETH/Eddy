// eddy-ios/src/lib/alertGroups.ts
// The alert list, as a river and the gauges under it.
//
// ── The redundancy this ends ────────────────────────────────────────────────
//
// Two surfaces create alerts and neither knew about the other. Setting one on
// the Current River makes a `river_condition` subscription; switching on three
// more of its stations in RiverGaugeAlerts — a section that lives INSIDE that
// alert's own edit screen — makes three `gauge` rules. The Alerts tab then drew
// four cards, all titled "Current River", differing only in a subtitle. The
// second, third and fourth looked like duplicates of the first because, read as
// rows, that is exactly what they are: four subscriptions to one river.
//
// They are not duplicates in substance. Each grades a different stretch against
// its own ladder, which is the whole reason the section exists — a verdict
// measured 70 miles downstream of where you put in is not your verdict. What
// was wrong was the SHAPE: a flat list said "four unrelated alerts" about
// something the user had built as one alert with three refinements.
//
// So the river is the row and its gauges hang off it.
//
// ── The parent link is real, and this only reads it ────────────────────────
//
// gauge_alert_subscriptions.parent_subscription_id records which river alert a
// gauge rule was created from — see migration
// 20260802143000_gauge_alert_parent_subscription.sql. That column is what makes
// the nesting more than a drawing:
//
//   * The EVALUATOR skips a child whose parent is paused, so the parent's
//     switch is a genuine gate. It writes nothing to the children, so resuming
//     restores each of them to whatever it was, with nothing remembered
//     anywhere on the client.
//   * DELETING the parent cascades. The children go with it, server-side.
//
// This function therefore has no policy left to invent. It reads `parentId` and
// arranges rows; everything the arrangement promises is enforced by the
// database and the two cron passes.
//
// ── A rule is a child only if it SAYS it is ────────────────────────────────
//
// Not "same river". Somebody can set an alert on a single station and no river
// at all — from the gauge screen, on a national station Eddy does not rate, or
// on one river's gauge without following the river. A custom level set that way
// is the whole of what that person asked for; adopting it because they happen to
// follow the same river would put it under a switch they never pointed at it,
// and gating is now real, so that would silence a real alert.

import type { AlertRule } from '@eddy/types';

export interface AlertRuleGroup {
  /** Stable across renders and unique within the list. */
  key: string;
  /** The row that is drawn full size. */
  rule: AlertRule;
  /**
   * Gauge rules on the same river, drawn indented under it.
   *
   * Empty for every group that is not a river subscription, and for a river
   * subscription whose extra stations have not been switched on.
   */
  children: AlertRule[];
}

/**
 * A rule's identity across BOTH tables.
 *
 * `id` alone is not unique — a gauge rule and a river subscription are rows in
 * different tables and may carry the same uuid — so anything keyed on a rule has
 * to use this. One definition, so the list keys and any future matcher cannot
 * disagree.
 */
export function alertRuleKey(rule: AlertRule): string {
  return `${rule.source}:${rule.id}`;
}

/**
 * Rules as parents and children, preserving the server's ordering.
 *
 * A gauge rule nests under the river alert named by its `parentId`, and under
 * nothing else. Everything without one — a rule set from the gauge screen, a
 * custom level, anything on the national tier, and every river alert — comes
 * back as a group of one, so the caller renders a single list rather than two.
 *
 * Pure and separate from the screen so it can be tested. What it must never do
 * is adopt a rule the server does not consider a child: the parent's switch
 * gates its children for real now, so a wrong adoption is an alert the user
 * silences without meaning to.
 */
export function groupAlertRules(rules: AlertRule[]): AlertRuleGroup[] {
  // Only real parents adopt. A `parentId` naming a rule that is not in this
  // list — a partial response, or a row deleted between two reads — leaves its
  // child top-level rather than dropping it, because a rule that renders
  // nowhere is a rule the user cannot pause, edit or delete.
  const parents = new Set(
    rules.filter((rule) => rule.source === 'river_condition').map((rule) => rule.id),
  );

  const childrenByParent = new Map<string, AlertRule[]>();
  const adopted = new Set<string>();
  for (const rule of rules) {
    const parentId = rule.parentId;
    if (!parentId || rule.source === 'river_condition' || !parents.has(parentId)) continue;
    const list = childrenByParent.get(parentId);
    if (list) list.push(rule);
    else childrenByParent.set(parentId, [rule]);
    adopted.add(alertRuleKey(rule));
  }

  const groups: AlertRuleGroup[] = [];
  for (const rule of rules) {
    if (adopted.has(alertRuleKey(rule))) continue;
    groups.push({
      key: alertRuleKey(rule),
      rule,
      children:
        rule.source === 'river_condition' ? (childrenByParent.get(rule.id) ?? []) : [],
    });
  }
  return groups;
}

/**
 * Every rule a group covers, parent first.
 *
 * Used for what the screen has to SAY about a group — the child count in the
 * delete confirmation — rather than for what it has to write. Deleting a group
 * is one DELETE, because the parent cascades.
 */
export function rulesInGroup(group: AlertRuleGroup): AlertRule[] {
  return [group.rule, ...group.children];
}

/**
 * Is this child currently held off by its parent?
 *
 * The child's own `enabled` is untouched and still true — that is the whole
 * point of a gate — so this is the only thing that can explain why its switch
 * reads on and it will not fire. The row draws itself unavailable on the
 * strength of it.
 */
export function isGatedByParent(group: AlertRuleGroup): boolean {
  return !group.rule.enabled;
}
