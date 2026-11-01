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

import { withJobRun } from '@/lib/admin/dashboard/job-run';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasValidMachineBearer } from '@/lib/security/machine-auth';
import { tryCronLockDetailed, releaseCronLock } from '@/lib/social/cron-lock';
import { loadLatestReadings } from '@/lib/gauges/latest-readings';
import {
  ladderKey,
  planGaugeAlerts,
  type GaugeAlertSubscription,
  type LadderRow,
} from '@/lib/alerts/gauge-threshold';
import { persistGaugeAlertPlan } from '@/lib/alerts/gauge-alert-persist';
import { isRuleLive, parentIdsOf } from '@/lib/alerts/gating';
import { toNum } from '@/lib/utils/num';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const LOCK_JOB = 'evaluate_gauge_alerts';
const LOCK_STALE_SECONDS = 90;

/** PostgREST caps a page at 1,000 rows; paging is not optional above that. */
const PAGE = 1000;
/** Parent ids per `in` filter, bounded by the request line's length. */
const PARENT_CHUNK = 200;

const SUBSCRIPTION_COLUMNS =
  'id, user_id, gauge_station_id, river_id, mode, condition_kind, metric, comparator, ' +
  'threshold_value, threshold_value_max, enabled, one_shot, last_state, last_value, ' +
  'last_reading_at, last_triggered_at, one_shot_fired_at, last_condition_code, ' +
  'parent_subscription_id';

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
 * Which parent river alerts are paused.
 *
 * A SEPARATE QUERY rather than an embed. The embed reads better and would fold
 * into the paged select above, but it would also make every page of this pass
 * depend on PostgREST resolving a foreign key through its schema cache — and
 * this is the query that decides whether somebody's flood alert is evaluated.
 * A plain `in` on ids the previous query already returned has no such failure
 * mode, and it is skipped entirely when nothing is parented, which is the
 * common case.
 *
 * The PAUSED set, not the live one, so an id this cannot resolve is absent and
 * therefore ungating. See isRuleLive on why failing open is right here.
 */
async function loadPausedParents(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  subscriptions: GaugeAlertSubscription[],
): Promise<Set<string>> {
  const ids = parentIdsOf(subscriptions);
  const paused = new Set<string>();
  if (ids.length === 0) return paused;

  // Chunked against the URL-length ceiling PostgREST inherits from the request
  // line: `in` becomes a query parameter, and a few hundred uuids is already a
  // long one.
  for (let from = 0; from < ids.length; from += PARENT_CHUNK) {
    const { data, error } = await supabase
      .from('alert_subscriptions')
      .select('id')
      .in('id', ids.slice(from, from + PARENT_CHUNK))
      .eq('enabled', false);

    // Logged, not thrown. A failure here must not take the whole pass down —
    // every rule it would have gated is one the user asked for, and the worst
    // outcome of proceeding is a notification somebody muted arriving anyway.
    if (error) {
      logger.error('[evaluate-gauge-alerts] could not read parent alerts', error);
      return paused;
    }
    for (const row of data ?? []) paused.add(row.id as string);
  }
  return paused;
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
  // Contention is a quiet skip; a lock that cannot be evaluated is an outage
  // and a 503, so the job monitor records it as an error (same as trust-tick).
  const lock = await tryCronLockDetailed(supabase, LOCK_JOB, LOCK_STALE_SECONDS);
  if (!lock.acquired) {
    if (lock.reason === 'unavailable') {
      logger.error('[evaluate-gauge-alerts] cron lock unavailable', new Error(lock.error), { job: LOCK_JOB });
      return NextResponse.json(
        { ok: false, monitoring_status: 'error', skipped: true, reason: 'lock_unavailable' },
        { status: 503 },
      );
    }
    return NextResponse.json({ skipped: true, monitoring_status: 'skipped', reason: 'concurrent run' });
  }

  const startedAt = Date.now();
  try {
    const loaded = await loadSubscriptions(supabase);
    if (loaded.length === 0) {
      return NextResponse.json({ ok: true, subscriptions: 0, fired: 0 });
    }

    /**
     * The parent gate, applied BEFORE anything else reads this list.
     *
     * A gauge alert created from a river alert's edit screen belongs to it, and
     * pausing that alert has to stop this one — without writing to it. Writing
     * is what the app used to do, and it destroyed the very states the user
     * would want back on resume; the gate leaves every child's `enabled`
     * untouched, so resuming the parent restores the group exactly as it was
     * with nothing remembered anywhere.
     *
     * Gated rules are dropped here rather than passed to the planner with a
     * flag, so a gated child behaves EXACTLY like one the user paused itself,
     * down to its crossing state freezing. Two flavours of "paused" would be a
     * second concept to hold, and the freeze is a property of pausing rather
     * than of this mechanism — see the header of gating.ts.
     */
    const pausedParents = await loadPausedParents(supabase, loaded);
    const subscriptions = loaded.filter((s) => isRuleLive(s, pausedParents));
    const gated = loaded.length - subscriptions.length;
    if (subscriptions.length === 0) {
      return NextResponse.json({ ok: true, subscriptions: 0, gated, fired: 0 });
    }

    const stationIds = [...new Set(subscriptions.map((s) => s.gauge_station_id))];
    const [readings, ladders] = await Promise.all([
      loadLatestReadings(supabase, stationIds),
      loadLadders(supabase, subscriptions),
    ]);

    const plan = planGaugeAlerts({ subscriptions, readings, ladders });

    // Outbox first, then state, and a fired rule's state only behind a written
    // event — the ordering argument is in lib/alerts/gauge-alert-persist.ts.
    const persisted = await persistGaugeAlertPlan(supabase, plan);

    const durationMs = Date.now() - startedAt;
    const summary = {
      ok: true,
      subscriptions: subscriptions.length,
      // Reported so a "my alert stopped" can be answered from the logs rather
      // than from the database.
      gated,
      stations: stationIds.length,
      readings: readings.size,
      fired: plan.fired.length,
      inserted: persisted.inserted,
      // Non-zero means the outbox write failed and those rules were held back
      // to re-fire next pass; jobOutcome reads `*Failed` keys as partial.
      heldBack: persisted.heldBack,
      outboxFailed: persisted.outboxFailed ? 1 : 0,
      stateWritten: persisted.stateWritten,
      stateFailed: persisted.stateFailed,
      // Failing to save fired alerts is not "partial progress": the alerts
      // were not persisted, and the outbox stays empty, so nothing downstream
      // looks wrong. Recorded as an error so the pipeline monitor sees it.
      ...(persisted.outboxFailed ? { monitoring_status: 'error' } : {}),
      skipped: plan.skipped,
      durationMs,
    };
    logger.info('[evaluate-gauge-alerts] pass complete', summary);
    return NextResponse.json(summary, { status: persisted.outboxFailed ? 500 : 200 });
  } catch (error) {
    logger.error('[evaluate-gauge-alerts] pass failed', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  } finally {
    await releaseCronLock(supabase, LOCK_JOB);
  }
}

async function handleGET(request: NextRequest) {
  return run(request);
}

async function handlePOST(request: NextRequest) {
  return run(request);
}

export const GET = withJobRun("evaluate-gauge-alerts", handleGET);

export const POST = withJobRun("evaluate-gauge-alerts", handlePOST);
