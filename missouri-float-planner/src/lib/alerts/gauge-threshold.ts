// src/lib/alerts/gauge-threshold.ts
// Decides whether a per-gauge alert rule has just come true. Pure and I/O-free:
// the evaluation cron does the querying and writing, this module owns every
// policy decision, so the rules can be tested exhaustively without a database.
//
// Sibling of fanout.ts, and deliberately a different shape. That module answers
// "who wants to hear about this event?" because a river condition transition is
// one fact shared by every subscriber. Here there is no shared fact — "above
// 3.0 ft" and "above 4.2 ft" cross at different readings — so each rule is
// evaluated against the reading on its own, and the recipient is already known.
//
// ── The four things that stop this from becoming a spam machine ─────────────
//
//  1. EDGE TRIGGER. A rule fires on outside → inside, never for merely being
//     inside. Without it a river that came up on Friday would notify every
//     15 minutes until it dropped.
//  2. HYSTERESIS. Re-arming requires clearing the boundary by a margin, so a
//     gauge sitting at exactly 3.00 ft cannot oscillate across it and fire
//     repeatedly on sensor noise.
//  3. COOLDOWN, per rule. Held on the subscription row rather than in
//     alert_push_deliveries: that ledger's cooldown index is keyed on
//     (user, river, kind), and a national-tier rule has no river, so every such
//     rule would share one bucket and four gauges would mute each other.
//  4. SEEDED STATE. A rule is born knowing which side it is on — see the POST
//     route — so creating "above 3 ft" on water already at 5.2 ft does not fire
//     instantly at someone describing what they can already see.

import { classifyReading, hasLadder, type ConditionThresholds } from '@shared/condition-ladder';
import { classifyEventKind, isPushableKind } from './event-kind';
import { subscriptionKindsFor } from './fanout';
import { gateReading } from './gate';
import { describeAlertRule, formatAlertValue } from './rule-copy';
import type {
  AlertComparator,
  AlertMetric,
  AlertRuleMode,
  AlertSubscriptionKind,
} from '@/types/api';

/** Don't re-fire the same RULE within this window, whatever the water does. */
export const GAUGE_ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

/**
 * How far past its boundary a reading must fall before the rule re-arms,
 * as a fraction of the threshold plus an absolute floor.
 *
 * The fraction alone is useless at small numbers (2% of 0.5 ft is a centimetre,
 * well inside sensor noise) and the floor alone is useless at large ones
 * (0.05 is nothing against 12,000 cfs), so it is the larger of the two.
 */
export const HYSTERESIS_FRACTION = 0.02;
export const HYSTERESIS_MIN_FT = 0.05;
export const HYSTERESIS_MIN_CFS = 1;

export type CrossingState = 'inside' | 'outside';

/** This table's own kind, plus the three borrowed from river_condition_events. */
export type GaugeEventKind = 'threshold' | 'floatable' | 'warning' | 'easing';

/** A row of gauge_alert_subscriptions, snake_cased as it comes off PostgREST. */
export interface GaugeAlertSubscription {
  id: string;
  user_id: string;
  gauge_station_id: string;
  river_id: string | null;
  mode: AlertRuleMode;
  condition_kind: AlertSubscriptionKind | null;
  metric: AlertMetric | null;
  comparator: AlertComparator | null;
  threshold_value: number | null;
  threshold_value_max: number | null;
  enabled: boolean;
  one_shot: boolean;
  last_state: CrossingState | null;
  last_value: number | null;
  last_reading_at: string | null;
  last_triggered_at: string | null;
  /**
   * Set only when a push for this rule actually reached a device.
   *
   * The ONLY thing that spends a one-shot. last_triggered_at cannot do this job
   * — it is stamped here at evaluation, two crons before delivery, so reading it
   * spent a rule whose notification failed every attempt or was dropped by quiet
   * hours. See docs/decisions/0005-gauge-alert-one-shot-spend.md.
   */
  one_shot_fired_at: string | null;
  last_condition_code: string | null;
  /**
   * The river alert this rule was created from, when it was created from one.
   *
   * NOT read by the planner. It is read by the evaluator BEFORE the planner —
   * a rule whose parent is paused is filtered out of the pass entirely, so
   * anything reaching planGaugeAlerts is already known to be live. Declared
   * here because the row carries it and a shape that omitted it would make the
   * cast at the load site a lie. See src/lib/alerts/gating.ts.
   */
  parent_subscription_id?: string | null;
}

/** The newest reading for one station, from either tier. */
export interface StationReading {
  gauge_station_id: string;
  gauge_height_ft: number | null;
  discharge_cfs: number | null;
  qualifiers: string[] | null;
  reading_at: string | null;
  provider?: string | null;
}

