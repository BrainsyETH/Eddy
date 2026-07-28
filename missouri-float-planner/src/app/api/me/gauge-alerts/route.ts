// src/app/api/me/gauge-alerts/route.ts
// GET  /api/me/gauge-alerts — list the caller's per-gauge rules
// POST /api/me/gauge-alerts — create one
//
// The per-gauge half of alerting. River CONDITION alerts still live at
// /api/me/alert-subscriptions and are fanned out from a global outbox; anything
// with a user-defined level, and anything anchored to a station rather than a
// river, is created here. /api/me/alerts serves the merged view.
//
// Nothing here is entitlement-gated, for the reason set out at length in the
// header of /api/me/alert-subscriptions: alerting is free in its entirety, and
// splitting the alert engine along a paid boundary is what once produced a
// warning that was nominally free and structurally unreachable.
//
// A PERMANENT user is still required to write, and that is not a tier — push
// needs a durable identity to route to, an anonymous id is replaced on
// reinstall, and the RLS policy in migration 00200 enforces it independently.
//
// ── Why POST seeds the rule's crossing state ────────────────────────────────
//
// Rules are edge-triggered: they fire when the river crosses, not while it sits
// on the far side. A rule created with no state would therefore either fire on
// the very next cron pass — telling someone who just typed "above 3 ft" about a
// river they can see is already at 5.2 — or, if the evaluator seeded it itself,
// silently swallow a crossing that happened in between. Seeding here closes
// both, and returning the seed lets the app SAY so instead of looking broken.

import { NextRequest, NextResponse } from 'next/server';
import { jsonPrivate } from '@/lib/api-utils';
import { rateLimit } from '@/lib/rate-limit';
import { requirePermanentUser, requireUser } from '@/lib/supabase/request';
import { GAUGE_ALERT_SELECT, toGaugeRule, sortRules, type GaugeAlertRow } from '@/lib/alerts/rule-serialize';
import { seedCrossingState } from '@/lib/alerts/rule-seed';
import type { AlertComparator, AlertMetric, AlertRulesResponse } from '@/types/api';

export const dynamic = 'force-dynamic';

const VALID_MODES = ['condition', 'threshold'] as const;
const VALID_SCOPES = ['river', 'gauge'] as const;
const VALID_KINDS = ['floatable', 'safety', 'all'] as const;
const VALID_METRICS: readonly AlertMetric[] = ['gauge_height_ft', 'discharge_cfs'];
const VALID_COMPARATORS: readonly AlertComparator[] = ['above', 'below', 'between'];

/**
 * Rules per user.
 *
 * Bounds the evaluation cron, which reads every enabled rule on every pass, and
 * bounds notification volume for the user themselves. Twenty-five is well past
 * what anyone floats and well short of what would make a pass expensive.
 */
export const MAX_RULES_PER_USER = 25;

/** USGS parameter code for discharge. A station without it reports no cfs. */
const DISCHARGE_PARAMETER = '00060';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;
    const { supabase, user } = auth;

    // Keyed on the USER, never the IP: carrier NAT collapses thousands of
    // mobile subscribers into one bucket, so a per-IP limit would throttle a
    // whole network because one person's client misbehaved.
    const limited = await rateLimit(`me-gauge-alerts-read:${user.id}`, 120, 15 * 60 * 1000);
    if (limited) return limited;

    const { data, error } = await supabase
      .from('gauge_alert_subscriptions')
      .select(GAUGE_ALERT_SELECT)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error listing gauge alerts:', error);
      return jsonPrivate({ error: 'Could not load alerts' }, { status: 500 });
    }

    const response: AlertRulesResponse = {
      rules: sortRules(((data ?? []) as unknown as GaugeAlertRow[]).map(toGaugeRule)),
    };
    return jsonPrivate(response);
  } catch (error) {
    console.error('Error listing gauge alerts:', error);
    return jsonPrivate({ error: 'Internal server error' }, { status: 500 });
  }
}

