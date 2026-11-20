// src/lib/alerts/main-gauge.ts
// A gauge added to a river alert that has since become that river's MAIN gauge.
//
// A river alert is evaluated from the river's primary gauge: update-gauges
// records a river condition transition only for the river_gauges row with
// is_primary, and the river alert fans out from that event. The gauges someone
// adds on the river alert's edit screen are per-gauge rules
// (gauge_alert_subscriptions rows with parent_subscription_id) for the OTHER
// gauges on the river.
//
// Primary flags move. Migrations 20261117225734 and 20261118214137 moved
// is_primary on some rivers without touching those rules, so a gauge someone
// added as "also tell me about this one" can now be the gauge the river alert
// itself watches. Both fire for the same change, a minute or two apart, and the
// editor cannot help: it draws the primary row as "The main gauge — this is
// what the alert above watches" with its switch locked, so the extra rule is
// invisible there and cannot be removed.
//
// ── Suppressed, not dropped ─────────────────────────────────────────────────
//
// Such a rule still goes through the planner, so its crossing state keeps
// following the water. Only its notification is withheld (and its cooldown not
// started). Dropping it from the pass, as the parent gate does, would freeze
// that state, and if the primary flag ever moved back the first pass would
// announce whatever changed in between.
//
// ── Fails open ──────────────────────────────────────────────────────────────
//
// Either lookup failing means nothing is suppressed. The cost is the duplicate
// this exists to stop; the alternative is a flood warning withheld because a
// second query hiccupped. Same rule as gating.ts.
//
// Checked at evaluation only. deliver-push does not repeat it, so an event
// queued in the minutes before a primary flag moves can still go out once;
// primary flags move by reviewed migration, not by the minute.
//
// No data cleanup here. Counting and removing the affected rows is a separate,
// reviewed step.

import type { GaugeAlertPlan, GaugeAlertSubscription } from './gauge-threshold';
import { logger } from '@/lib/logger';

/** Ids per `in` filter, bounded by the request line's length. */
const CHUNK = 200;

/** What the evaluator needs to know about each parent river alert. */
export interface ParentAlerts {
  /** Parents that are switched off (paused, or a spent one-time alert). */
  paused: Set<string>;
  /** Parent id → the river it alerts on. */
  riverOf: Map<string, string>;
}

/**
 * Every parent river alert of these rules: which are paused, and their river.
 *
 * A failed read returns what it has so far. An id it could not resolve is
 * absent from both, which ungates the child and suppresses nothing — see
 * isRuleLive on why failing open is right here.
 */
export async function loadParentAlerts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  parentIds: readonly string[],
): Promise<ParentAlerts> {
  const out: ParentAlerts = { paused: new Set(), riverOf: new Map() };
  for (let from = 0; from < parentIds.length; from += CHUNK) {
    const { data, error } = await supabase
      .from('alert_subscriptions')
      .select('id, river_id, enabled')
      .in('id', parentIds.slice(from, from + CHUNK));
    if (error) {
      logger.error('[evaluate-gauge-alerts] could not read parent alerts', error);
      return out;
    }
    for (const row of (data ?? []) as Array<{ id: string; river_id: string | null; enabled: boolean }>) {
      if (row.enabled === false) out.paused.add(row.id);
      if (row.river_id) out.riverOf.set(row.id, row.river_id);
    }
  }
  return out;
}

function pairKey(riverId: string, stationId: string): string {
  return `${riverId}:${stationId}`;
}

/** The (river, station) pairs that are each river's primary gauge now. */
export async function loadMainGauges(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  riverIds: readonly string[],
): Promise<Set<string>> {
  const out = new Set<string>();
  const ids = [...new Set(riverIds)];
  for (let from = 0; from < ids.length; from += CHUNK) {
    const { data, error } = await supabase
      .from('river_gauges')
      .select('river_id, gauge_station_id')
      .in('river_id', ids.slice(from, from + CHUNK))
      .eq('is_primary', true);
    if (error) {
      logger.error('[evaluate-gauge-alerts] could not read main gauges; nothing suppressed', error);
      return new Set();
    }
    for (const row of (data ?? []) as Array<{ river_id: string; gauge_station_id: string }>) {
      out.add(pairKey(row.river_id, row.gauge_station_id));
    }
  }
  return out;
}

/**
 * Is this rule a gauge added to a river alert that is now the river's main gauge?
 *
 * Condition rules only. A threshold rule ("above 4 ft") at the main gauge is a
 * different trigger from the river alert's condition change, not a duplicate.
 */
export function coveredByMainGauge(
  rule: Pick<GaugeAlertSubscription, 'mode' | 'gauge_station_id' | 'parent_subscription_id'>,
  riverOf: ReadonlyMap<string, string>,
  mainGauges: ReadonlySet<string>,
): boolean {
  if (rule.mode !== 'condition' || !rule.parent_subscription_id) return false;
  const river = riverOf.get(rule.parent_subscription_id);
  return river != null && mainGauges.has(pairKey(river, rule.gauge_station_id));
}

/**
 * The plan with these rules' notifications withheld.
 *
 * Their state updates are kept, minus the cooldown stamp, so the rule tracks
 * the water without having "fired".
 */
export function withoutCovered(plan: GaugeAlertPlan, covered: ReadonlySet<string>): GaugeAlertPlan & { covered: number } {
  if (covered.size === 0) return { ...plan, covered: 0 };
  const fired = plan.fired.filter((alert) => !covered.has(alert.subscription_id));
  const stateUpdates = plan.stateUpdates.map((update) => {
    if (!covered.has(update.id) || update.last_triggered_at === undefined) return update;
    const kept = { ...update };
    delete kept.last_triggered_at;
    return kept;
  });
  return { ...plan, fired, stateUpdates, covered: plan.fired.length - fired.length };
}
