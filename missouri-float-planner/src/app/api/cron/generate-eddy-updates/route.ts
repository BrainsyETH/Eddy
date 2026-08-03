// src/app/api/cron/generate-eddy-updates/route.ts
// Cron job: generates AI-powered Eddy condition updates for all active rivers.
// Runs once daily at 6:10 AM Central (11:10 UTC) via Vercel Cron — offset 10
// minutes after the hourly gauge sync so reports use the freshest readings.
// Uses concurrent processing (max 3 parallel) for faster execution.
//
// ── The statewide summary is the fragile part of this route ─────────────────
//
// It runs LAST, after all 24 rivers, because generateGlobalUpdate summarises
// the rows this pass has just written. That ordering is correct and is not
// what went wrong — but it means one model call, at the end of a long
// function, with every per-river success already banked, decides whether the
// app's launch screen has a report on it for the next 24 hours.
//
// On 2026-08-03 that call did not land. All 24 per-river rows were written
// between 11:10:29 and 11:11:54 UTC and no global row followed. Yesterday's
// expired at 12:10 UTC and the Today tab lost its report for the rest of the
// day. Three things made that possible and all three are fixed here:
//
//   1. ONE ATTEMPT. A single transient API failure cost the whole day. The
//      call is now retried with backoff.
//   2. A SILENT 200. The failure went into an `errors` array in a JSON body
//      that nothing reads — not Vercel's cron log, which only sees the status.
//      A full pass that cannot produce the summary now returns 500.
//   3. NO SECOND CHANCE. Nothing between one 11:10 and the next could notice
//      the row was missing. `?globalOnly=1` is a repair pass that regenerates
//      it only when it is actually absent; see the branch below.
//
// The route also had no `maxDuration` in vercel.json while every other
// long-running cron there does. The 2026-08-02 pass took 4m12s. That is added
// too — see the functions block in vercel.json.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUpdateTargetsFromDb, type UpdateTarget } from '@/lib/eddy/update-targets';
import { generateEddyUpdate, usageColumns } from '@/lib/eddy/generate-update';
import {
  generateGlobalUpdate,
  GLOBAL_REPAIR_WINDOW_MINUTES,
  type GlobalUpdate,
} from '@/lib/eddy/generate-global-update';
import { GLOBAL_PROSE_STALE_HOURS } from '@/lib/eddy/global-prose-gate';

export const dynamic = 'force-dynamic';

// How long an update remains valid (hours)
const UPDATE_TTL_HOURS = 25; // Slightly longer than the 24-hour cron interval

// Maximum concurrent API calls to avoid rate limiting
const MAX_CONCURRENCY = 3;

/**
 * Attempts at the statewide summary before giving the day up.
 *
 * Three, with a short linear backoff. The failure mode being covered is a
 * transient one — a rate limit, an overloaded model, a socket closed mid-call —
 * and those clear in seconds. A run that has already spent minutes generating
 * 24 river reports can afford a few more to keep them from being unreadable as
 * a group.
 */
const GLOBAL_ATTEMPTS = 3;
const GLOBAL_RETRY_DELAY_MS = 4_000;

