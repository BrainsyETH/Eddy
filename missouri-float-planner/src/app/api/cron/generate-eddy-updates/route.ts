// src/app/api/cron/generate-eddy-updates/route.ts
// Cron job: generates AI-powered Eddy condition updates for all active rivers.
// Runs once daily at 6:10 AM Central (11:10 UTC) via Vercel Cron — offset 10
// minutes after the hourly gauge sync so reports use the freshest readings.
// Uses concurrent processing (max 3 parallel) for faster execution.
//
// ── THE STATEWIDE SUMMARY IS A SEPARATE INVOCATION ──────────────────────────
//
// `?globalOnly=1`, on its own cron at 11:45 UTC. It is not a variant of this
// pass and not a fallback for it; it is where the statewide summary is
// generated, full stop. This pass writes rivers and stops.
//
// ── What the timings said ───────────────────────────────────────────────────
//
// The summary used to run LAST, inside this pass, on the sound reasoning that
// generateGlobalUpdate reads the rows the pass has just written. Then it did
// not land on 2026-08-03 and the Today tab lost its report for a day. The row
// timestamps across three days say why, and they say something sharper than
// "a call failed":
//
//   Day     rivers written   river phase   statewide row   statewide took
//   Aug 1   24               76s           11:15:22        3m 23s
//   Aug 2   24               68s           11:15:03        3m 03s
//   Aug 3   24               84s           never           —
//
// Twenty-four river reports take about eighty seconds. ONE statewide call —
// a single messages.create with max_tokens 200 — takes over three minutes,
// every time it succeeds. So the pass ran 4m11s and 4m38s on the days it
// worked, against a route that had no `maxDuration` declared at all. The
// successful runs were clearing the ceiling by seconds. On the third day the
// river phase ran sixteen seconds longer than the day before, and the function
// stops dead the moment the rivers finish.
//
// The most likely reason one small call takes three minutes is WHERE it sits:
// immediately behind twenty-four concurrent-3 calls to the same API, so it is
// queued or rate-limited and the SDK's own retries stretch it. That is
// inference — a killed function does not get to log — but the three minutes is
// measured, and it is the same three minutes on every successful day.
//
// Either way the conclusion does not depend on the mechanism: a step that
// takes three minutes must not run inside a pass that has already spent most
// of its budget, behind the burst that is probably what slows it down.
//
// ── Why a retry here would have made it worse ───────────────────────────────
//
// The first fix for this added retries to the in-pass global step. That was
// aimed at the wrong failure: three attempts at a three-minute call, inside an
// invocation already 85 seconds in, guarantees the timeout it was meant to
// survive. The retry is right — it just belongs in the invocation that has the
// whole budget to itself, which is where it now lives.
//
// What is left here is the part that was always correct: per-river generation,
// bounded concurrency, and a pass that finishes in ninety seconds.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUpdateTargetsFromDb, type UpdateTarget } from '@/lib/eddy/update-targets';
import { generateEddyUpdate, usageColumns } from '@/lib/eddy/generate-update';
import { generateGlobalUpdate, type GlobalUpdate } from '@/lib/eddy/generate-global-update';
import { resolveModels, type ResolvedModel } from '@/lib/ai/resolve-models';

export const dynamic = 'force-dynamic';

// How long an update remains valid (hours)
const UPDATE_TTL_HOURS = 25; // Slightly longer than the 24-hour cron interval

// Maximum concurrent API calls to avoid rate limiting
const MAX_CONCURRENCY = 3;

/**
 * Attempts at the statewide summary before giving the day up.
 *
 * Three, with a short linear backoff, and a DEADLINE that usually stops it at
 * one — which is not a contradiction, it is the whole design.
 *
 * ── Why a retry count alone is a trap here ─────────────────────────────────
 *
 * This call takes about three minutes when it succeeds (see the header). The
 * function's ceiling is five. So three unconditional attempts do not make a
 * flaky call reliable; they guarantee the timeout, because attempt two starts
 * at roughly minute three and is killed at minute five with nothing written.
 * A retry policy that cannot finish is worse than none: it converts a clean
 * failure into a half-run that also costs a second call.
 *
 * The two failure shapes want opposite things, and the clock tells them apart:
 *
 *   FAST failure   a 4xx, a bad key, a malformed response. Seconds. There is
 *                  plenty of budget left and a retry is worth having.
 *   SLOW failure   queued, rate-limited, the SDK grinding through its own
 *                  internal retries. Minutes. There is no room for another and
 *                  trying is how the whole invocation is lost.
 *
 * So the count bounds the fast case and the deadline bounds the slow one.
 */
