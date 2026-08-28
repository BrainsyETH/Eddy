// src/lib/alerts/fanout.ts
// Decides WHO gets pushed about WHAT. Pure and I/O-free: the delivery cron does
// the querying and sending, this module owns every policy decision, so the
// rules can be tested exhaustively without a database or a network.

import { isPushableKind, type EventKind } from './event-kind';
import { suppressedByQuietHours } from './quiet-hours';
import type { ExpoMessage } from '@/lib/push/expo';
import type { NotificationPreferences } from '@/types/api';

/** Default: don't re-notify the same user about the same river+kind within 4h. */
export const PUSH_COOLDOWN_MS = 4 * 60 * 60 * 1000;

export interface FanoutEvent {
  id: string;
  river_id: string;
  kind: EventKind;
  new_condition_code: string;
  old_condition_code: string;
  river_name?: string | null;
  river_slug?: string | null;
  reading_at?: string | null;
  /**
   * WHICH GAUGE MOVED, and what it said.
   *
   * river_condition_events has carried river_gauge_id, reading_value and
   * reading_unit since it was created; nothing read them out, so an alert could
   * only ever say "the Current River is running high" and leave the recipient
   * with no way to check the claim. A river can have half a dozen pairings
   * reading very differently — see the Jacks Fork, floatable at one gauge and
   * too low at another — so "which one" is not a detail.
   *
   * All three are optional and independently nullable. The gauge is enrichment,
   * never a precondition for delivering a safety notification: `readingSuffix`
   * below emits nothing rather than a partial sentence.
   */
  gauge_name?: string | null;
  reading_value?: number | null;
  reading_unit?: string | null;
}

export interface FanoutSubscription {
  id: string;
  user_id: string;
  river_id: string;
  /** alert_subscriptions vocabulary — narrower than the event vocabulary. */
  kind: 'floatable' | 'safety' | 'all';
  one_shot: boolean;
  fired_at: string | null;
}

export interface FanoutToken {
  id: string;
  user_id: string;
  expo_push_token: string;
  disabled_at: string | null;
}

/** A prior send, used for the cooldown. */
export interface RecentDelivery {
  user_id: string;
  river_id: string | null;
  kind: string;
  sent_at: string;
}

export interface PlannedMessage {
  message: ExpoMessage;
  eventId: string;
  deviceTokenId: string;
  userId: string;
  riverId: string;
  kind: EventKind;
  subscriptionId: string;
}

export type SkipReason =
  | 'not_pushable_kind'
  | 'no_subscription'
  | 'one_shot_spent'
  | 'quiet_hours'
  | 'cooldown'
  | 'no_active_token';

export interface FanoutPlan {
  messages: PlannedMessage[];
  /**
   * One-shot subscriptions this plan produced messages FOR — candidates to
   * spend, not a record that anything was spent.
   *
   * The distinction is the whole point and it was read the wrong way once:
   * planning is not delivering, so the caller must intersect this with its own
   * per-subscription success tally before stamping fired_at. Spending a
   * one-shot on a send that failed burns the user's single notification about a
   * river AND, because the next pass then skips the subscription, strands the
   * event itself.
   */
  oneShotSubscriptionIds: string[];
  skipped: Partial<Record<SkipReason, number>>;
}

/**
 * Which subscription kinds want this event.
 *
 * The two vocabularies deliberately differ: events describe what happened,
 * subscriptions describe what a user asked for.
 */
export function subscriptionKindsFor(kind: EventKind): Array<'floatable' | 'safety' | 'all'> {
  switch (kind) {
    case 'floatable':
      return ['floatable', 'all'];
    case 'warning':
    case 'easing':
      return ['safety', 'all'];
    default:
      // recovery / info are recorded for the free feed but never pushed.
      return [];
  }
}

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

/**
 * " Reading 3,100 cfs at Black River at Poplar Bluff." or an empty string.
 *
 * ALL OR NOTHING, on purpose. A gauge with no reading ("at Poplar Bluff" alone)
 * invites the recipient to assume a number we did not send; a reading with no
 * gauge is the ambiguity this was added to remove. Either the sentence can name
 * both, or it says nothing and the notification reads exactly as it did before.
 */
