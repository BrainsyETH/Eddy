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
// ── And a gauge that only EXTENDS the river alert is not a row at all ───────
//
// The first version of this drew every child as an indented row of its own,
// with its own switch and its own trigger sentence. That was the right shape for
// the data and the wrong one for the person: a child is made by flipping one
// station's switch inside the river alert's edit screen, and it copies the
// river alert's setting. To whoever flipped it, that is "my Meramec alert also
// covers Sullivan" — and the list answered with a second alert that repeated
// the first one's sentence, could be switched three different ways, and read
// ON beside a paused parent.
//
// So a child that still does exactly what its parent does is COVERAGE: it is
// named on the river's row ("Main gauge + Sullivan") and managed where it was
// created. Only a child that has been changed since — paused by hand, given a
// different trigger, spent — keeps a row, because that difference is the one
// thing the parent's row cannot say for it. See groupCoverage.
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
   * Gauge rules created from this river alert. groupCoverage splits them into
   * the ones named on the river's row and the ones drawn indented under it.
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
 * The child's own `enabled` is untouched — that is the whole point of a gate —
 * so this is the only thing that can explain an alert that is on and will not
 * fire. A child with a row of its own draws itself unavailable, without a
 * switch, on the strength of it.
 */
export function isGatedByParent(group: AlertRuleGroup): boolean {
  return !group.rule.enabled;
}

/** A spent one-shot: it has fired and will not fire again until re-armed. */
function isSpent(rule: AlertRule): boolean {
  return rule.oneShot && rule.firedAt != null;
}

/**
 * Is this child on its parent's own setting?
 *
 * True for a child as RiverGaugeAlerts creates it: a condition rule with the
 * parent's kind and the parent's one-time flag. The server asks the same
 * question, of the same columns, to decide which children a change to the
 * river alert carries to — see the save_river_alert database function.
 */
export function sharesParentSetting(child: AlertRule, parent: AlertRule): boolean {
  return (
    child.mode === 'condition' &&
    (child.conditionKind ?? 'all') === (parent.conditionKind ?? 'all') &&
    child.oneShot === parent.oneShot
  );
}

/**
 * Does this child still do exactly what its parent does?
 *
 * On its parent's setting, on, and not spent. Anything else was changed after
 * it was created — or, for a one-time alert, has already sent — and a row that
 * folded it into "Main gauge + Sullivan" would be claiming a setting it no
 * longer has or coverage that is not happening.
 *
 * The parent's `enabled` is deliberately NOT part of this. A paused parent
 * still covers the same stations; what it is not doing is watching any of
 * them, and the row says that once, for all of them.
 */
export function followsParent(child: AlertRule, parent: AlertRule): boolean {
  return child.enabled && sharesParentSetting(child, parent) && !isSpent(child);
}

/** What an edit to a river alert changes about its setting. */
export interface ParentSettingChange {
  conditionKind?: AlertRule['conditionKind'];
  oneShot?: boolean;
  /** Clear a spent one-time alert so it can send again. */
  rearm?: boolean;
}

/**
 * The list as it will read once a river alert's new setting is saved.
 *
 * The server carries a change of setting to the gauges that were on the old
 * one, in the same request (the save_river_alert database function). This
 * is the app's guess at that result, applied before the response so the
 * covered gauges do not flash out into exception rows and back. It is a GUESS:
 * the caller refetches afterwards and the server's copy wins.
 *
 * Only the children change here. The parent's own fields are the caller's to
 * patch, as for any other rule.
 */
export function applyParentChange(
  rules: AlertRule[],
  parent: AlertRule,
  change: ParentSettingChange,
): AlertRule[] {
  if (parent.source !== 'river_condition') return rules;
  const nextKind =
    change.conditionKind != null && change.conditionKind !== (parent.conditionKind ?? 'all')
      ? change.conditionKind
      : null;
  const nextOneShot =
    change.oneShot !== undefined && change.oneShot !== parent.oneShot ? change.oneShot : null;
  if (nextKind === null && nextOneShot === null && !change.rearm) return rules;

  return rules.map((rule) => {
    if (rule.source !== 'gauge' || rule.parentId !== parent.id) return rule;
    if (!sharesParentSetting(rule, parent)) return rule;
    const comesBack = isSpent(rule) && (change.rearm === true || nextOneShot === false);
    return {
      ...rule,
      ...(nextKind !== null ? { conditionKind: nextKind } : {}),
      ...(nextOneShot !== null ? { oneShot: nextOneShot } : {}),
      ...(comesBack ? { firedAt: null, lastTriggeredAt: null, enabled: true } : {}),
    };
  });
}

/** The children of a river alert that a change to its setting would reach. */
export function followersOf(rules: AlertRule[], parent: AlertRule): AlertRule[] {
  if (parent.source !== 'river_condition') return [];
  return rules.filter(
    (rule) =>
      rule.source === 'gauge' && rule.parentId === parent.id && sharesParentSetting(rule, parent),
  );
}

