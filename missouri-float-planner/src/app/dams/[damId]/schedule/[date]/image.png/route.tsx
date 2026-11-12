import { NextRequest, NextResponse } from 'next/server';
import { damScheduleFileName, damScheduleImagePath, validScheduleDate } from '@shared/dam-schedule-share';
import { getUsaceDam } from '@/lib/flow-providers/usace-registry';
import { loadDamScheduleShare } from '@/lib/dam-schedule-share';
import { renderDamSchedule } from '@/lib/og/render-dam-schedule';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { DAM_SCHEDULE_ROBOTS_HEADER, damScheduleExpired } from '@/lib/dam-schedule-indexing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: {
  params: Promise<{ damId: string; date: string }>;
}) {
  const { damId, date } = await params;
  const unavailable = (status: number, error: string) => NextResponse.json({ error }, {
    status, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': DAM_SCHEDULE_ROBOTS_HEADER,
      ...(status === 503 ? { 'Retry-After': '60' } : {}) },
  });
  if (!validScheduleDate(date) || !getUsaceDam(damId)?.swpaCode)
    return unavailable(404, 'Schedule not found');
  if (damScheduleExpired(date)) return unavailable(410, 'This dated schedule has expired. Open the dam for the latest schedule.');
  if (request.nextUrl.search) return NextResponse.redirect(new URL(damScheduleImagePath(damId, date), request.url), 308);
  const limited = await rateLimit(`dam-schedule-image:${getClientIp(request)}`, 60, 60_000, { failClosed: true });
  if (limited) {
    limited.headers.set('Cache-Control', 'no-store');
    limited.headers.set('X-Robots-Tag', DAM_SCHEDULE_ROBOTS_HEADER);
    return limited;
  }
  try {
    const model = await loadDamScheduleShare(damId, date);
    if (!model) return unavailable(503, 'The posted schedule is temporarily unavailable. Try again or open the dam for the latest information.');
    return new Response(await renderDamSchedule(model), {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `inline; filename="${damScheduleFileName(damId, date)}.png"`,
        'Cache-Control': 'public, max-age=60, s-maxage=300',
        'X-Content-Type-Options': 'nosniff',
        'X-Robots-Tag': DAM_SCHEDULE_ROBOTS_HEADER,
      },
    });
  } catch {
    return unavailable(503, 'Could not prepare this schedule image. Please try again.');
  }
}
