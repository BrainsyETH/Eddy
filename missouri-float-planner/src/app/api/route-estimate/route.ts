import { privateNoStore } from '@/lib/api-utils';
import { withX402Route } from '@/lib/x402-config';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { estimateRoute, RouteEstimateError, startConditionFromEstimate } from '@/lib/calculations/route-estimate';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
export const dynamic = 'force-dynamic';
async function _GET(request: NextRequest) {
  const limited = await rateLimit(`route-estimate:${getClientIp(request)}`, 30, 60_000);
  if (limited) return limited;
  const p = request.nextUrl.searchParams;
  const riverId = p.get('riverId'), startId = p.get('startId'), endId = p.get('endId');
  if (!riverId || !startId || !endId) return NextResponse.json({ error: 'Missing route endpoints' }, { status: 400 });
  const rawStartMile = p.get('startRiverMile');
  const startRiverMile = rawStartMile == null ? undefined : Number(rawStartMile);
  if (rawStartMile != null && (!rawStartMile.trim() || !Number.isFinite(startRiverMile))) {
    return NextResponse.json({ error: 'Invalid starting river mile' }, { status: 400 });
  }
  try {
    const result = await estimateRoute(await createClient(), { riverId, startId, endId, vesselTypeId: p.get('vesselTypeId'), startRiverMile });
    // Additive: the condition a float started here keeps in its recap. Older
    // binaries ignore it; omitted when the code is unknown.
    const condition = startConditionFromEstimate(result);
    return NextResponse.json({ startRiverMile: startRiverMile ?? null, distanceMiles: result.distanceMiles, floatTime: result.floatTime,
      floatTimeWithheldReason: result.withholdReason, estimateBasis: result.estimateBasis, estimatedAt: result.estimatedAt,
      ...(condition ? { condition } : {}) }, { headers: privateNoStore() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof RouteEstimateError ? error.message : 'Could not estimate route' },
      { status: error instanceof RouteEstimateError ? error.status : 500 });
  }
}

export const GET = withX402Route(_GET, '/api/route-estimate');
