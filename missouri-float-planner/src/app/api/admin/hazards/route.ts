import { withAdminMutation } from '@/lib/admin/mutation-audit';
// src/app/api/admin/hazards/route.ts
// GET /api/admin/hazards - List river hazards, filtered and searched server-side
// POST /api/admin/hazards - Create a new river hazard

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth } from '@/lib/admin-auth';
import { listPage, literalContains } from '@/lib/admin/list-filters';
import { HAZARD_COLUMNS, formatHazardRow } from '@/lib/admin/hazard-rows';
import { HAZARD_SEVERITIES, HAZARD_STALE_DAYS, HAZARD_TYPES, parseHazardBody } from '@/lib/admin/hazards';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  try {
    const authError = await requireAdminAuth(request);
    if (authError) return authError;

    const supabase = createAdminClient();
    const url = new URL(request.url);
    const { page, limit, from, to } = listPage(url.searchParams);
    const type = url.searchParams.get('type') ?? 'all';
    const severity = url.searchParams.get('severity') ?? 'all';
    const river = url.searchParams.get('river') ?? 'all';
    // active | inactive | stale (active and not checked in 30 days) | all
    const status = url.searchParams.get('status') ?? 'all';
    const search = (url.searchParams.get('q') ?? '').trim().slice(0, 200);

    if (
      (type !== 'all' && !(HAZARD_TYPES as readonly string[]).includes(type)) ||
      (severity !== 'all' && !(HAZARD_SEVERITIES as readonly string[]).includes(severity)) ||
      (river !== 'all' && !UUID.test(river)) ||
      !['all', 'active', 'inactive', 'stale'].includes(status)
    ) {
      return NextResponse.json({ error: 'Invalid hazard filter' }, { status: 400 });
    }

    // Filters run before pagination, so a match is never hidden on a later page.
    let query = supabase
      .from('river_hazards')
      .select(HAZARD_COLUMNS, { count: 'exact' })
      .order('name', { ascending: true })
      .order('id', { ascending: true });
    if (type !== 'all') query = query.eq('type', type);
    if (severity !== 'all') query = query.eq('severity', severity);
    if (river !== 'all') query = query.eq('river_id', river);
    if (status === 'active') query = query.eq('active', true);
    if (status === 'inactive') query = query.eq('active', false);
    if (status === 'stale') {
      query = query
        .eq('active', true)
        .lt('updated_at', new Date(Date.now() - HAZARD_STALE_DAYS * 86400000).toISOString());
    }
    if (search) {
      const value = literalContains(search);
      query = query.or(`name.ilike.${value},description.ilike.${value}`);
    }

    const [{ data: hazards, error, count }, { data: rivers, error: riverError }] = await Promise.all([
      query.range(from, to),
      // Every river, active or not: a hazard can sit on a river that is hidden.
      supabase.from('rivers').select('id,name').order('name').limit(1000),
    ]);

    if (error || riverError) {
      console.error('Error fetching hazards:', error ?? riverError);
      return NextResponse.json({ error: 'Could not fetch river hazards' }, { status: 500 });
    }

    return NextResponse.json({
      hazards: (hazards ?? []).map(formatHazardRow),
      total: count ?? 0,
      page,
      limit,
      rivers: rivers ?? [],
    });
  } catch (error) {
    console.error('Error in admin hazards endpoint:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function handlePOST(request: NextRequest) {
  try {
    const authError = await requireAdminAuth(request);
    if (authError) return authError;

    const parsed = parseHazardBody(await request.json().catch(() => null), 'create');
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('river_hazards')
      .insert({ active: true, portage_required: false, ...parsed.write })
      .select(HAZARD_COLUMNS)
      .single();

    if (error) {
      console.error('Error creating hazard:', error);
      return NextResponse.json({ error: 'Could not create river hazard' }, { status: 500 });
    }

    return NextResponse.json({ hazard: formatHazardRow(data) }, { status: 201 });
  } catch (error) {
    console.error('Error in create hazard endpoint:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAdminMutation(handlePOST);
