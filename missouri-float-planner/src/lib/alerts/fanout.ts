// src/lib/alerts/fanout.ts
// Decides WHO gets pushed about WHAT. Pure and I/O-free: the delivery cron does
// the querying and sending, this module owns every policy decision, so the
// rules can be tested exhaustively without a database or a network.

import { kindRequiresEntitlement, isPushableKind, type EventKind } from './event-kind';
import type { ExpoMessage } from '@/lib/push/expo';

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
  | 'not_entitled'
  | 'cooldown'
  | 'no_active_token';

export interface FanoutPlan {
  messages: PlannedMessage[];
  /** Subscription ids whose one_shot was consumed — stamp fired_at on success. */
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
    case 'flowing': return 'ideal';
    case 'good': return 'floatable';
    case 'high': return 'high water';
    case 'dangerous': return 'dangerous';
    case 'low': return 'low';
    case 'too_low': return 'too low';
    default: return code;
  }
}

export function buildNotification(event: FanoutEvent): { title: string; body: string } {
  const river = event.river_name ?? 'Your river';
  switch (event.kind) {
    case 'floatable':
      return {
        title: `${river} is floatable`,
        // Never promise instant: USGS lag plus the cron cadence means alerts
        // land roughly 20-75 minutes behind the real transition.
        body: `Conditions just came up to ${conditionPhrase(event.new_condition_code)}. Check the latest reading before you go.`,
      };
    case 'warning':
      return {
        title: event.new_condition_code === 'dangerous'
          ? `${river}: dangerous water`
          : `${river}: high water`,
        body: `Conditions changed to ${conditionPhrase(event.new_condition_code)}. Planning aid only — verify locally before floating.`,
      };
    case 'easing':
      return {
        title: `${river} is easing`,
        body: `Dropped from dangerous to ${conditionPhrase(event.new_condition_code)}. Still elevated — verify locally.`,
      };
    default:
      return { title: river, body: `Conditions changed to ${conditionPhrase(event.new_condition_code)}.` };
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
  /** Users with an active entitlement, resolved via isEntitlementActive. */
  entitledUserIds: Set<string>;
  recentDeliveries?: RecentDelivery[];
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

      // Safety warnings are FREE. Condition information — including
      // "dangerous" — is never paywalled; the paid product is the floatability
      // translation, not the hazard.
      if (kindRequiresEntitlement(event.kind) && !input.entitledUserIds.has(sub.user_id)) {
        bump('not_entitled');
        continue;
      }

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
