import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { loadCampingOverview } from '@/lib/camping/overview';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const limited = await rateLimit(
    `camping-overview:${getClientIp(request)}`,
    60,
    60000,
  );
  if (limited) return limited;
  try {
    const result = await loadCampingOverview(await createClient());
    return NextResponse.json(result, { headers: cdnCacheHeaders(300, 300) });
  } catch (error) {
    console.error('[camping-overview]', error);
    return NextResponse.json(
      { error: 'Camping availability is temporarily unavailable' },
      { status: 503 },
    );
  }
}
