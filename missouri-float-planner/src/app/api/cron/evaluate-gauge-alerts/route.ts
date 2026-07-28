// src/app/api/cron/evaluate-gauge-alerts/route.ts
// GET/POST /api/cron/evaluate-gauge-alerts — turn per-gauge rules into outbox rows.
//
// A SEPARATE route from update-gauges, for the reason that file's own header
// gives about deliver-push: it already spends up to 30s on enrichment plus
// awaited LLM regens inside a 60s ceiling, so anything appended to it is the
// first thing killed. It is also separate from sync-gauge-latest, which is a
// ~2.5 minute national pass — waiting on that would put every curated alert an
// hour behind the readings it is grading.
//
// ── Why this does not scale with gauge_stations ─────────────────────────────
//
// There are ~16,500 stations and a rule may target any of them, which sounds
// like a per-pass cost nobody wants every 15 minutes. It is not: the only
// stations read are the ones somebody is actually subscribed to, via the
// partial index idx_gas_enabled_station. A pass costs what users have asked
// for, not what USGS publishes.
//
// ── This route does not send ────────────────────────────────────────────────
//
// It writes gauge_alert_events and stops. deliver-push drains that table on its
// own five-minute schedule with the retry, ledger and receipt machinery already
// built for the river path. Sending inline would couple detection to delivery,
// and Vercel crons never retry.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasValidMachineBearer } from '@/lib/security/machine-auth';
import { tryCronLock, releaseCronLock } from '@/lib/social/cron-lock';
import { loadLatestReadings } from '@/lib/alerts/gauge-readings';
import {
  ladderKey,
  planGaugeAlerts,
  type GaugeAlertSubscription,
  type LadderRow,
  type StateUpdate,
} from '@/lib/alerts/gauge-threshold';
import { toNum } from '@/lib/utils/num';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const LOCK_JOB = 'evaluate_gauge_alerts';
const LOCK_STALE_SECONDS = 90;

/** PostgREST caps a page at 1,000 rows; paging is not optional above that. */
const PAGE = 1000;
/** State writes run in small parallel batches rather than one at a time. */
const WRITE_CONCURRENCY = 10;

const SUBSCRIPTION_COLUMNS =
  'id, user_id, gauge_station_id, river_id, mode, condition_kind, metric, comparator, ' +
  'threshold_value, threshold_value_max, enabled, one_shot, last_state, last_value, ' +
  'last_reading_at, last_triggered_at, last_condition_code';

/**
 * Every enabled rule.
 *
 * ORDER IS NOT OPTIONAL when paging. Without it Postgres may return rows in any
 * order, and consecutive .range() windows over an unordered result repeat some
 * rows and skip others — the exact bug that left sync-gauge-latest's station map
 * short by ~3,500 entries on its first run.
 */
async function loadSubscriptions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<GaugeAlertSubscription[]> {
  const out: GaugeAlertSubscription[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('gauge_alert_subscriptions')
      .select(SUBSCRIPTION_COLUMNS)
      .eq('enabled', true)
      .order('id')
      .range(from, from + PAGE - 1);

    if (error) throw new Error(`could not read subscriptions: ${error.message}`);
    const rows = data ?? [];
    // numeric(12,2) arrives as a string over PostgREST; comparing those as
    // strings puts "9.00" above "10.00".
    for (const row of rows) {
      out.push({
        ...row,
        threshold_value: toNum(row.threshold_value),
        threshold_value_max: toNum(row.threshold_value_max),
        last_value: toNum(row.last_value),
      } as GaugeAlertSubscription);
    }
    if (rows.length < PAGE) return out;
  }
}

/**
 * The condition ladders, keyed by (river, station).
 *
 * Keyed on the PAIR and not the station, because a station can rate several
 * rivers with different ladders — 07014000 is primary for the Huzzah and also
 * rates the Courtois — and grading a Courtois rule against the Huzzah's bands
 * would be silently wrong rather than visibly broken.
 */