/** The river_gauges ladder a condition-mode rule grades against. */
export type LadderRow = ConditionThresholds;

export interface FiredAlert {
  subscription_id: string;
  user_id: string;
  gauge_station_id: string;
  river_id: string | null;
  kind: GaugeEventKind;
  reading_value: number | null;
  reading_unit: 'ft' | 'cfs' | null;
  reading_at: string | null;
  condition_code: string | null;
}

/** What the cron writes back onto the subscription after a pass. */
export interface StateUpdate {
  id: string;
  last_state: CrossingState | null;
  last_value: number | null;
  last_reading_at: string | null;
  last_evaluated_at: string;
  last_condition_code: string | null;
  /** Present only when the rule fired. */
  last_triggered_at?: string;
}

export type GaugeSkipReason =
  | 'disabled'
  | 'no_reading'
  | 'no_new_reading'
  | 'gated'
  | 'no_ladder'
  | 'seeding'
  | 'no_crossing'
  | 'not_pushable_kind'
  | 'kind_not_wanted'
  | 'one_shot_spent'
  | 'cooldown';

export interface EvalResult {
  fired: FiredAlert | null;
  state: StateUpdate | null;
  skip: GaugeSkipReason | null;
}

export interface GaugeAlertPlan {
  fired: FiredAlert[];
  stateUpdates: StateUpdate[];
  skipped: Partial<Record<GaugeSkipReason, number>>;
}

/** The series a threshold rule measures, as the gate and ladder spell it. */
export function metricUnit(metric: AlertMetric | null): 'ft' | 'cfs' {
  return metric === 'discharge_cfs' ? 'cfs' : 'ft';
}

export function hysteresisFor(threshold: number, metric: AlertMetric | null): number {
  const floor = metricUnit(metric) === 'cfs' ? HYSTERESIS_MIN_CFS : HYSTERESIS_MIN_FT;
  return Math.max(Math.abs(threshold) * HYSTERESIS_FRACTION, floor);
}

/** Which side of its threshold a reading sits on, ignoring hysteresis. */
export function thresholdState(
  sub: Pick<GaugeAlertSubscription, 'comparator' | 'threshold_value' | 'threshold_value_max'>,
  value: number,
): CrossingState {
  const low = sub.threshold_value;
  if (low == null) return 'outside';

  switch (sub.comparator) {
    case 'below':
      return value < low ? 'inside' : 'outside';
    case 'between': {
      const high = sub.threshold_value_max;
      if (high == null) return value > low ? 'inside' : 'outside';
      return value >= low && value <= high ? 'inside' : 'outside';
    }
    default:
      return value > low ? 'inside' : 'outside';
  }
}

/**
 * The state to store, with hysteresis applied.
 *
 * Arming (outside → inside) is immediate: the user asked to be told the moment
 * the river crossed, and a margin there would delay the alert they wanted.
 * Only LEAVING is damped, because leaving is what re-arms the rule, and a rule
 * that re-arms on noise fires on noise.
 */
export function nextCrossingState(
  sub: Pick<
    GaugeAlertSubscription,
    'comparator' | 'threshold_value' | 'threshold_value_max' | 'metric' | 'last_state'
  >,
  value: number,
): CrossingState {
  const raw = thresholdState(sub, value);
  if (sub.last_state !== 'inside' || raw === 'inside') return raw;

  const low = sub.threshold_value;
  if (low == null) return raw;
  const band = hysteresisFor(low, sub.metric);

  switch (sub.comparator) {
    case 'below':
      // Inside means below `low`; to leave, clear it upward by the band.
      return value >= low + band ? 'outside' : 'inside';
    case 'between': {
      const high = sub.threshold_value_max;
      if (high == null) return value <= low - band ? 'outside' : 'inside';
      if (value <= low - hysteresisFor(low, sub.metric)) return 'outside';
      if (value >= high + hysteresisFor(high, sub.metric)) return 'outside';
      return 'inside';
    }
    default:
      // Inside means above `low`; to leave, drop below it by the band.
      return value <= low - band ? 'outside' : 'inside';
  }
}

// Quiet hours used to live here, which is what kept them out of the river
// delivery pass — see the header of src/lib/alerts/quiet-hours.ts. Both passes
// now import that module directly.

function conditionPhrase(code: string): string {
  switch (code) {
    case 'flowing': return 'flowing';
    case 'good': return 'floatable';
    case 'high': return 'high water';
    case 'dangerous': return 'dangerous';
    case 'low': return 'low';
    case 'too_low': return 'too low';
    default: return code;
  }
}

