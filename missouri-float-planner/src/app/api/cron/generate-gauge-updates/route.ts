// src/app/api/cron/generate-gauge-updates/route.ts
// Daily cron: generates per-gauge Haiku updates for every SECONDARY gauge on
// an active river. Primary gauges are handled by the Sonnet-powered
// /api/cron/generate-eddy-updates job, which runs on a different schedule.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  generateGaugeUpdate,
  getSecondaryGaugeTargets,
  type SecondaryGaugeTarget,
} from '@/lib/eddy/generate-gauge-update';
import { usageColumns } from '@/lib/eddy/generate-update';

export const dynamic = 'force-dynamic';

// How long an update remains valid (hours)
const UPDATE_TTL_HOURS = 25;

// Maximum concurrent Haiku calls — small set (~11), keep it gentle.
const MAX_CONCURRENCY = 3;

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
    console.error('[GaugeUpdatesCron] CRON_SECRET not configured');
    return NextResponse.json({ error: 'Cron secret not configured' }, { status: 500 });
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[GaugeUpdatesCron] ANTHROPIC_API_KEY not configured');
    return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 500 });
  }

  const supabase = createAdminClient();
  const targets = await getSecondaryGaugeTargets();

  if (targets.length === 0) {
    return NextResponse.json({ message: 'No secondary gauges to update', generated: 0 });
  }

  const expiresAt = new Date(Date.now() + UPDATE_TTL_HOURS * 60 * 60 * 1000).toISOString();
  let generated = 0;
  let failed = 0;
  const errors: string[] = [];

  const processTarget = async (target: SecondaryGaugeTarget) => {
    const update = await generateGaugeUpdate(target);
    if (!update) throw new Error('generation returned null');

    const { error: insertError } = await supabase.from('gauge_updates').insert({
      gauge_station_id: update.gaugeStationId,
      usgs_site_id: update.usgsSiteId,
      river_slug: update.riverSlug,
      condition_code: update.conditionCode,
      gauge_height_ft: update.gaugeHeightFt,
      discharge_cfs: update.dischargeCfs,
      quote_text: update.quoteText,
      summary_text: update.summaryText,
      sources_used: update.sourcesUsed,
      ...usageColumns(update.usage),
      generated_at: new Date().toISOString(),
      expires_at: expiresAt,
    });

    if (insertError) throw new Error(`DB insert failed: ${insertError.message}`);
    return update.usgsSiteId;
  };

  const results = await processWithConcurrency(targets, MAX_CONCURRENCY, processTarget);
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') {
      generated++;
    } else {
      failed++;
      errors.push(`${targets[i].usgsSiteId} (${targets[i].riverSlug}): ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
    }
  }

  return NextResponse.json({
    message: 'Gauge update generation complete',
    generated,
    failed,
    total: targets.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}

export async function GET(request: NextRequest) {
  return runGeneration(request);
}

export async function POST(request: NextRequest) {
  return runGeneration(request);
}
