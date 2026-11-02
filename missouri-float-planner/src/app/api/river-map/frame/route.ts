// src/app/api/river-map/frame/route.ts
// GET /api/river-map/frame[?at=ISO] — one recorded national frame.
//
// Without `at`: the newest frame. With `since` (the capturedAt the client
// already holds): 204 when nothing newer exists — frames land every 15 minutes
// and clients poll every 5, so most polls cost a header instead of ~0.5 MB.
// With `at`: the newest frame captured at or before that instant (the replay and 24-hour-comparison read; the oldest
// frame retained is ~8 days back — see src/lib/national-map/frame.ts).
//
// The body is served exactly as the recorder stored it. No frame at all is a
// 503, never an empty 200: an empty country and "we have nothing yet" must not
// look alike to a client that keeps the last good frame on screen.

import { NextRequest, NextResponse } from 'next/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { withX402Route } from '@/lib/x402-config';

export const dynamic = 'force-dynamic';

async function _GET(request: NextRequest) {
  const limited = await rateLimit(`river-map-frame:${getClientIp(request)}`, 60, 60 * 1000);
  if (limited) return limited;

  const atParam = request.nextUrl.searchParams.get('at');
  let at: Date | null = null;
  if (atParam !== null) {
    const t = Date.parse(atParam);
    if (!Number.isFinite(t)) {
      return NextResponse.json({ error: `Invalid 'at': ${atParam}` }, { status: 400 });
    }
    at = new Date(t);
  }

  const sinceParam = request.nextUrl.searchParams.get('since');
  const since = sinceParam !== null ? Date.parse(sinceParam) : NaN;

  try {
    const supabase = createAdminClient();
    if (!at && Number.isFinite(since)) {
      const { data: head, error: headError } = await supabase
        .from('national_map_frames')
        .select('captured_at')
        .order('captured_at', { ascending: false })
        .limit(1);
      if (headError) throw new Error(headError.message);
      const newest = head?.[0] ? Date.parse((head[0] as { captured_at: string }).captured_at) : NaN;
      if (Number.isFinite(newest) && newest <= since) {
        return new NextResponse(null, { status: 204, headers: cdnCacheHeaders(60, 120) });
      }
    }
    let q = supabase
      .from('national_map_frames')
      .select('captured_at, body')
      .order('captured_at', { ascending: false })
      .limit(1);
    if (at) q = q.lte('captured_at', at.toISOString());
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const row = data?.[0] as { captured_at: string; body: unknown } | undefined;
    if (!row) {
      return NextResponse.json({ error: 'No national frame recorded yet' }, { status: 503 });
    }
    // Newest: frames land every 15 minutes, so 5 minutes at the CDN costs at
    // most a third of a capture. An `at` more than an hour back resolves to a
    // frame that can no longer change; a recent or future `at` can still gain
    // a newer frame, so it caches like the newest.
    const settled = at !== null && at.getTime() < Date.now() - 3_600_000;
    const headers = settled ? cdnCacheHeaders(86400, 86400) : cdnCacheHeaders(300, 900);
    return NextResponse.json(row.body, { headers });
  } catch (err) {
    console.error('[river-map/frame] failed:', err);
    return NextResponse.json({ error: 'National frame temporarily unavailable' }, { status: 503 });
  }
}

export const GET = withX402Route(_GET, '/api/river-map/frame');
