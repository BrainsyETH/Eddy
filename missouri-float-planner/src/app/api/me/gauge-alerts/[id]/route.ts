// src/app/api/me/gauge-alerts/[id]/route.ts
// PATCH  /api/me/gauge-alerts/[id] — edit, pause, or re-arm one rule
// DELETE /api/me/gauge-alerts/[id]
//
// Ownership is enforced by RLS (migration 00200), not by the .eq('user_id')
// filters below — those are for clarity and for returning 404 rather than a
// silent no-op. See the header of src/lib/supabase/request.ts.

import { NextRequest, NextResponse } from 'next/server';
import { jsonPrivate } from '@/lib/api-utils';
import { rateLimit } from '@/lib/rate-limit';
import { requirePermanentUser, requireUser } from '@/lib/supabase/request';
import { GAUGE_ALERT_SELECT, toGaugeRule, type GaugeAlertRow } from '@/lib/alerts/rule-serialize';
import { seedCrossingState } from '@/lib/alerts/rule-seed';
import type { AlertComparator, AlertMetric } from '@/types/api';

export const dynamic = 'force-dynamic';

const VALID_KINDS = ['floatable', 'safety', 'all'];
const VALID_METRICS: readonly AlertMetric[] = ['gauge_height_ft', 'discharge_cfs'];
const VALID_COMPARATORS: readonly AlertComparator[] = ['above', 'below', 'between'];

interface PatchBody {
  enabled?: boolean;
  oneShot?: boolean;
  conditionKind?: string;
  metric?: string;
  comparator?: string;
  thresholdValue?: number;
  thresholdValueMax?: number;
  /** Clear a spent one-shot so it can fire again. */
  rearm?: boolean;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requirePermanentUser(request);
    if (auth instanceof NextResponse) return auth;
    const { supabase, user } = auth;

    const limited = await rateLimit(`me-gauge-alerts-write:${user.id}`, 60, 15 * 60 * 1000);
    if (limited) return limited;

    const { id } = await params;
    const body = (await request.json().catch(() => null)) as PatchBody | null;
    if (!body) return jsonPrivate({ error: 'Body required' }, { status: 400 });

    const { data: existing } = await supabase
      .from('gauge_alert_subscriptions')
      .select('id, gauge_station_id, river_id, mode, metric, comparator, threshold_value, threshold_value_max')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!existing) return jsonPrivate({ error: 'Alert not found' }, { status: 404 });

    const update: Record<string, unknown> = {};
    if (typeof body.enabled === 'boolean') update.enabled = body.enabled;
    if (typeof body.oneShot === 'boolean') update.one_shot = body.oneShot;

    if (existing.mode === 'condition') {
      if (body.conditionKind !== undefined) {
        if (!VALID_KINDS.includes(body.conditionKind)) {
          return jsonPrivate({ error: `conditionKind must be one of ${VALID_KINDS.join(', ')}` }, { status: 400 });
        }
        update.condition_kind = body.conditionKind;
      }
    } else if (
      body.metric !== undefined ||
      body.comparator !== undefined ||
      body.thresholdValue !== undefined ||
      body.thresholdValueMax !== undefined
    ) {
      const metric = (body.metric ?? existing.metric) as AlertMetric;
      if (!VALID_METRICS.includes(metric)) {
        return jsonPrivate({ error: `metric must be one of ${VALID_METRICS.join(', ')}` }, { status: 400 });
      }
      const comparator = (body.comparator ?? existing.comparator) as AlertComparator;
      if (!VALID_COMPARATORS.includes(comparator)) {
        return jsonPrivate({ error: `comparator must be one of ${VALID_COMPARATORS.join(', ')}` }, { status: 400 });
      }

      const value = Number(body.thresholdValue ?? existing.threshold_value);
      if (!Number.isFinite(value)) {
        return jsonPrivate({ error: 'thresholdValue must be a number' }, { status: 400 });
      }
      let valueMax: number | null = null;
      if (comparator === 'between') {
        valueMax = Number(body.thresholdValueMax ?? existing.threshold_value_max);
        if (!Number.isFinite(valueMax) || valueMax <= value) {
          return jsonPrivate(
            { error: 'thresholdValueMax must be greater than thresholdValue' },
            { status: 400 }
          );
        }
      }

      update.metric = metric;
      update.comparator = comparator;
      update.threshold_value = value;
      update.threshold_value_max = valueMax;

      // MOVING THE THRESHOLD RE-SEEDS THE RULE. The stored last_state describes
      // the old number and means nothing against the new one — a rule edited
      // from "above 3" to "above 6" while the river sat at 4 would still read
      // `inside` and could never fire again until the water dropped past 6.
      const seed = await seedCrossingState(supabase, {
        gaugeStationId: existing.gauge_station_id,
        riverId: existing.river_id,
        mode: 'threshold',
        metric,
        comparator,
        thresholdValue: value,
        thresholdValueMax: valueMax,
      });
      update.last_state = seed.state;
      update.last_value = seed.value;
      update.last_reading_at = seed.readingAt;
      update.last_evaluated_at = new Date().toISOString();
    }

    // Re-arming clears the spend, and with it the cooldown — the user has just
    // said they want this again, which outranks a timer meant to protect them
    // from a flapping gauge.
    // BOTH: one_shot_fired_at is what spends the rule, last_triggered_at is
    // what holds the cooldown. Clearing only one leaves the rule either armed
    // but suppressed, or spent but un-suppressed — neither is "I want this
    // again".
    if (body.rearm) {
      update.last_triggered_at = null;
      update.one_shot_fired_at = null;
    }

    if (Object.keys(update).length === 0) {
      return jsonPrivate({ error: 'Nothing to update' }, { status: 400 });
    }

    const { data: saved, error } = await supabase
      .from('gauge_alert_subscriptions')
      .update(update)
      .eq('id', id)
      .eq('user_id', user.id)
      .select(GAUGE_ALERT_SELECT)
      .single();

    if (error) {
      if (error.code === '23505') {
        return jsonPrivate({ error: 'You already have this alert.', code: 'duplicate' }, { status: 409 });
      }
      console.error('Error updating gauge alert:', error);
      return jsonPrivate({ error: 'Could not update alert' }, { status: 500 });
    }

    return jsonPrivate({ rule: toGaugeRule(saved as unknown as GaugeAlertRow), seed: null });
  } catch (error) {
    console.error('Error updating gauge alert:', error);
    return jsonPrivate({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // requireUser, not requirePermanentUser: turning an alert OFF must never be
    // the thing that demands a sign-in. Same asymmetry as the river route.
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;
    const { supabase, user } = auth;

    const limited = await rateLimit(`me-gauge-alerts-write:${user.id}`, 60, 15 * 60 * 1000);
    if (limited) return limited;

    const { id } = await params;
    const { error } = await supabase
      .from('gauge_alert_subscriptions')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting gauge alert:', error);
      return jsonPrivate({ error: 'Could not delete alert' }, { status: 500 });
    }

    return jsonPrivate({ ok: true, id });
  } catch (error) {
    console.error('Error deleting gauge alert:', error);
    return jsonPrivate({ error: 'Internal server error' }, { status: 500 });
  }
}