const GLOBAL_ATTEMPTS = 3;
const GLOBAL_RETRY_DELAY_MS = 4_000;

/**
 * How long into the invocation a NEW attempt may still be started.
 *
 * Four minutes of the five in vercel.json's maxDuration. It is not a timeout on
 * the call — nothing here can interrupt one in flight — it is a gate on
 * beginning another, so a retry is only ever taken when there is room to finish
 * it. Past this the function reports the failure it has, which the 500 below
 * makes visible, rather than being killed while pretending to recover.
 */
const GLOBAL_START_DEADLINE_MS = 4 * 60 * 1000;

/** One statewide summary, retried while there is budget. Null if none landed. */
async function generateGlobalWithRetry(
  model: ResolvedModel,
  windowMinutes?: number,
): Promise<{ update: GlobalUpdate | null; attempts: number; lastError: string | null }> {
  let lastError: string | null = null;
  const startedAt = Date.now();

  for (let attempt = 1; attempt <= GLOBAL_ATTEMPTS; attempt++) {
    try {
      const update = await generateGlobalUpdate(
        model,
        windowMinutes != null ? { windowMinutes } : undefined,
      );
      if (update) return { update, attempts: attempt, lastError: null };
      // Null without a throw is generateGlobalUpdate declining: no API key, no
      // inputs in the window, or an empty completion. The first two will not
      // change on a retry, but the third will, and the function does not
      // distinguish them to its caller — so this retries and reports honestly
      // if it never lands.
      lastError = 'generation returned null';
    } catch (e) {
      lastError = e instanceof Error ? e.message : 'unknown error';
      console.error(`[EddyCron] Global attempt ${attempt}/${GLOBAL_ATTEMPTS} threw:`, e);
    }

    if (attempt >= GLOBAL_ATTEMPTS) break;

    const elapsed = Date.now() - startedAt;
    if (elapsed >= GLOBAL_START_DEADLINE_MS) {
      console.error(
        `[EddyCron] Statewide summary out of budget after ${attempt} attempt(s) ` +
          `(${Math.round(elapsed / 1000)}s elapsed); not starting another`,
      );
      return { update: null, attempts: attempt, lastError };
    }

    await new Promise((resolve) => setTimeout(resolve, GLOBAL_RETRY_DELAY_MS * attempt));
  }

  return { update: null, attempts: GLOBAL_ATTEMPTS, lastError };
}

/**
 * Simple concurrency limiter — processes items with at most `limit` in flight.
 */