function readingSuffix(event: FanoutEvent): string {
  const { gauge_name: gauge, reading_value: value, reading_unit: unit } = event;
  if (!gauge || value == null || !Number.isFinite(value) || !unit) return '';

  // Whole numbers for cfs, one decimal for feet — the precision each is read at
  // on the gauge screen, so the notification and the screen agree.
  const isFeet = unit === 'ft';
  const reading = isFeet
    ? `${value.toFixed(1)} ft`
    : `${Math.round(value).toLocaleString('en-US')} ${unit}`;

  return ` Reading ${reading} at ${gauge}.`;
}

export function buildNotification(event: FanoutEvent): { title: string; body: string } {
  const river = event.river_name ?? 'Your river';
  const reading = readingSuffix(event);
  switch (event.kind) {
    case 'floatable':
      return {
        title: `${river} is floatable`,
        // Never promise instant: USGS lag plus the cron cadence means alerts
        // land roughly 20-75 minutes behind the real transition.
        body: `Conditions just came up to ${conditionPhrase(event.new_condition_code)}.${reading} Check the latest reading before you go.`,
      };
    case 'warning':
      return {
        title: event.new_condition_code === 'dangerous'
          ? `${river}: dangerous water`
          : `${river}: high water`,
        body: `Conditions changed to ${conditionPhrase(event.new_condition_code)}.${reading} Planning aid only — verify locally before floating.`,
      };
    case 'easing':
      return {
        title: `${river} is easing`,
        body: `Dropped from dangerous to ${conditionPhrase(event.new_condition_code)}.${reading} Still elevated — verify locally.`,
      };
    default:
      return { title: river, body: `Conditions changed to ${conditionPhrase(event.new_condition_code)}.${reading}` };
  }
}

/** Deterministic spread so one river's subscribers aren't sent contiguously. */
function interleaveByRiver(messages: PlannedMessage[]): PlannedMessage[] {
  const byRiver = new Map<string, PlannedMessage[]>();
  for (const m of messages) {
    const bucket = byRiver.get(m.riverId);
    if (bucket) bucket.push(m);
    else byRiver.set(m.riverId, [m]);
  }
  const buckets = [...byRiver.values()];
  const out: PlannedMessage[] = [];
  let index = 0;
  while (out.length < messages.length) {
    let moved = false;
    for (const bucket of buckets) {
      if (index < bucket.length) {
        out.push(bucket[index]);
        moved = true;
      }
    }
    if (!moved) break;
    index++;
  }
  return out;
}

// Safety first: a warning must never queue behind a backlog of floatable news.
const KIND_PRIORITY: Record<string, number> = { warning: 0, easing: 1, floatable: 2 };

export interface PlanInput {
  events: FanoutEvent[];
  subscriptions: FanoutSubscription[];
  tokens: FanoutToken[];
  recentDeliveries?: RecentDelivery[];
  /**
   * Quiet-hours settings per user id, for the subscribers in this pass.
   *
   * Optional, and a MISSING user means no window rather than a closed one —
   * most people have no preferences row, and defaulting the other way would
   * silence everybody who has never opened the settings screen.
   */
  preferences?: Map<string, NotificationPreferences>;
  now?: Date;
  cooldownMs?: number;
}