export interface AlertGroupCoverage {
  /** Children folded into the parent's row. Server order. */
  covered: AlertRule[];
  /** Children that differ from the parent and keep a row under it. */
  separate: AlertRule[];
}

/**
 * A group's children, split into the ones the parent's row speaks for and the
 * ones that need a row of their own.
 *
 * Every child lands in exactly one list: a child in neither would be an alert
 * the screen never mentions, which is the failure groupAlertRules itself is
 * careful about.
 */
export function groupCoverage(group: AlertRuleGroup): AlertGroupCoverage {
  const covered: AlertRule[] = [];
  const separate: AlertRule[] = [];
  for (const child of group.children) {
    (followsParent(child, group.rule) ? covered : separate).push(child);
  }
  return { covered, separate };
}

/**
 * A station, named by the part of its name that tells it from its neighbours.
 *
 * "Meramec River near Sullivan, MO" under a row already titled Meramec River is
 * three words of repetition around one word of information. Drops the state
 * suffix and the leading water name, and keeps "above"/"below" because they are
 * part of where the station is: "above Akers" and "Akers" are different places.
 *
 * Falls back to the whole name whenever the shape is not the one it knows —
 * a longer label is a cosmetic problem, a wrong one is not.
 */
export function stationShortName(gaugeName: string | null | undefined): string {
  const full = (gaugeName ?? '').trim();
  if (!full) return 'another gauge';
  const withoutState = full.replace(/,\s*[A-Z]{2}\.?$/, '');
  const match = /^.+?\s+(near|nr|at|above|below)\s+(.+)$/i.exec(withoutState);
  if (!match) return withoutState;
  const preposition = match[1].toLowerCase();
  const place = match[2].trim();
  if (!place) return withoutState;
  return preposition === 'above' || preposition === 'below' ? `${preposition} ${place}` : place;
}

/** Past this many extra stations the row counts them instead of naming them. */
const MAX_NAMED_STATIONS = 3;

/**
 * Which gauges a river alert covers, for its row: "Main gauge + Sullivan".
 *
 * Null when the alert is only the main gauge — the ordinary case, and the row
 * already says everything by carrying the river's name.
 *
 * "Main gauge" rather than the primary station's name because that is what the
 * edit screen calls it, and because the river rule does not carry the name.
 */
export function coverageLine(covered: AlertRule[]): string | null {
  if (covered.length === 0) return null;
  if (covered.length > MAX_NAMED_STATIONS) return `Main gauge + ${covered.length} more gauges`;
  const names = covered.map((rule) => stationShortName(rule.gaugeName));
  const listed =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `Main gauge + ${listed}`;
}

/** The most recent thing a river alert's row can report. */
export type GroupActivity =
  | { type: 'sent'; at: string }
  | { type: 'trigger'; at: string; station: AlertRule };

/**
 * The latest of: the river alert SENDING, or a covered gauge MEETING ITS
 * TRIGGER.
 *
 * Two different facts, kept apart on purpose. A river alert's `lastTriggeredAt`
 * is written by delivery, once a notification has gone out. A gauge rule's is
 * written by the evaluator when the reading crosses — before quiet hours, the
 * pause gate and the push itself have had their say — so it can be true of a
 * crossing nobody was told about. The first version of this folded both into
 * one "Last sent", and a river row claimed a notification that quiet hours had
 * suppressed.
 *
 * The covered stations no longer have rows of their own, so the river's row is
 * where a crossing at one of them is reported — as a crossing.
 */
export function groupLastActivity(parent: AlertRule, covered: AlertRule[]): GroupActivity | null {
  let latest: GroupActivity | null = null;
  let latestMs = Number.NEGATIVE_INFINITY;
  const consider = (at: string | null, make: (at: string) => GroupActivity) => {
    if (!at) return;
    const ms = new Date(at).getTime();
    if (Number.isNaN(ms) || ms <= latestMs) return;
    latest = make(at);
    latestMs = ms;
  };
  consider(parent.lastTriggeredAt, (at) => ({ type: 'sent', at }));
  for (const station of covered) {
    consider(station.lastTriggeredAt, (at) => ({ type: 'trigger', at, station }));
  }
  return latest;
}

/**
 * How many rows the Mine list draws for these groups.
 *
 * A river alert with three gauges folded into it is one row, and a count of
 * four over a list of one reads as three alerts missing.
 */
export function visibleRuleCount(groups: AlertRuleGroup[]): number {
  return groups.reduce((total, group) => total + 1 + groupCoverage(group).separate.length, 0);
}

/**
 * The first covered station the alert engine cannot currently read, if any.
 *
 * A stale station is armed and cannot fire. When it had its own row the row
 * said so; folded into the parent, the parent has to, or the list would report
 * a stretch as covered while every pass skips it.
 */
export function staleCoveredStation(covered: AlertRule[]): AlertRule | null {
  return covered.find((rule) => rule.readingStale === true) ?? null;
}