async function processWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const currentIndex = index++;
      try {
        const result = await fn(items[currentIndex]);
        results[currentIndex] = { status: 'fulfilled', value: result };
      } catch (reason) {
        results[currentIndex] = { status: 'rejected', reason };
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function runGeneration(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('[EddyCron] CRON_SECRET not configured');
    return NextResponse.json({ error: 'Cron secret not configured' }, { status: 500 });
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[EddyCron] ANTHROPIC_API_KEY not configured');
    return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 500 });
  }

  const supabase = createAdminClient();

  // Resolved ONCE, before any generation, and threaded into every call below.
  // Not for the saved read — it is one indexed row — but so that a switch made
  // from /admin/ai-models while this pass is running cannot land half the rows
  // on one model and half on another with nothing marking the boundary.
  const models = await resolveModels();

  /** Writes one statewide row. Shared by the daily pass and the repair pass. */
  const insertGlobal = async (update: GlobalUpdate, expires: string) => {
    const { error } = await supabase.from('eddy_updates').insert({
      river_slug: 'global',
      section_slug: null,
      condition_code: 'unknown',
      gauge_height_ft: null,
      discharge_cfs: null,
      quote_text: update.quoteText,
      sources_used: update.sourcesUsed,
      ...usageColumns(update.usage),
      generated_at: new Date().toISOString(),
      expires_at: expires,
      trigger_reason: 'scheduled',
      is_event_driven: false,
    });
    return error;
  };

  // ── The statewide pass ────────────────────────────────────────────────────
  //
  // `?globalOnly=1` generates the statewide summary and nothing else. It is
  // where that artifact comes from — see the header for why it is not a step at
  // the end of the river pass any more.
  //
  // It has the whole invocation to itself, which is the entire point: one call
  // that takes three minutes, with no burst in front of it, and a retry that
  // can afford to fire.
  //
  // It reads the NEWEST row per river inside the input window rather than
  // rows tied to a particular pass, so the prose describes water that is
  // current as of when it is written. That is what keeps the read-side gate
  // honest — the gate decides what the summary "knew" from the rows that
  // predate it, and a summary stamped now but written from stale inputs would
  // tell it a flood was known about when it was not. See global-prose-gate.ts.
  if (request.nextUrl.searchParams.get('globalOnly') === '1') {
    // ── The skip guard, and why it is NOT the read side's 24 hours ──────────
    //
    // Firing this twice in a morning must not spend a second call or rewrite
    // prose people have already read, so an existing summary short-circuits it.
    //
    // The threshold cannot be GLOBAL_PROSE_STALE_HOURS. That is 24, this cron
    // fires every 24 hours, and `generated_at` is stamped AFTER the model call
    // returns — three minutes after the invocation starts. So yesterday's row
    // is reliably a few minutes SHORT of 24 hours old when today's run checks
    // it, the guard reads it as current, and today's summary is never written.
    // Every other day at best, and silently.
    //
    // That never fired while this was a repair pass, because the river pass had
    // already written a fresh row and this was supposed to no-op. Promoting it
    // to the primary generator is what would have armed it.
    //
    // Twelve hours: comfortably longer than any manual re-fire on the same
    // morning, comfortably shorter than the gap between two scheduled runs, and
    // it cannot collide with the interval it is measuring.
    const REGENERATE_AFTER_HOURS = 12;
    const freshEnough = new Date(
      Date.now() - REGENERATE_AFTER_HOURS * 60 * 60 * 1000,
    ).toISOString();

    const { data: liveGlobal, error: globalReadError } = await supabase
      .from('eddy_updates')
      .select('generated_at')
      .eq('river_slug', 'global')
      .is('section_slug', null)
      .gt('expires_at', new Date().toISOString())
      .gt('generated_at', freshEnough)
      .limit(1);

    if (globalReadError) {
      console.error('[EddyCron] Statewide pass could not read existing rows:', globalReadError);
      return NextResponse.json({ error: 'Failed to read existing summary' }, { status: 500 });
    }

    if (liveGlobal && liveGlobal.length > 0) {
      return NextResponse.json({
        message: 'Statewide summary already current; nothing to do',
        generated: false,
        generatedAt: liveGlobal[0].generated_at,
      });
    }

    const { update, attempts, lastError } = await generateGlobalWithRetry(models.global_summary);

    if (!update) {
      console.error(`[EddyCron] Statewide summary failed after ${attempts} attempts: ${lastError}`);
      return NextResponse.json(
        { error: 'Statewide summary generation failed', attempts, lastError },
        { status: 500 },
      );
    }

    const insertError = await insertGlobal(
      update,
      new Date(Date.now() + UPDATE_TTL_HOURS * 60 * 60 * 1000).toISOString(),
    );
    if (insertError) {
      console.error('[EddyCron] Statewide summary insert failed:', insertError);
      return NextResponse.json({ error: 'Statewide insert failed' }, { status: 500 });
    }

    console.log(`[EddyCron] Generated the statewide summary after ${attempts} attempt(s)`);
    return NextResponse.json({ message: 'Statewide summary generated', generated: true, attempts });
  }

  // Get active rivers from the database
  const { data: activeRivers, error: riversError } = await supabase
    .from('rivers')
    .select('slug')
    .eq('active', true);

  if (riversError) {
    console.error('[EddyCron] Failed to fetch active rivers:', riversError);
    return NextResponse.json({ error: 'Failed to fetch rivers' }, { status: 500 });
  }

  const activeSlugs = new Set((activeRivers || []).map((r: { slug: string }) => r.slug));

  // Optional ?river=<slug> narrows generation to a single active river. This is
  // the on-demand path used right after a new river is activated, so its Eddy
  // prose appears immediately instead of waiting up to ~24h for the daily cron.
  const riverParam = request.nextUrl.searchParams.get('river');
  const singleRiver = Boolean(riverParam);

  // Get all update targets (rivers + sections) and filter to active only
  const allTargets = await getUpdateTargetsFromDb();
  let targets = allTargets.filter((t) => activeSlugs.has(t.riverSlug));

  if (singleRiver) {
    targets = targets.filter((t) => t.riverSlug === riverParam);
    if (targets.length === 0) {
      return NextResponse.json(
        { error: `River "${riverParam}" is not an active update target` },
        { status: 404 },
      );
    }
  }

  if (targets.length === 0) {
    return NextResponse.json({ message: 'No active rivers found', generated: 0 });
  }

  const expiresAt = new Date(Date.now() + UPDATE_TTL_HOURS * 60 * 60 * 1000).toISOString();
  let generated = 0;
  let failed = 0;
  const errors: string[] = [];

  // Process targets with bounded concurrency (3 parallel model calls)
  const processTarget = async (target: UpdateTarget) => {
    const update = await generateEddyUpdate(target, models.river_update);

    if (!update) {
      throw new Error(`generation returned null`);
    }

    // Store in database
    const { error: insertError } = await supabase.from('eddy_updates').insert({
      river_slug: update.riverSlug,
      section_slug: update.sectionSlug,
      condition_code: update.conditionCode,
      gauge_height_ft: update.gaugeHeightFt,
      discharge_cfs: update.dischargeCfs,
      quote_text: update.quoteText,
      summary_text: update.summaryText,
      eddy_read: update.eddyRead,
      sources_used: update.sourcesUsed,
      weather: update.weather,
      ...usageColumns(update.usage),
      generated_at: new Date().toISOString(),
      expires_at: expiresAt,
      trigger_reason: 'scheduled',
      is_event_driven: false,
    });

    if (insertError) {
      throw new Error(`DB insert failed: ${insertError.message}`);
    }

    return update;
  };

  const results = await processWithConcurrency(targets, MAX_CONCURRENCY, processTarget);

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const target = targets[i];
    const label = `${target.riverSlug}/${target.sectionSlug || 'whole'}`;

    if (result.status === 'fulfilled') {
      generated++;
      const update = result.value;
      console.log(
        `[EddyCron] Generated update for ${label}: ` +
          `${update.conditionCode} @ ${update.gaugeHeightFt?.toFixed(1) ?? '?'} ft`
      );
    } else {
      failed++;
      const msg = result.reason instanceof Error ? result.reason.message : 'unknown error';
      errors.push(`${label}: ${msg}`);
      console.error(`[EddyCron] Error processing ${label}:`, result.reason);
    }
  }

  // THE STATEWIDE SUMMARY IS NOT GENERATED HERE. It has its own invocation at
  // 11:45 — `?globalOnly=1`, the branch above — because one call that reliably
  // takes three minutes has no business at the tail of a pass that has already
  // spent eighty seconds and is queued behind its own burst. The header has the
  // timings this is built on.
  //
  // Nothing replaces it in this position. A "kick off the statewide pass from
  // here" call would put the same three minutes back on the same clock.

  // Clean up expired updates (keep last 48 hours for history). Global
  // maintenance, so it only runs on full cron passes, not single-river runs.
  if (!singleRiver) {
    const cleanupCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { error: cleanupError } = await supabase
      .from('eddy_updates')
      .delete()
      .lt('generated_at', cleanupCutoff);

    if (cleanupError) {
      console.warn('[EddyCron] Cleanup failed:', cleanupError);
    }
  }

  // A 200 with per-river failures listed, which is the honest shape for this
  // pass: one river short of a paragraph is a real but partial outcome, and 23
  // good reports should not be reported to Vercel's cron log as a failed job.
  //
  // The statewide summary used to decide this status code, because losing it
  // costs a whole surface rather than one river's paragraph. It still does —
  // in its own invocation, which returns 500 when it cannot produce one. That
  // is a cleaner signal than it ever was here: a red run in the log now means
  // exactly one thing, and it is the thing worth being woken for.
  return NextResponse.json({
    message: 'Eddy update generation complete',
    river: riverParam ?? undefined,
    generated,
    failed,
    total: targets.length,
    errors: errors.length > 0 ? errors : undefined,
    executionTime: new Date().toISOString(),
  });
}

export async function GET(request: NextRequest) {
  return runGeneration(request);
}

export async function POST(request: NextRequest) {
  return runGeneration(request);
}
