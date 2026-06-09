// src/app/api/cron/generate-eddy-updates/route.ts
// Cron job: generates AI-powered Eddy condition updates for all active rivers.
// Runs once daily at 6 AM Central (11 AM UTC) via Vercel Cron.
// Uses concurrent processing (max 3 parallel) for faster execution.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUpdateTargets, type UpdateTarget } from '@/data/river-sections';
import { generateEddyUpdate } from '@/lib/eddy/generate-update';
import { generateGlobalUpdate } from '@/lib/eddy/generate-global-update';

export const dynamic = 'force-dynamic';

// How long an update remains valid (hours)
const UPDATE_TTL_HOURS = 25; // Slightly longer than the 24-hour cron interval

// Maximum concurrent API calls to avoid rate limiting
const MAX_CONCURRENCY = 3;

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

  // Get all update targets (rivers + sections) and filter to active only
  const allTargets = getUpdateTargets();
  const targets = allTargets.filter((t) => activeSlugs.has(t.riverSlug));

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
      sources_used: update.sourcesUsed,
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

  // Generate global summary from per-river updates
  try {
    const globalUpdate = await generateGlobalUpdate();
    if (globalUpdate) {
      const { error: globalInsertError } = await supabase.from('eddy_updates').insert({
        river_slug: 'global',
        section_slug: null,
        condition_code: 'unknown',
        gauge_height_ft: null,
        discharge_cfs: null,
        quote_text: globalUpdate.quoteText,
        sources_used: globalUpdate.sourcesUsed,
        generated_at: new Date().toISOString(),
        expires_at: expiresAt,
        trigger_reason: 'scheduled',
        is_event_driven: false,
      });

      if (globalInsertError) {
        console.error('[EddyCron] Global insert failed:', globalInsertError);
        errors.push('global: DB insert failed');
      } else {
        generated++;
        console.log(`[EddyCron] Generated global Ozarks summary`);
      }
    } else {
      errors.push('global: generation returned null');
    }
  } catch (e) {
    console.error('[EddyCron] Error generating global update:', e);
    errors.push(`global: ${e instanceof Error ? e.message : 'unknown error'}`);
  }

  // Clean up expired updates (keep last 48 hours for history)
  const cleanupCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { error: cleanupError } = await supabase
    .from('eddy_updates')
    .delete()
    .lt('generated_at', cleanupCutoff);

  if (cleanupError) {
    console.warn('[EddyCron] Cleanup failed:', cleanupError);
  }

  return NextResponse.json({
    message: 'Eddy update generation complete',
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
