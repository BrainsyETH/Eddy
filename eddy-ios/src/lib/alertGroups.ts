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
// ── This groups the VIEW, and nothing else ──────────────────────────────────
//
// There is no parent column on the wire and this does not invent one. The two
// kinds live in different tables and the delivery evaluator grades each on its
// own; a gauge rule whose river subscription is deleted keeps firing, because
// nothing server-side ever linked them.
//
// That is the constraint the Alerts screen has to respect rather than paper
// over: nesting a row inside another row PROMISES that the outer one governs
// it, so the screen has to make that true with writes of its own — cascading
// the pause, and naming the children in the delete confirmation. See
// app/(tabs)/alerts.tsx, which is the only caller. Grouping here without that
// there would be a lie the first time somebody deleted a river alert.
//
// ── A gauge rule is only ever a child of a river the user SUBSCRIBES to ─────
//
// Somebody can set an alert on a single station and no river at all — from the
// gauge screen, on a national station Eddy does not rate, or on one river's
// gauge without following the river. Those are not orphans and must not be
// indented under anything: they are the whole of what that person asked for,
// and burying them would be worse than the duplication this fixes.

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
 * different tables and may carry the same uuid — so anything that matches rules
 * by identity has to use this. One definition, imported by the batch mutations
 * in useAlertRules and by the pause memory, because three copies of a key
 * function is three chances for two of them to disagree.
 */
export function alertRuleKey(rule: AlertRule): string {
  return `${rule.source}:${rule.id}`;
}

/**
 * Rules as parents and children, preserving the server's ordering.
 *
 * A river-condition rule adopts every `gauge`-scoped rule carrying the same
 * riverId. Everything else — a gauge rule on a river with no subscription, a
 * national-tier threshold rule, a river rule with nothing under it — comes back
 * as a group of one, so the caller renders one list and never two.
 *
 * Pure and separate from the screen so it can be tested: the adoption rule is
 * the kind of thing that looks obviously right and is wrong for the one person
 * who follows two rivers that share a gauge.
 */
export function groupAlertRules(rules: AlertRule[]): AlertRuleGroup[] {
  // Which rivers actually have a subscription. Built first because a gauge rule
  // has to know whether a parent exists before the pass below reaches it.
  const parentByRiver = new Map<string, AlertRule>();
  for (const rule of rules) {
    if (rule.source !== 'river_condition' || !rule.riverId) continue;
    // FIRST WINS, not last. Duplicate river subscriptions should not exist —
    // the route refuses them — but if one ever does, adopting into the row the
    // user sees first is the only choice that cannot orphan children below a
    // row that has scrolled past.
    if (!parentByRiver.has(rule.riverId)) parentByRiver.set(rule.riverId, rule);
  }

  const childrenByParent = new Map<string, AlertRule[]>();
  const adopted = new Set<string>();
  for (const rule of rules) {
    if (rule.source === 'river_condition') continue;
    if (rule.scope !== 'gauge' || !rule.riverId) continue;
    const parent = parentByRiver.get(rule.riverId);
    if (!parent) continue;
    const list = childrenByParent.get(parent.id);
    if (list) list.push(rule);
    else childrenByParent.set(parent.id, [rule]);
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
 * The unit the screen actually acts on: pausing a group is N writes, and
 * deleting one has to say N in the confirmation.
 */
export function rulesInGroup(group: AlertRuleGroup): AlertRule[] {
  return [group.rule, ...group.children];
}

/**
 * What a group's switch has to write to PAUSE it.
 *
 * Only what is currently on. A child the user had already switched off needs no
 * round trip — and, more importantly, the set returned here is the complement of
 * what the screen remembers as "was already off", which is what makes resuming
 * able to put things back exactly as they were.
 */
export function rulesToPause(group: AlertRuleGroup): AlertRule[] {
  return rulesInGroup(group).filter((rule) => rule.enabled);
}

/**
 * What a group's switch has to write to RESUME it.
 *
 * ── The master-switch contract, and why it needs an argument ────────────────
 *
 * Nesting a row inside another row makes the outer switch a master switch, and
 * the behaviour everybody already knows from iOS Settings is that a master
 * switch GATES its children rather than overwriting them: turn it off, the
 * children grey out; turn it back on, they return to what each of them was.
 *
 * Eddy cannot gate. Nothing server-side links a gauge rule to the river
 * subscription it was created from, so a "gated" child would go on firing at
 * 4am under a paused parent. The pause is therefore real writes — and the cost
 * of real writes is that resuming has to know which children the switch put
 * down and which were already down before it.
 *
 * `keepPaused` is that answer, recorded when the group was paused. It is not a
 * copy of server state: it is a record of what THIS SWITCH did, which is a fact
 * only the client can hold. An empty set — never paused through the group
 * switch, or a reinstall since — resumes everything, which is the honest
 * degradation and what the group did before this existed.
 *
 * Also skips anything already on, so a child the user resumed by hand while the
 * parent was paused is left exactly alone rather than rewritten.
 */
export function rulesToResume(
  group: AlertRuleGroup,
  keepPaused: ReadonlySet<string>,
): AlertRule[] {
  return rulesInGroup(group).filter(
    (rule) => !rule.enabled && !keepPaused.has(alertRuleKey(rule)),
  );
}

/**
 * The children to remember as "leave these alone on resume", at pause time.
 *
 * The parent is never in here — it is the thing being paused, and it is always
 * on at the moment its switch is flicked off.
 */
export function childrenAlreadyPaused(group: AlertRuleGroup): string[] {
  return group.children.filter((child) => !child.enabled).map(alertRuleKey);
}