export interface GaugeNotificationInput {
  stationName: string;
  riverName: string | null;
  kind: GaugeEventKind;
  readingValue: number | null;
  readingUnit: 'ft' | 'cfs' | null;
  conditionCode: string | null;
  rule: Parameters<typeof describeAlertRule>[0];
}

export function buildGaugeNotification(input: GaugeNotificationInput): {
  title: string;
  body: string;
} {
  // The river when we know it, because that is what the user calls the water.
  // The station name is the fallback and the only option on the national tier.
  const target = input.riverName ?? input.stationName;

  if (input.kind === 'threshold') {
    const metric: AlertMetric =
      input.readingUnit === 'cfs' ? 'discharge_cfs' : 'gauge_height_ft';
    const reading =
      input.readingValue != null ? formatAlertValue(input.readingValue, metric) : null;

    return {
      title: reading ? `${target} is at ${reading}` : `${target} hit your alert level`,
      // Reads back the rule so the notification explains itself. Someone with
      // several alerts on one river cannot otherwise tell which one fired.
      body: `You asked to be told ${describeAlertRule(input.rule)} — it just did. Readings can lag the river, so verify locally before you go.`,
    };
  }

  const code = input.conditionCode ?? 'unknown';
  switch (input.kind) {
    case 'floatable':
      return {
        title: `${target} is floatable`,
        body: `Conditions just came up to ${conditionPhrase(code)}. Check the latest reading before you go.`,
      };
    case 'warning':
      return {
        title: code === 'dangerous' ? `${target}: dangerous water` : `${target}: high water`,
        body: `Conditions changed to ${conditionPhrase(code)}. Planning aid only — verify locally before floating.`,
      };
    default:
      return {
        title: `${target} is easing`,
        body: `Dropped from dangerous to ${conditionPhrase(code)}. Still elevated — verify locally.`,
      };
  }
}

export interface EvalInput {
  sub: GaugeAlertSubscription;
  reading: StationReading | undefined;
  ladder: LadderRow | null;
  now: Date;
  cooldownMs?: number;
}

