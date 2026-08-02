// src/lib/alerts/rule-serialize.ts
// Two tables in, one AlertRule out.
//
// The split between alert_subscriptions and gauge_alert_subscriptions is a
// storage decision (migration 00200 explains it), and every client that had to
// know about it would have to reimplement the routing rule to list, pause or
// delete anything. So it is normalized here, once, and `source` is the only
// trace of it that leaves the server.

import type { AlertRule, AlertSubscriptionKind, AlertMetric, AlertComparator } from '@/types/api';

/** PostgREST types a to-one embed as an array; at runtime it is one object. */
export function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** numeric(12,2) arrives as a string. "9.00" > "10.00" if left that way. */
function num(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

interface RiverEmbed {
  name: string;
  slug: string;
}

interface StationEmbed {
  name: string;
  usgs_site_id: string | null;
  site_id_external: string | null;
  curated: boolean;
}

export interface GaugeAlertRow {
  id: string;
  river_id: string | null;
  gauge_station_id: string;
  scope: 'river' | 'gauge';
  mode: 'condition' | 'threshold';
  condition_kind: AlertSubscriptionKind | null;
  metric: AlertMetric | null;
  comparator: AlertComparator | null;
  threshold_value: number | string | null;
  threshold_value_max: number | string | null;
  enabled: boolean;
  one_shot: boolean;
  last_triggered_at: string | null;
  one_shot_fired_at: string | null;
  parent_subscription_id: string | null;
  created_at: string;
  rivers?: RiverEmbed | RiverEmbed[] | null;
  gauge_stations?: StationEmbed | StationEmbed[] | null;
}

/** The columns every gauge-alert read needs. Keep the routes using one list. */
export const GAUGE_ALERT_SELECT =
  'id, river_id, gauge_station_id, scope, mode, condition_kind, metric, comparator, ' +
  'threshold_value, threshold_value_max, enabled, one_shot, last_triggered_at, ' +
  'one_shot_fired_at, parent_subscription_id, created_at, ' +
  'rivers(name, slug), gauge_stations!inner(name, usgs_site_id, site_id_external, curated)';

export function toGaugeRule(row: GaugeAlertRow): AlertRule {
  const river = one(row.rivers);
  const station = one(row.gauge_stations);

  return {
    id: row.id,
    source: 'gauge',
    scope: row.scope,
    mode: row.mode,
    riverId: row.river_id,
    riverName: river?.name ?? null,
    riverSlug: river?.slug ?? null,
    gaugeId: row.gauge_station_id,
    gaugeName: station?.name ?? null,
    // The provider-native id, which is what /gauge/[siteId] routes on — NOT
    // gauge_station_id, which is our own uuid. A USACE or NWS station has no
    // usgs_site_id and carries site_id_external instead.
    usgsSiteId: station?.usgs_site_id ?? station?.site_id_external ?? null,
    curated: station?.curated ?? false,
    conditionKind: row.condition_kind,
    metric: row.metric,
    comparator: row.comparator,
    thresholdValue: num(row.threshold_value),
    thresholdValueMax: num(row.threshold_value_max),
    enabled: row.enabled,
    oneShot: row.one_shot,
    // firedAt means DELIVERED, which is also what spends the rule — so a rule
    // the app shows as fired is exactly a rule that will not fire again.
    // Reading last_triggered_at here showed "fired" for a rule whose push never
    // landed and which was, correctly, still armed.
    //
    // Two columns rather than one, against this file's own earlier argument,
    // because they record different facts: last_triggered_at is "evaluated
    // true" and owns the cooldown, one_shot_fired_at is "reached a device".
    firedAt: row.one_shot ? row.one_shot_fired_at : null,
    lastTriggeredAt: row.last_triggered_at,
    // The river alert this belongs to, when it was made from one. The app draws
    // it nested under that alert and greys it out while the parent is paused —
    // which is the only honest thing to draw, because `enabled` above is still
    // true and the rule still will not fire. See migration
    // 20260802143000_gauge_alert_parent_subscription.sql.
    parentId: row.parent_subscription_id ?? null,
    createdAt: row.created_at,
  };
}

export interface RiverAlertRow {
  id: string;
  river_id: string;
  kind: AlertSubscriptionKind;
  one_shot: boolean;
  fired_at: string | null;
  enabled: boolean;
  created_at: string;
  rivers?: RiverEmbed | RiverEmbed[] | null;
}

export const RIVER_ALERT_SELECT =
  'id, river_id, kind, one_shot, fired_at, enabled, created_at, rivers!inner(name, slug)';

export function toRiverRule(row: RiverAlertRow): AlertRule {
  const river = one(row.rivers);

  return {
    id: row.id,
    source: 'river_condition',
    scope: 'river',
    // A river subscription is always Eddy's verdict. A river rule with a custom
    // level is not stored here at all — it lives in gauge_alert_subscriptions
    // against the river's primary station, with scope 'river'.
    mode: 'condition',
    riverId: row.river_id,
    riverName: river?.name ?? null,
    riverSlug: river?.slug ?? null,
    // Deliberately null rather than the river's primary station. This rule is
    // fanned out from a river condition event and is not tied to one gauge; if
    // the primary pairing changes, the alert follows the river.
    gaugeId: null,
    gaugeName: null,
    usgsSiteId: null,
    // Wired to a river, therefore curated by definition (migration 00196).
    curated: true,
    conditionKind: row.kind,
    metric: null,
    comparator: null,
    thresholdValue: null,
    thresholdValueMax: null,
    enabled: row.enabled ?? true,
    oneShot: row.one_shot,
    firedAt: row.fired_at,
    lastTriggeredAt: row.fired_at,
    // A river alert is what other rules are parented TO. It never has one.
    parentId: null,
    createdAt: row.created_at,
  };
}

/** Newest first, so the manage list opens on what the user just made. */
export function sortRules(rules: AlertRule[]): AlertRule[] {
  return [...rules].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}