interface CreateBody {
  gaugeStationId?: string;
  usgsSiteId?: string;
  riverId?: string;
  riverSlug?: string;
  scope?: string;
  mode?: string;
  conditionKind?: string;
  metric?: string;
  comparator?: string;
  thresholdValue?: number;
  thresholdValueMax?: number;
  oneShot?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    // 401 (no token) and 403 (anonymous) come back ready to send; the app maps
    // 403 to a sign-in sheet.
    const auth = await requirePermanentUser(request);
    if (auth instanceof NextResponse) return auth;
    const { supabase, user } = auth;

    const limited = await rateLimit(`me-gauge-alerts-write:${user.id}`, 60, 15 * 60 * 1000);
    if (limited) return limited;

    const body = (await request.json().catch(() => null)) as CreateBody | null;
    if (!body) return jsonPrivate({ error: 'Body required' }, { status: 400 });

    const mode = (body.mode ?? 'threshold') as (typeof VALID_MODES)[number];
    if (!VALID_MODES.includes(mode)) {
      return jsonPrivate({ error: `mode must be one of ${VALID_MODES.join(', ')}` }, { status: 400 });
    }
    const scope = (body.scope ?? 'gauge') as (typeof VALID_SCOPES)[number];
    if (!VALID_SCOPES.includes(scope)) {
      return jsonPrivate({ error: `scope must be one of ${VALID_SCOPES.join(', ')}` }, { status: 400 });
    }

    // ── Resolve the station ────────────────────────────────────────────────
    let stationId = body.gaugeStationId ?? null;
    let station: {
      id: string;
      curated: boolean;
      provider: string | null;
      parameter_codes: string[] | null;
    } | null = null;

    {
      const query = supabase
        .from('gauge_stations')
        .select('id, curated, provider, parameter_codes');
      const { data } = stationId
        ? await query.eq('id', stationId).maybeSingle()
        : body.usgsSiteId
          ? await query.eq('usgs_site_id', body.usgsSiteId).maybeSingle()
          : { data: null };
      station = data;
    }
    if (!station) {
      return jsonPrivate({ error: 'Gauge not found' }, { status: 404 });
    }
    stationId = station.id;

    // ── Resolve the river ──────────────────────────────────────────────────
    let riverId = body.riverId ?? null;
    if (!riverId && body.riverSlug) {
      const { data: river } = await supabase
        .from('rivers')
        .select('id')
        .eq('slug', body.riverSlug)
        .maybeSingle();
      riverId = river?.id ?? null;
    }
    if (scope === 'river' && !riverId) {
      return jsonPrivate({ error: 'riverId or riverSlug required for a river alert' }, { status: 400 });
    }

    // ── Mode-specific validation ───────────────────────────────────────────
    const insert: Record<string, unknown> = {
      user_id: user.id,
      gauge_station_id: stationId,
      river_id: riverId,
      scope,
      mode,
      one_shot: body.oneShot ?? false,
    };

    if (mode === 'condition') {
      const kind = (body.conditionKind ?? 'all') as (typeof VALID_KINDS)[number];
      if (!VALID_KINDS.includes(kind)) {
        return jsonPrivate({ error: `conditionKind must be one of ${VALID_KINDS.join(', ')}` }, { status: 400 });
      }
      if (!riverId) {
        return jsonPrivate({ error: 'A condition alert needs a river to grade against' }, { status: 400 });
      }
      // The ladder has to exist, or the rule can never say anything. This is
      // the national tier's permanent state — 16,500 stations Eddy issues no
      // verdict on — so it is a 422 about the gauge, not a 400 about the body.
      const { data: pairing } = await supabase
        .from('river_gauges')
        .select('id')
        .eq('river_id', riverId)
        .eq('gauge_station_id', stationId)
        .maybeSingle();
      if (!pairing) {
        return jsonPrivate(
          { error: 'Eddy does not rate this gauge for that river. Set your own level instead.', code: 'no_ladder' },
          { status: 422 }
        );
      }
      insert.condition_kind = kind;
    } else {
      const metric = (body.metric ?? 'gauge_height_ft') as AlertMetric;
      if (!VALID_METRICS.includes(metric)) {
        return jsonPrivate({ error: `metric must be one of ${VALID_METRICS.join(', ')}` }, { status: 400 });
      }
      const comparator = (body.comparator ?? 'above') as AlertComparator;
      if (!VALID_COMPARATORS.includes(comparator)) {
        return jsonPrivate({ error: `comparator must be one of ${VALID_COMPARATORS.join(', ')}` }, { status: 400 });
      }

      const value = Number(body.thresholdValue);
      if (!Number.isFinite(value)) {
        return jsonPrivate({ error: 'thresholdValue must be a number' }, { status: 400 });
      }
      let valueMax: number | null = null;
      if (comparator === 'between') {
        valueMax = Number(body.thresholdValueMax);
        if (!Number.isFinite(valueMax) || valueMax <= value) {
          return jsonPrivate(
            { error: 'thresholdValueMax must be greater than thresholdValue' },
            { status: 400 }
          );
        }
      }

      // A cfs rule on a stage-only station can never fire, and would look to the
      // user exactly like a river that never rose. Checked here because the
      // gate downstream would silently skip it forever.
      if (
        metric === 'discharge_cfs' &&
        station.parameter_codes != null &&
        !station.parameter_codes.includes(DISCHARGE_PARAMETER)
      ) {
        return jsonPrivate(
          { error: 'This gauge does not report discharge. Set a gauge height instead.', code: 'no_discharge' },
          { status: 422 }
        );
      }

      insert.metric = metric;
      insert.comparator = comparator;
      insert.threshold_value = value;
      insert.threshold_value_max = valueMax;
    }

