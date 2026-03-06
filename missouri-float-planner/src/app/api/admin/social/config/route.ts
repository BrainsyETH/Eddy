// src/app/api/admin/social/config/route.ts
// GET/PUT for social posting configuration (single-row table)

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

const LOG_PREFIX = '[SocialConfig]';

const CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'Pragma': 'no-cache',
};

export async function GET(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  const supabase = createAdminClient();

  // No .limit(1) — .single() will error if multiple rows exist (exposes duplicates)
  const { data, error } = await supabase
    .from('social_config')
    .select('*')
    .single();

  if (error) {
    console.error(`${LOG_PREFIX} GET error: ${error.message} (code: ${error.code})`);
    // PGRST116 = "Results contain N rows" — means duplicate rows exist
    if (error.code === 'PGRST116') {
      return NextResponse.json(
        { error: 'Multiple config rows found — run migration 00060 to fix' },
        { status: 500, headers: CACHE_HEADERS }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500, headers: CACHE_HEADERS });
  }

  console.log(`${LOG_PREFIX} GET returning config id=${data.id}`);
  return NextResponse.json(data, { headers: CACHE_HEADERS });
}

export async function PUT(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  const body = await request.json();
  const supabase = createAdminClient();

  // Get existing config ID — no .limit(1) so .single() exposes duplicates
  const { data: existing, error: selectError } = await supabase
    .from('social_config')
    .select('id')
    .single();

  if (selectError) {
    console.error(`${LOG_PREFIX} PUT select error: ${selectError.message} (code: ${selectError.code})`);
    if (selectError.code === 'PGRST116') {
      return NextResponse.json(
        { error: 'Multiple config rows found — run migration 00060 to fix' },
        { status: 500, headers: CACHE_HEADERS }
      );
    }
    return NextResponse.json({ error: selectError.message }, { status: 500, headers: CACHE_HEADERS });
  }

  if (!existing) {
    return NextResponse.json({ error: 'No config row found' }, { status: 404, headers: CACHE_HEADERS });
  }

  console.log(`${LOG_PREFIX} PUT updating config id=${existing.id}`);

  const { data, error } = await supabase
    .from('social_config')
    .update({
      posting_enabled: body.posting_enabled,
      posting_frequency_hours: body.posting_frequency_hours,
      digest_enabled: body.digest_enabled,
      digest_time_utc: body.digest_time_utc,
      highlights_per_run: body.highlights_per_run,
      highlight_cooldown_hours: body.highlight_cooldown_hours,
      enabled_rivers: body.enabled_rivers,
      disabled_rivers: body.disabled_rivers,
      highlight_conditions: body.highlight_conditions,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id)
    .select('*')
    .single();

  if (error) {
    console.error(`${LOG_PREFIX} PUT update error: ${error.message}`);
    return NextResponse.json({ error: error.message }, { status: 500, headers: CACHE_HEADERS });
  }

  if (!data) {
    console.error(`${LOG_PREFIX} PUT update returned no data for id=${existing.id}`);
    return NextResponse.json(
      { error: 'Update returned no data — the config row may have been deleted' },
      { status: 500, headers: CACHE_HEADERS }
    );
  }

  console.log(`${LOG_PREFIX} PUT success — saved config id=${data.id}, posting_enabled=${data.posting_enabled}`);
  return NextResponse.json(data, { headers: CACHE_HEADERS });
}
