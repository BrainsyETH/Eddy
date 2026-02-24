// src/app/api/cron/generate-eddy-updates/route.ts
// Cron job: generates AI-powered Eddy condition updates for all active rivers.
// Runs every 6 hours via Vercel Cron. Stores results in eddy_updates table.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUpdateTargets } from '@/data/river-sections';
import { generateEddyUpdate } from '@/lib/eddy/generate-update';

export const dynamic = 'force-dynamic';

// How long an update remains valid (hours)
const UPDATE_TTL_HOURS = 7; // Slightly longer than the 6-hour cron interval

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

  // Process sequentially to avoid rate limits and keep costs predictable
  for (const target of targets) {
    try {
      const update = await generateEddyUpdate(target);

      if (!update) {
        failed++;
        errors.push(`${target.riverSlug}/${target.sectionSlug || 'whole'}: generation returned null`);
        continue;
      }

      // Store in database
      const { error: insertError } = await supabase.from('eddy_updates').insert({
        river_slug: update.riverSlug,
        section_slug: update.sectionSlug,
        condition_code: update.conditionCode,
        gauge_height_ft: update.gaugeHeightFt,
        discharge_cfs: update.dischargeCfs,
        quote_text: update.quoteText,
        sources_used: update.sourcesUsed,
        generated_at: new Date().toISOString(),
        expires_at: expiresAt,
      });

      if (insertError) {
        console.error(`[EddyCron] Insert failed for ${target.riverSlug}:`, insertError);
        failed++;
        errors.push(`${target.riverSlug}: DB insert failed`);
        continue;
      }

      generated++;
      console.log(
        `[EddyCron] Generated update for ${target.riverSlug}/${target.sectionSlug || 'whole'}: ` +
          `${update.conditionCode} @ ${update.gaugeHeightFt?.toFixed(1) ?? '?'} ft`
      );
    } catch (e) {
      console.error(`[EddyCron] Error processing ${target.riverSlug}:`, e);
      failed++;
      errors.push(`${target.riverSlug}: ${e instanceof Error ? e.message : 'unknown error'}`);
    }
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
