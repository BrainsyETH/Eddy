import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { campingWebEnabled, readWebFacilityStay } from '@/lib/camping/web-data';
import { parseWebStay } from '@/lib/camping/web-search';
import { resolveHorizon } from '@/lib/camping/window';

export const dynamic = 'force-dynamic';

// Web hub only. Existing clients continue using the unchanged /api/campsites.
export async function GET(request: NextRequest) {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!campingWebEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404, headers });
  const limited = await rateLimit(`camping-stay:${getClientIp(request)}`, 60, 60_000, { failClosed: true });
  if (limited) return limited;
  const params = new URLSearchParams(request.nextUrl.searchParams);
  const facilities = params.getAll('facility');
  params.delete('facility');
  const horizon = resolveHorizon(new Date(), 90);
  const stay = parseWebStay(params, { startDate: horizon.startDate, endDateExclusive: horizon.endDate });
  if (facilities.length !== 1 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(facilities[0]) || !stay) {
    return NextResponse.json({ error: 'Choose a campground and 1–14 nights within the next 90 nights.' }, { status: 400, headers });
  }
  try {
    const result = await readWebFacilityStay(facilities[0], stay.arrival, stay.departure);
    return result
      ? NextResponse.json(result, { headers })
      : NextResponse.json({ error: 'No sites for this facility' }, { status: 404, headers });
  } catch (error) {
    console.error('[camping-sites]', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Site availability could not be checked. Try again.' }, { status: 503, headers });
  }
}