/** One statewide summary, retried. Null only when every attempt failed. */
async function generateGlobalWithRetry(
  windowMinutes?: number,
): Promise<{ update: GlobalUpdate | null; attempts: number; lastError: string | null }> {
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= GLOBAL_ATTEMPTS; attempt++) {
    try {
      const update = await generateGlobalUpdate(
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

    if (attempt < GLOBAL_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, GLOBAL_RETRY_DELAY_MS * attempt));
    }
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

  // ── The repair pass ───────────────────────────────────────────────────────
  //
  // `?globalOnly=1` regenerates the statewide summary and nothing else, and
  // only when there is not already a good one. It exists because the daily
  // pass has exactly one chance at the summary and a miss costs the Today tab
  // its report until the next morning — which is what happened on 2026-08-03.
  //
  // IT IS A NO-OP ON A HEALTHY DAY, and that is the point: it must not become
  // a second daily generation, spending a Sonnet call and rewriting prose
  // people have already read. The condition it repairs is narrow — no row, or
  // one the read side would refuse to serve anyway.
  //
  // It regenerates from the NEWEST row per river within a wider window rather
  // than re-reading this morning's inputs, so the prose describes water that
  // is current as of when it is written. That keeps the read-side gate honest:
  // it decides what the summary "knew" from the rows that predate it, and a
  // summary stamped now but written from six-hour-old inputs would tell it a
  // flood was known about when it was not. See global-prose-gate.ts.
  if (request.nextUrl.searchParams.get('globalOnly') === '1') {
    const freshEnough = new Date(
      Date.now() - GLOBAL_PROSE_STALE_HOURS * 60 * 60 * 1000,
    ).toISOString();

    const { data: liveGlobal, error: globalReadError } = await supabase
      .from('eddy_updates')
      .select('generated_at')
      .eq('river_slug', 'global')
      .is('section_slug', null)
      .gt('expires_at', new Date().toISOString())
      // The read side drops a summary older than this regardless of expiry, so
      // a row it would refuse to serve is a row this pass must treat as absent.
      .gt('generated_at', freshEnough)
      .limit(1);

    if (globalReadError) {
      console.error('[EddyCron] Global repair could not read existing rows:', globalReadError);
      return NextResponse.json({ error: 'Failed to read existing summary' }, { status: 500 });
    }

    if (liveGlobal && liveGlobal.length > 0) {
      return NextResponse.json({
        message: 'Statewide summary already current; nothing to repair',
        repaired: false,
        generatedAt: liveGlobal[0].generated_at,
      });
    }

    console.warn('[EddyCron] No serviceable statewide summary; regenerating');
    const { update, attempts, lastError } = await generateGlobalWithRetry(
      GLOBAL_REPAIR_WINDOW_MINUTES,
    );

    if (!update) {
      console.error(`[EddyCron] Global repair failed after ${attempts} attempts: ${lastError}`);
      return NextResponse.json(
        { error: 'Statewide summary repair failed', attempts, lastError },
        { status: 500 },
      );
    }

    const insertError = await insertGlobal(
      update,
      new Date(Date.now() + UPDATE_TTL_HOURS * 60 * 60 * 1000).toISOString(),
    );
    if (insertError) {
      console.error('[EddyCron] Global repair insert failed:', insertError);
      return NextResponse.json({ error: 'Repair insert failed' }, { status: 500 });
    }

    console.log(`[EddyCron] Repaired the statewide summary after ${attempts} attempt(s)`);
    return NextResponse.json({ message: 'Statewide summary repaired', repaired: true, attempts });
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

  // Process targets with bounded concurrency (3 parallel Haiku calls)
  const processTarget = async (target: UpdateTarget) => {
    const update = await generateEddyUpdate(target);

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

  // Generate global summary from per-river updates. Skipped on single-river
  // on-demand runs, which would otherwise skew the statewide summary.
  //
  // `globalFailed` is tracked separately from `errors` because it is the only
  // failure in this route that costs a whole surface rather than one river's
  // paragraph — see the header. It decides the status code below.
  let globalFailed = false;
  if (!singleRiver) {
    const { update: globalUpdate, attempts, lastError } = await generateGlobalWithRetry();

    if (globalUpdate) {
      const globalInsertError = await insertGlobal(globalUpdate, expiresAt);
      if (globalInsertError) {
        console.error('[EddyCron] Global insert failed:', globalInsertError);
        errors.push(`global: DB insert failed: ${globalInsertError.message}`);
        globalFailed = true;
      } else {
        generated++;
        console.log(
          `[EddyCron] Generated global Ozarks summary after ${attempts} attempt(s)`,
        );
      }
    } else {
      console.error(
        `[EddyCron] Global summary failed after ${attempts} attempts: ${lastError}`,
      );
      errors.push(`global: ${lastError ?? 'generation returned null'}`);
      globalFailed = true;
    }
  }

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

  // ── A missing statewide summary is a FAILED cron run ──────────────────────
  //
  // It used to be a line in `errors` under a 200, which is indistinguishable
  // from success everywhere it is actually watched: Vercel's cron log records
  // the status code and nothing else, so the run that cost the Today tab its
  // report for a day looked exactly like the 30 that worked. The per-river
  // failures stay inside the 200 — one river short of a paragraph is a real
  // but partial outcome, and 23 good reports should not be reported as a
  // failed job.
  const status = globalFailed ? 500 : 200;

  return NextResponse.json(
    {
      message: globalFailed
        ? 'Eddy update generation completed WITHOUT the statewide summary'
        : 'Eddy update generation complete',
      river: riverParam ?? undefined,
      generated,
      failed,
      globalFailed,
      total: targets.length,
      errors: errors.length > 0 ? errors : undefined,
      executionTime: new Date().toISOString(),
    },
    { status },
  );
}

export async function GET(request: NextRequest) {
  return runGeneration(request);
}

export async function POST(request: NextRequest) {
  return runGeneration(request);
}
