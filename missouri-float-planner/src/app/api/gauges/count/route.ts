import { NextResponse } from 'next/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const headers = cdnCacheHeaders(3600, 86400);
  try {
    const { count, error } = await createAdminClient()
      .from('gauge_stations')
      .select('*', { count: 'exact', head: true });

    if (error) throw error;
    return NextResponse.json({ count: count ?? null }, { headers });
  } catch (error) {
    console.error('[api/gauges/count] failed:', error);
    // This number is supporting context, never a reason to fail the screen.
    return NextResponse.json({ count: null }, { headers });
  }
}
