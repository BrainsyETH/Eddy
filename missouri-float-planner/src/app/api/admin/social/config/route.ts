// src/app/api/admin/social/config/route.ts
// GET + POST (save) for social posting configuration (single-row table)
// Uses POST instead of PUT to prevent any edge/CDN caching of write operations.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth, logAdminAction } from '@/lib/admin-auth';
import { getOrCreateConfig } from '@/lib/social/config-helpers';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

const LOG_PREFIX = '[SocialConfig]';

const CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  'Pragma': 'no-cache',
  'Expires': '0',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
};

export async function GET(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  const supabase = createAdminClient();
  const { data, error } = await getOrCreateConfig(supabase);

  if (error || !data) {
    console.error(`${LOG_PREFIX} GET error: ${error}`);
    return NextResponse.json({ error: error || 'Failed to load config' }, { status: 500, headers: CACHE_HEADERS });
  }

  console.log(`${LOG_PREFIX} GET returning config id=${data.id}, cooldown=${data.highlight_cooldown_hours}, conditions=[${data.highlight_conditions?.join(',')}]`);
  return NextResponse.json(data, { headers: CACHE_HEADERS });
}

// Accept both PUT and POST for saves — POST avoids any edge caching issues
export async function POST(request: NextRequest) {
  return handleSave(request);
}

export async function PUT(request: NextRequest) {
  return handleSave(request);
}

// PATCH saves the posting switch on its own. It is the control an operator
// reaches for to stop automatic posts, so it must take effect the moment it is
// flipped — not after a Save button further down the page — and it must not
// carry the rest of the form's unsaved edits along with it.
export async function PATCH(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  const body = await request.json().catch(() => null);
  if (!body || typeof body.posting_enabled !== 'boolean') {
    return NextResponse.json({ error: 'posting_enabled must be true or false' }, { status: 400, headers: CACHE_HEADERS });
  }

  const supabase = createAdminClient();
  const { data: existing, error: selectError } = await getOrCreateConfig(supabase);
  if (selectError || !existing) {
    console.error(`${LOG_PREFIX} PATCH config load error: ${selectError}`);
    return NextResponse.json({ error: 'Failed to load config' }, { status: 500, headers: CACHE_HEADERS });
  }

  const { data, error } = await supabase
    .from('social_config')
    .update({ posting_enabled: body.posting_enabled, updated_at: new Date().toISOString() })
    .eq('id', existing.id)
    .select('posting_enabled, updated_at')
    .single();

  if (error || !data) {
    console.error(`${LOG_PREFIX} PATCH update error: ${error?.message}`);
    return NextResponse.json({ error: 'Could not save the posting switch' }, { status: 500, headers: CACHE_HEADERS });
  }

  await logAdminAction({
    action: data.posting_enabled ? 'social_posting_resumed' : 'social_posting_paused',
    entityType: 'social_config',
    entityId: existing.id,
    details: { old: { posting_enabled: existing.posting_enabled }, new: { posting_enabled: data.posting_enabled } },
  });

  // The stored value, read back from the row that was written.
  return NextResponse.json({ posting_enabled: data.posting_enabled, updated_at: data.updated_at }, { headers: CACHE_HEADERS });
}

async function handleSave(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  const body = await request.json();
  const supabase = createAdminClient();

  // Self-healing: get config (handles duplicates and missing rows)
  const { data: existing, error: selectError } = await getOrCreateConfig(supabase);

  if (selectError || !existing) {
    console.error(`${LOG_PREFIX} SAVE config load error: ${selectError}`);
    return NextResponse.json(
      { error: selectError || 'Failed to load config' },
      { status: 500, headers: CACHE_HEADERS }
    );
  }

  console.log(
    `${LOG_PREFIX} SAVE updating config id=${existing.id}, ` +
    `incoming: cooldown=${body.highlight_cooldown_hours}, conditions=[${body.highlight_conditions?.join(',')}], ` +
    `posting=${body.posting_enabled}, freq=${body.posting_frequency_hours}`
  );

  const updatePayload = {
    posting_enabled: body.posting_enabled,
    posting_frequency_hours: body.posting_frequency_hours,
    digest_enabled: body.digest_enabled,
    digest_time_cst: body.digest_time_cst,
    highlights_per_run: body.highlights_per_run,
    highlight_cooldown_hours: body.highlight_cooldown_hours,
    enabled_rivers: body.enabled_rivers,
    disabled_rivers: body.disabled_rivers,
    highlight_conditions: body.highlight_conditions,
    river_schedules: body.river_schedules,
    video_features: body.video_features ?? existing.video_features,
    media_schedule: body.media_schedule ?? existing.media_schedule,
    weekly_forecast: body.weekly_forecast ?? existing.weekly_forecast,
    section_guide: body.section_guide ?? existing.section_guide,
    weekly_trend: body.weekly_trend ?? existing.weekly_trend,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('social_config')
    .update(updatePayload)
    .eq('id', existing.id)
    .select('*')
    .single();

  if (error) {
    console.error(`${LOG_PREFIX} SAVE update error: ${error.message}`);
    return NextResponse.json({ error: error.message }, { status: 500, headers: CACHE_HEADERS });
  }

  if (!data) {
    console.error(`${LOG_PREFIX} SAVE update returned no data for id=${existing.id}`);
    return NextResponse.json(
      { error: 'Update returned no data — the config row may have been deleted' },
      { status: 500, headers: CACHE_HEADERS }
    );
  }

  // Verification: fresh read from DB to confirm the write persisted
  const { data: verify, error: verifyError } = await supabase
    .from('social_config')
    .select('*')
    .eq('id', data.id)
    .single();

  if (verifyError) {
    console.error(`${LOG_PREFIX} SAVE verify read failed: ${verifyError.message}`);
    // Still return the update result even if verify fails
    console.log(`${LOG_PREFIX} SAVE returning update result: cooldown=${data.highlight_cooldown_hours}, conditions=[${data.highlight_conditions?.join(',')}]`);
    return NextResponse.json(data, { headers: CACHE_HEADERS });
  }

  const cooldownMatch = verify.highlight_cooldown_hours === data.highlight_cooldown_hours;
  const conditionsMatch = JSON.stringify(verify.highlight_conditions) === JSON.stringify(data.highlight_conditions);

  if (!cooldownMatch || !conditionsMatch) {
    console.error(
      `${LOG_PREFIX} SAVE VERIFY MISMATCH! ` +
      `update returned cooldown=${data.highlight_cooldown_hours} but DB has ${verify.highlight_cooldown_hours}, ` +
      `update returned conditions=[${data.highlight_conditions?.join(',')}] but DB has [${verify.highlight_conditions?.join(',')}]`
    );
  } else {
    console.log(`${LOG_PREFIX} SAVE verified OK — DB has cooldown=${verify.highlight_cooldown_hours}, conditions=[${verify.highlight_conditions?.join(',')}]`);
  }

  // Always return the VERIFIED data from the fresh read, not the update response
  return NextResponse.json(verify, { headers: CACHE_HEADERS });
}