async function loadLadders(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  subscriptions: GaugeAlertSubscription[],
): Promise<Map<string, LadderRow>> {
  const wanted = subscriptions.filter((s) => s.mode === 'condition' && s.river_id);
  const out = new Map<string, LadderRow>();
  if (wanted.length === 0) return out;

  const riverIds = [...new Set(wanted.map((s) => s.river_id as string))];
  const stationIds = [...new Set(wanted.map((s) => s.gauge_station_id))];

  const { data, error } = await supabase
    .from('river_gauges')
    .select(
      'river_id, gauge_station_id, threshold_unit, level_too_low, level_low, ' +
        'level_optimal_min, level_optimal_max, level_high, level_dangerous, flood_stage_ft',
    )
    .in('river_id', riverIds)
    .in('gauge_station_id', stationIds);

  if (error) throw new Error(`could not read ladders: ${error.message}`);

  for (const row of data ?? []) {
    out.set(ladderKey(row.river_id, row.gauge_station_id), {
      levelTooLow: toNum(row.level_too_low),
      levelLow: toNum(row.level_low),
      levelOptimalMin: toNum(row.level_optimal_min),
      levelOptimalMax: toNum(row.level_optimal_max),
      levelHigh: toNum(row.level_high),
      levelDangerous: toNum(row.level_dangerous),
      thresholdUnit: (row.threshold_unit ?? 'ft') as 'ft' | 'cfs',
      // The NWS line, so a rule reaches the same verdict as the river screen.
      // Without it a river above flood stage but below the editorial dangerous
      // band reads "Dangerous" in the app while the alert stays silent.
      floodStageFt: toNum(row.flood_stage_ft),
    });
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function writeStateUpdates(supabase: any, updates: StateUpdate[]): Promise<number> {
  let written = 0;
  for (let i = 0; i < updates.length; i += WRITE_CONCURRENCY) {
    const batch = updates.slice(i, i + WRITE_CONCURRENCY);
    const results = await Promise.all(
      batch.map(({ id, ...fields }) =>
        supabase
          .from('gauge_alert_subscriptions')
          .update(fields)
          .eq('id', id)
          .then((r: { error: unknown }) => r.error),
      ),
    );
    written += results.filter((error) => !error).length;
  }
  return written;
}

async function run(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logger.error(
      '[evaluate-gauge-alerts] CRON_SECRET not configured',
      new Error('missing CRON_SECRET'),
    );
    return NextResponse.json({ error: 'Cron secret not configured' }, { status: 500 });
  }
  if (!hasValidMachineBearer(request.headers.get('authorization'), cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  // No push kill switch here, deliberately. That switch stops SENDING, and it
  // lives in deliver-push. Stopping evaluation as well would freeze every rule's
  // crossing state, so on the far side of an outage a river that rose and fell
  // would look to us as though it had never moved.
  const gotLock = await tryCronLock(supabase, LOCK_JOB, LOCK_STALE_SECONDS);
  if (!gotLock) {
    return NextResponse.json({ skipped: true, reason: 'concurrent run' });
  }

  const startedAt = Date.now();
  try {
    const subscriptions = await loadSubscriptions(supabase);
    if (subscriptions.length === 0) {
      return NextResponse.json({ ok: true, subscriptions: 0, fired: 0 });
    }

    const stationIds = [...new Set(subscriptions.map((s) => s.gauge_station_id))];
    const [readings, ladders] = await Promise.all([
      loadLatestReadings(supabase, stationIds),
      loadLadders(supabase, subscriptions),
    ]);

    const plan = planGaugeAlerts({ subscriptions, readings, ladders });

    let inserted = 0;
    if (plan.fired.length > 0) {
      // ignoreDuplicates against the (subscription_id, reading_at) unique index:
      // a pass that dies after inserting but before writing state re-fires the
      // same rule on the same reading next time, and this is what makes that
      // retry harmless rather than a second notification.
      const { data, error } = await supabase
        .from('gauge_alert_events')
        .upsert(plan.fired, { onConflict: 'subscription_id,reading_at', ignoreDuplicates: true })
        .select('id');

      if (error) {
        logger.error('[evaluate-gauge-alerts] could not write outbox', error);
      } else {
        inserted = data?.length ?? 0;
      }
    }

    // Written AFTER the outbox insert. The other order would advance last_state
    // past a crossing whose event failed to record, and an edge-triggered rule
    // does not get a second chance at an edge it has already forgotten.
    const stateWritten = await writeStateUpdates(supabase, plan.stateUpdates);

    const durationMs = Date.now() - startedAt;
    const summary = {
      ok: true,
      subscriptions: subscriptions.length,
      stations: stationIds.length,
      readings: readings.size,
      fired: plan.fired.length,
      inserted,
      stateWritten,
      skipped: plan.skipped,
      durationMs,
    };
    logger.info('[evaluate-gauge-alerts] pass complete', summary);
    return NextResponse.json(summary);
  } catch (error) {
    logger.error('[evaluate-gauge-alerts] pass failed', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  } finally {
    await releaseCronLock(supabase, LOCK_JOB);
  }
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
