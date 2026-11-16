import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { campingWebEnabled, regionalStay } from '@/lib/camping/web-data';
import { parseWebStay } from '@/lib/camping/web-search';
import { resolveHorizon } from '@/lib/camping/window';
export const dynamic = 'force-dynamic';
// Public, free Release 1 endpoint. Intentionally outside the x402 route registry.
export async function GET(request: NextRequest) {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!campingWebEnabled())
    return NextResponse.json({ error: 'Not found' }, { status: 404, headers });
  const limited = await rateLimit(
    `camping-stay:${getClientIp(request)}`,
    60,
    60_000,
    { failClosed: true },
  );
  if (limited) return limited;
  const horizon = resolveHorizon(new Date(), 90);
  const stay = parseWebStay(request.nextUrl.searchParams, {
    startDate: horizon.startDate,
    endDateExclusive: horizon.endDate,
  });
  if (!stay)
    return NextResponse.json(
      {
        error:
          'Choose 1–14 nights within the next 90 nights. Only arrival and departure are accepted.',
      },
      { status: 400, headers },
    );
  try {
    return NextResponse.json(await regionalStay(stay.arrival, stay.departure), {
      headers,
    });
  } catch (error) {
    console.error(
      '[camping-stay]',
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json(
      { error: 'Availability could not be checked. Try again.' },
      { status: 503, headers },
    );
  }
}
