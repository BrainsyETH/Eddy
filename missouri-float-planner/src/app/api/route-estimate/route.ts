import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { estimateRoute, RouteEstimateError } from '@/lib/calculations/route-estimate';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const limited = await rateLimit(`route-estimate:${getClientIp(request)}`, 30, 60_000);
  if (limited) return limited;
  const p = request.nextUrl.searchParams;
  const riverId = p.get('riverId'), startId = p.get('startId'), endId = p.get('endId');
  if (!riverId || !startId || !endId) return NextResponse.json({ error: 'Missing route endpoints' }, { status: 400 });
  try {
    const result = await estimateRoute(await createClient(), { riverId, startId, endId, vesselTypeId: p.get('vesselTypeId') });
    return NextResponse.json({ distanceMiles: result.distanceMiles, floatTime: result.floatTime,
      floatTimeWithheldReason: result.withholdReason, estimateBasis: result.estimateBasis, estimatedAt: result.estimatedAt });
  } catch (error) {
    return NextResponse.json({ error: error instanceof RouteEstimateError ? error.message : 'Could not estimate route' },
      { status: error instanceof RouteEstimateError ? error.status : 500 });
  }
}