    // ── Caps and duplicates ────────────────────────────────────────────────
    const { count } = await supabase
      .from('gauge_alert_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id);

    if ((count ?? 0) >= MAX_RULES_PER_USER) {
      return jsonPrivate(
        { error: `You can have up to ${MAX_RULES_PER_USER} alerts. Delete one to add another.`, code: 'limit_reached' },
        { status: 409 }
      );
    }

    // A condition rule on a river the user already has a river alert for would
    // notify twice about the same transition. Refused rather than silently
    // deduplicated at send time: the user should know they already have it.
    if (mode === 'condition' && riverId) {
      const { data: existing } = await supabase
        .from('alert_subscriptions')
        .select('id')
        .eq('user_id', user.id)
        .eq('river_id', riverId)
        .maybeSingle();
      if (existing) {
        return jsonPrivate(
          { error: 'You already have condition alerts on for this river.', code: 'duplicate_river_alert' },
          { status: 409 }
        );
      }
    }

    // ── Seed, then insert ──────────────────────────────────────────────────
    const seed = await seedCrossingState(supabase, {
      gaugeStationId: stationId,
      riverId,
      mode,
      metric: (insert.metric as AlertMetric) ?? null,
      comparator: (insert.comparator as AlertComparator) ?? null,
      thresholdValue: (insert.threshold_value as number) ?? null,
      thresholdValueMax: (insert.threshold_value_max as number) ?? null,
    });

    insert.last_state = seed.state;
    insert.last_value = seed.value;
    insert.last_reading_at = seed.readingAt;
    insert.last_condition_code = seed.conditionCode;
    insert.last_evaluated_at = new Date().toISOString();

    const { data: saved, error } = await supabase
      .from('gauge_alert_subscriptions')
      .insert(insert)
      .select(GAUGE_ALERT_SELECT)
      .single();

    if (error) {
      // 23505 = the dedupe index in 00200. Re-creating an identical rule is a
      // double tap, not a failure worth an error screen.
      if (error.code === '23505') {
        return jsonPrivate({ error: 'You already have this alert.', code: 'duplicate' }, { status: 409 });
      }
      if (error.code === '23503') {
        return jsonPrivate({ error: 'Gauge or river not found' }, { status: 404 });
      }
      console.error('Error creating gauge alert:', error);
      return jsonPrivate({ error: 'Could not save alert' }, { status: 500 });
    }

    return jsonPrivate({
      rule: toGaugeRule(saved as unknown as GaugeAlertRow),
      seed: { value: seed.value, unit: seed.unit, readingAt: seed.readingAt, state: seed.state },
    });
  } catch (error) {
    console.error('Error creating gauge alert:', error);
    return jsonPrivate({ error: 'Internal server error' }, { status: 500 });
  }
}
