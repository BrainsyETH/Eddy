// src/app/api/admin/lake-launches/route.ts
// GET /api/admin/lake-launches?lake=<slug> — every launch row on a lake,
// approved or not, for the review screen (/admin/lakes).

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth } from '@/lib/admin-auth';
import { LAKES } from '@/lib/lakes/registry';

export const dynamic = 'force-dynamic';

export const LAUNCH_ADMIN_COLUMNS =
  'id, lake_slug, slug, name, longitude, latitude, launch_methods, amenities, managing_agency, fee_required, ramp_bottom_elev_ft, ramp_closure_elev_ft, elev_datum, elev_source, elev_source_updated_at, access_point_id, sources, review_note, approved, approved_at, created_at, updated_at';

export async function GET(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;
  const lake = request.nextUrl.searchParams.get('lake');
  if (lake && !LAKES[lake]) return NextResponse.json({ error: 'Unknown lake' }, { status: 400 });
  const supabase = createAdminClient();
  let query = supabase.from('lake_launches').select(LAUNCH_ADMIN_COLUMNS).order('approved', { ascending: true }).order('name', { ascending: true }).limit(500);
  if (lake) query = query.eq('lake_slug', lake);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lakes: Object.values(LAKES).map((l) => ({ slug: l.slug, name: l.name })), launches: data ?? [] });
}