export function planDeliveries(input: PlanInput): FanoutPlan {
  const now = input.now ?? new Date();
  const cooldownMs = input.cooldownMs ?? PUSH_COOLDOWN_MS;
  const skipped: Partial<Record<SkipReason, number>> = {};
  const bump = (reason: SkipReason) => {
    skipped[reason] = (skipped[reason] ?? 0) + 1;
  };

  const tokensByUser = new Map<string, FanoutToken[]>();
  for (const token of input.tokens) {
    if (token.disabled_at) continue;
    const bucket = tokensByUser.get(token.user_id);
    if (bucket) bucket.push(token);
    else tokensByUser.set(token.user_id, [token]);
  }

  const subsByRiver = new Map<string, FanoutSubscription[]>();
  for (const sub of input.subscriptions) {
    const bucket = subsByRiver.get(sub.river_id);
    if (bucket) bucket.push(sub);
    else subsByRiver.set(sub.river_id, [sub]);
  }

  // Most recent send per (user, river, kind).
  const lastSent = new Map<string, number>();
  for (const d of input.recentDeliveries ?? []) {
    const key = `${d.user_id}|${d.river_id}|${d.kind}`;
    const at = new Date(d.sent_at).getTime();
    if (!lastSent.has(key) || at > (lastSent.get(key) ?? 0)) lastSent.set(key, at);
  }

  const planned: PlannedMessage[] = [];
  const oneShotSubscriptionIds = new Set<string>();

  for (const event of input.events) {
    if (!isPushableKind(event.kind)) {
      bump('not_pushable_kind');
      continue;
    }

    const wanted = subscriptionKindsFor(event.kind);
    const candidates = (subsByRiver.get(event.river_id) ?? []).filter((s) =>
      wanted.includes(s.kind)
    );
    if (candidates.length === 0) {
      bump('no_subscription');
      continue;
    }

    const notification = buildNotification(event);

    for (const sub of candidates) {
      // A spent one-shot stays spent until the user re-arms it.
      if (sub.one_shot && sub.fired_at) {
        bump('one_shot_spent');
        continue;
      }

      // ── The user's own night ────────────────────────────────────────────
      //
      // Checked HERE, at planning, for the same reason the gauge pass checks it
      // at delivery rather than at evaluation: the event is written either way,
      // so the Alerts feed still shows what happened in the morning even though
      // the phone stayed silent. Suppressing earlier would advance the rule's
      // state with nothing recorded and cost the user both.
      //
      // This is the check that did not exist. Everything about quiet hours —
      // the settings screen, the row on the Alerts tab, the copy promising a
      // window — governed the gauge pass alone, while river subscriptions, the
      // commonest alert in the app, woke people at 3am regardless.
      //
      // Skipped WITHOUT touching the cooldown below, which is only stamped for
      // a message actually planned: a push nobody was sent must not also eat
      // the four-hour window that would have carried the next one.
      if (suppressedByQuietHours(input.preferences?.get(sub.user_id) ?? null, event.kind, now)) {
        bump('quiet_hours');
        continue;
      }

      // No entitlement check. Alerting is free in its entirety — see the header
      // of /api/me/alert-subscriptions for why the tier was collapsed rather
      // than arbitrated. Holding a subscription IS the permission to be pushed.
      const cooldownKey = `${sub.user_id}|${event.river_id}|${event.kind}`;
      const previous = lastSent.get(cooldownKey);
      if (previous !== undefined && now.getTime() - previous < cooldownMs) {
        bump('cooldown');
        continue;
      }

      const userTokens = tokensByUser.get(sub.user_id) ?? [];
      if (userTokens.length === 0) {
        bump('no_active_token');
        continue;
      }

      for (const token of userTokens) {
        planned.push({
          message: {
            to: token.expo_push_token,
            title: notification.title,
            body: notification.body,
            sound: 'default',
            priority: event.kind === 'warning' ? 'high' : 'default',
            data: {
              eventId: event.id,
              riverId: event.river_id,
              riverSlug: event.river_slug ?? null,
              kind: event.kind,
              condition: event.new_condition_code,
              // The rule that fired, so the tap can offer a way to MANAGE it.
              // A push used to land on the river screen with no path back to
              // the thing that buzzed the phone — pausing it took four hops
              // through the Alerts tab. `alertSource` rides along because the
              // two rule tables share an id space only by accident: the app
              // addresses a rule as (id, source) everywhere (alertRuleKey),
              // and an id alone can resolve to the wrong table.
              alertId: sub.id,
              alertSource: 'river_condition',
            },
          },
          eventId: event.id,
          deviceTokenId: token.id,
          userId: sub.user_id,
          riverId: event.river_id,
          kind: event.kind,
          subscriptionId: sub.id,
        });
      }

      // Suppress duplicates for this user within the same pass.
      lastSent.set(cooldownKey, now.getTime());
      if (sub.one_shot) oneShotSubscriptionIds.add(sub.id);
    }
  }

  // Safety kinds first, then interleave within a kind so a single river's
  // subscribers don't form one contiguous burst.
  const byKind = new Map<string, PlannedMessage[]>();
  for (const m of planned) {
    const bucket = byKind.get(m.kind);
    if (bucket) bucket.push(m);
    else byKind.set(m.kind, [m]);
  }
  const messages = [...byKind.entries()]
    .sort((a, b) => (KIND_PRIORITY[a[0]] ?? 9) - (KIND_PRIORITY[b[0]] ?? 9))
    .flatMap(([, group]) => interleaveByRiver(group));

  return { messages, oneShotSubscriptionIds: [...oneShotSubscriptionIds], skipped };
}
