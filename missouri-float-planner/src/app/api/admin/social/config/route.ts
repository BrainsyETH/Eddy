// src/app/api/admin/social/config/route.ts
// GET/PUT for social posting configuration (single-row table)

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('social_config')
    .select('*')
    .limit(1)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function PUT(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  const body = await request.json();
  const supabase = createAdminClient();

  // Get existing config ID
  const { data: existing } = await supabase
    .from('social_config')
    .select('id')
    .limit(1)
    .single();

  if (!existing) {
    return NextResponse.json({ error: 'No config row found' }, { status: 404 });
  }

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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
