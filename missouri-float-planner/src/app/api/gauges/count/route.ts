import { NextResponse } from 'next/server';
import { cdnCacheHeaders, privateNoStore } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { count, error } = await createAdminClient()
      .from('gauge_stations')
      .select('*', { count: 'exact', head: true });

    if (error) throw error;
    return NextResponse.json(
      { count: count ?? null },
      { headers: cdnCacheHeaders(3600, 86400) },
    );
  } catch (error) {
    console.error('[api/gauges/count] failed:', error);
    // This number is supporting context, never a reason to fail the screen.
    // Do not turn one database blip into a day of cached missing trust copy.
    return NextResponse.json({ count: null }, { headers: privateNoStore() });
  }
}