export function evaluateSubscription(input: EvalInput): EvalResult {
  const { sub, reading, ladder, now } = input;
  const cooldownMs = input.cooldownMs ?? GAUGE_ALERT_COOLDOWN_MS;
  const skip = (reason: GaugeSkipReason): EvalResult => ({ fired: null, state: null, skip: reason });

  if (!sub.enabled) return skip('disabled');
  if (!reading) return skip('no_reading');

  // Nothing has been published since the last look. The national tier refreshes
  // hourly while this cron runs every 15 minutes, so re-reading an identical row
  // is the ordinary case, not an anomaly.
  if (reading.reading_at && reading.reading_at === sub.last_reading_at) {
    return skip('no_new_reading');
  }

  const unit: 'ft' | 'cfs' =
    sub.mode === 'threshold' ? metricUnit(sub.metric) : (ladder?.thresholdUnit ?? 'ft');

  if (sub.mode === 'condition' && (!ladder || !hasLadder(ladder))) {
    // A station with no rated ladder cannot produce a verdict. This is the
    // national tier's permanent state and is not an error.
    return skip('no_ladder');
  }

  // The same gate the river path runs. `recentPrimaryValues` is deliberately
  // not supplied: gauge_latest holds one row per station with no history, and
  // gate.ts's own note says flatline detection only belongs where a transition
  // is in play with a series to check it against.
  const gate = gateReading({
    gaugeHeightFt: reading.gauge_height_ft,
    dischargeCfs: reading.discharge_cfs,
    thresholdUnit: unit,
    floodStageFt: ladder?.floodStageFt ?? null,
    qualifiers: reading.qualifiers,
    readingAt: reading.reading_at,
    provider: reading.provider ?? 'usgs',
    now,
  });
  if (!gate.ok) return skip('gated');

  const cooledDown =
    sub.last_triggered_at != null &&
    now.getTime() - new Date(sub.last_triggered_at).getTime() < cooldownMs;
  // NOT last_triggered_at, which this function is about to stamp itself. A rule
  // is spent by DELIVERY, which happens two crons after this runs and is
  // recorded by the delivery pass.
  const oneShotSpent = sub.one_shot && sub.one_shot_fired_at != null;

  const baseState: StateUpdate = {
    id: sub.id,
    last_state: sub.last_state,
    last_value: sub.last_value,
    last_reading_at: reading.reading_at,
    last_evaluated_at: now.toISOString(),
    last_condition_code: sub.last_condition_code,
  };

  // ── Condition mode ────────────────────────────────────────────────────────
  if (sub.mode === 'condition') {
    const newCode = classifyReading(
      reading.gauge_height_ft,
      ladder as ConditionThresholds,
      reading.discharge_cfs,
      // Never grade one unit's number against the other's thresholds.
      { strictUnit: true },
    );
    // last_value tracked here too, not just in threshold mode. It is not read
    // by the evaluator — the verdict is — but it is what a support question
    // ("why did this fire?") is answered from, and a column that is right for
    // one mode and stale for the other is worse than one that is always null.
    const state: StateUpdate = { ...baseState, last_value: gate.value, last_condition_code: newCode };
    const oldCode = sub.last_condition_code;

    // First look: record the verdict without announcing it. "unknown → good" is
    // initialization, not news — the same rule classifyEventKind applies.
    if (!oldCode || newCode === 'unknown') return { fired: null, state, skip: 'seeding' };
    if (newCode === oldCode) return { fired: null, state, skip: 'no_crossing' };

    const kind = classifyEventKind(oldCode, newCode);
    if (!isPushableKind(kind)) return { fired: null, state, skip: 'not_pushable_kind' };
    if (!subscriptionKindsFor(kind).includes(sub.condition_kind ?? 'all')) {
      return { fired: null, state, skip: 'kind_not_wanted' };
    }
    // Checked AFTER the state update is decided so a suppressed rule still
    // tracks the river. Otherwise a rule cooled down through a dangerous spell
    // would come out of it still believing the water was low.
    if (oneShotSpent) return { fired: null, state, skip: 'one_shot_spent' };
    if (cooledDown) return { fired: null, state, skip: 'cooldown' };

    return {
      fired: {
        subscription_id: sub.id,
        user_id: sub.user_id,
        gauge_station_id: sub.gauge_station_id,
        river_id: sub.river_id,
        kind: kind as GaugeEventKind,
        reading_value: gate.value,
        reading_unit: unit,
        reading_at: reading.reading_at,
        condition_code: newCode,
      },
      state: { ...state, last_triggered_at: now.toISOString() },
      skip: null,
    };
  }

  // ── Threshold mode ────────────────────────────────────────────────────────
  // floodOverrideOnly means the primary series is dead and only the stage-vs-
  // flood-stage override let the reading through. There is no number to compare
  // against the user's, so there is nothing to decide.
  if (gate.value == null) return skip('gated');

  const value = gate.value;
  const nextState = nextCrossingState(sub, value);
  const state: StateUpdate = { ...baseState, last_state: nextState, last_value: value };

  // No seeded state (a row written outside the POST route). Record which side
  // it is on and wait for a real crossing.
  if (sub.last_state == null) return { fired: null, state, skip: 'seeding' };
  if (!(sub.last_state === 'outside' && nextState === 'inside')) {
    return { fired: null, state, skip: 'no_crossing' };
  }
  if (oneShotSpent) return { fired: null, state, skip: 'one_shot_spent' };
  if (cooledDown) return { fired: null, state, skip: 'cooldown' };

  return {
    fired: {
      subscription_id: sub.id,
      user_id: sub.user_id,
      gauge_station_id: sub.gauge_station_id,
      river_id: sub.river_id,
      kind: 'threshold',
      reading_value: value,
      reading_unit: unit,
      reading_at: reading.reading_at,
      condition_code: null,
    },
    state: { ...state, last_triggered_at: now.toISOString() },
    skip: null,
  };
}

export interface PlanInput {
  subscriptions: GaugeAlertSubscription[];
  /** Keyed by gauge_station_id. */
  readings: Map<string, StationReading>;
  /** Keyed by `${river_id}:${gauge_station_id}`; condition mode only. */
  ladders: Map<string, LadderRow>;
  now?: Date;
  cooldownMs?: number;
}

/** The ladder key. Exported so the cron builds the map the same way. */
export function ladderKey(riverId: string | null, gaugeStationId: string): string {
  return `${riverId ?? ''}:${gaugeStationId}`;
}

export function planGaugeAlerts(input: PlanInput): GaugeAlertPlan {
  const now = input.now ?? new Date();
  const fired: FiredAlert[] = [];
  const stateUpdates: StateUpdate[] = [];
  const skipped: Partial<Record<GaugeSkipReason, number>> = {};

  for (const sub of input.subscriptions) {
    const result = evaluateSubscription({
      sub,
      reading: input.readings.get(sub.gauge_station_id),
      ladder: input.ladders.get(ladderKey(sub.river_id, sub.gauge_station_id)) ?? null,
      now,
      cooldownMs: input.cooldownMs,
    });

    if (result.fired) fired.push(result.fired);
    if (result.state) stateUpdates.push(result.state);
    if (result.skip) skipped[result.skip] = (skipped[result.skip] ?? 0) + 1;
  }

  return { fired, stateUpdates, skipped };
}
