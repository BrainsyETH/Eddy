// src/app/api/admin/clips/route.ts
// GET — List clips from clip_library with optional filters

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const riverSlug = searchParams.get('river_slug');
  const brandStatus = searchParams.get('brand_status');
  const contentType = searchParams.get('content_type');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  const supabase = createAdminClient();

  let query = supabase
    .from('clip_library')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (riverSlug) query = query.eq('river_slug', riverSlug);
  if (brandStatus) query = query.eq('brand_check_status', brandStatus);
  if (contentType) query = query.eq('content_type', contentType);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ clips: data, total: count });
}
