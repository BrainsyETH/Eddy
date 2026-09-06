// GET /api/me/alert-events — what happened to your gauge alerts this week.
//
// ── Why this exists ─────────────────────────────────────────────────────────
// The app used to promise that anything quiet hours held back "will still be in
// the Alerts feed". That feed was replaced by a statewide high-water snapshot,
// which a falling river never appears in — so a "drops below 3 ft" that crossed
// at 2am left no trace anywhere the user could look. This is the per-user
// record: every evaluation that owed a notification, with the outcome the drain
// recorded, including the ones that never reached a phone.
//
// Gauge alerts only. River condition subscriptions are fanned out from a global
// outbox (river_condition_events) with no per-user row until delivery, so their
// history is a different join; it can be added here without changing the shape.
//
// Read-only, authenticated, rate-limited per user like /api/me/gauge-alerts.
// Seven days, newest first, capped at 50 — the same bound the change log used.

import { NextRequest, NextResponse } from 'next/server';
import { jsonPrivate } from '@/lib/api-utils';
import { rateLimit } from '@/lib/rate-limit';
import { requireUser } from '@/lib/supabase/request';
import type {
  AlertComparator,
  AlertEventEntry,
  AlertEventsResponse,
  AlertMetric,
  AlertRuleMode,
  AlertSubscriptionKind,
} from '@/types/api';

const WINDOW_DAYS = 7;
const MAX_ROWS = 50;

/** PostgREST types a to-one embed as an array; at runtime it is one object. */
function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function toNum(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

interface EventRow {
  id: string;
  subscription_id: string;
  kind: AlertEventEntry['kind'];
  reading_value: number | string | null;
  reading_unit: 'ft' | 'cfs' | null;
  reading_at: string | null;
  condition_code: string | null;
  detected_at: string;
  push_delivered_at: string | null;
  suppressed_reason: 'quiet_hours' | null;
  rearmed_at: string | null;
  gauge_stations: { name: string } | { name: string }[] | null;
  rivers: { name: string } | { name: string }[] | null;
  gauge_alert_subscriptions:
    | {
        scope: 'river' | 'gauge';
        mode: AlertRuleMode;
        condition_kind: AlertSubscriptionKind | null;
        metric: AlertMetric | null;
        comparator: AlertComparator | null;
        threshold_value: number | string | null;
        threshold_value_max: number | string | null;
      }
    | {
        scope: 'river' | 'gauge';
        mode: AlertRuleMode;
        condition_kind: AlertSubscriptionKind | null;
        metric: AlertMetric | null;
        comparator: AlertComparator | null;
        threshold_value: number | string | null;
        threshold_value_max: number | string | null;
      }[]
    | null;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;
    const { supabase, user } = auth;

    // Keyed on the user, never the IP — carrier NAT collapses thousands of
    // phones into one address. Same budget as the rules list.
    const limited = await rateLimit(`me-alert-events-read:${user.id}`, 120, 15 * 60 * 1000);
    if (limited) return limited;

    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('gauge_alert_events')
      .select(
        'id, subscription_id, kind, reading_value, reading_unit, reading_at, condition_code, ' +
          'detected_at, push_delivered_at, suppressed_reason, rearmed_at, ' +
          'gauge_stations(name), rivers(name), ' +
          'gauge_alert_subscriptions!inner(scope, mode, condition_kind, metric, comparator, threshold_value, threshold_value_max)',
      )
      .eq('user_id', user.id)
      .gte('detected_at', since)
      .order('detected_at', { ascending: false })
      .limit(MAX_ROWS);

    if (error) {
      console.error('Error listing alert events:', error);
      return jsonPrivate({ error: 'Could not load alert activity' }, { status: 500 });
    }

    const rows = (data ?? []) as unknown as EventRow[];

    // "Sent" means a ticket came back ok for at least one of the user's devices.
    // push_delivered_at alone cannot say that: the drain stamps it for expired
    // and undeliverable events too, so it means "no longer owed", not "arrived".
    const sentEvents = new Set<string>();
    if (rows.length > 0) {
      const { data: deliveries } = await supabase
        .from('alert_push_deliveries')
        .select('event_id')
        .eq('event_source', 'gauge_alert')
        .eq('status', 'sent')
        .in(
          'event_id',
          rows.map((r) => r.id),
        );
      for (const d of deliveries ?? []) sentEvents.add(d.event_id as string);
    }

    const events: AlertEventEntry[] = rows.flatMap((row) => {
      const rule = one(row.gauge_alert_subscriptions);
      if (!rule) return [];
      const status: AlertEventEntry['status'] = row.suppressed_reason
        ? 'suppressed'
        : sentEvents.has(row.id)
          ? 'sent'
          : row.push_delivered_at
            ? 'not_delivered'
            : 'pending';
      return [
        {
          id: row.id,
          subscriptionId: row.subscription_id,
          scope: rule.scope,
          kind: row.kind,
          riverName: one(row.rivers)?.name ?? null,
          gaugeName: one(row.gauge_stations)?.name ?? null,
          readingValue: toNum(row.reading_value),
          readingUnit: row.reading_unit,
          conditionCode: row.condition_code,
          readingAt: row.reading_at,
          detectedAt: row.detected_at,
          status,
          suppressedReason: row.suppressed_reason,
          rearmedAt: row.rearmed_at,
          rule: {
            mode: rule.mode,
            conditionKind: rule.condition_kind,
            metric: rule.metric,
            comparator: rule.comparator,
            thresholdValue: toNum(rule.threshold_value),
            thresholdValueMax: toNum(rule.threshold_value_max),
          },
        },
      ];
    });

    const response: AlertEventsResponse = { events };
    return jsonPrivate(response);
  } catch (error) {
    console.error('Error listing alert events:', error);
    return jsonPrivate({ error: 'Internal server error' }, { status: 500 });
  }
}
