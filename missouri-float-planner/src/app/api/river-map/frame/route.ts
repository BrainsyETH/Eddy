// src/app/api/river-map/frame/route.ts
// GET /api/river-map/frame[?at=ISO] — one recorded national frame.
//
// Without `at`: the newest frame. With `since` (the capturedAt the client
// already holds): 204 when nothing newer exists — frames land every 15 minutes
// and clients poll every 5, so most polls cost a header instead of ~0.5 MB.
// With `at`: the newest frame captured at or before that instant (the replay and 24-hour-comparison read; the oldest
// frame retained is ~8 days back — see src/lib/national-map/frame.ts).
//
// The body is served exactly as the recorder stored it.
//
// With `meta=1`: { oldest, newest, count } of the recorded frames — a few
// bytes, so the Change view can say which comparison windows the recorded
// history supports (and when the next one opens) without fetching a frame.
//
// With `trend=1`: { points } — the national flooding trend, one point per
// hour over the last 24 h of recorded frames, from the flood count each frame
// stores at capture (`body->fc`; the NWS rows themselves are ~1.1 MB a frame).
// Counting rules: src/lib/national-map/trend.ts. A capture whose NOAA read
// failed is a gap; a frame recorded before `fc` existed is left out.
//
// FIRST DEPLOY: until the recorder has stored its first frame (within ~15
// minutes of deploy), the newest-frame read builds one live with the same
// capture code (src/lib/national-map/capture.ts), serves it with a short CDN
// lifetime and does NOT store it — a GET never writes. So the map shows real
// readings from the first request instead of an empty country. If that live
// capture fails too, the answer is a 503, never an empty 200: an empty
// country and "we have nothing yet" must not look alike to a client that
// keeps the last good frame on screen.

import { NextRequest, NextResponse } from 'next/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { withX402Route } from '@/lib/x402-config';
import { captureFrame } from '@/lib/national-map/capture';
import { hourlyPicks, trendPointFromFrame, type TrendPoint } from '@/lib/national-map/trend';

export const dynamic = 'force-dynamic';
// The first-deploy bootstrap reads the database and NOAA (~15–25 s measured).
export const maxDuration = 60;

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

  if (request.nextUrl.searchParams.get('meta') === '1') {
    try {
      const supabase = createAdminClient();
      const [oldest, newest, total] = await Promise.all([
        supabase.from('national_map_frames').select('captured_at').order('captured_at', { ascending: true }).limit(1),
        supabase.from('national_map_frames').select('captured_at').order('captured_at', { ascending: false }).limit(1),
        supabase.from('national_map_frames').select('captured_at', { count: 'exact', head: true }),
      ]);
      const err = oldest.error ?? newest.error ?? total.error;
      if (err) throw new Error(err.message);
      const at = (rows: Array<{ captured_at: string }> | null) => (rows?.[0] ? rows[0].captured_at : null);
      return NextResponse.json(
        { oldest: at(oldest.data), newest: at(newest.data), count: total.count ?? 0 },
        { headers: cdnCacheHeaders(300, 600) },
      );
    } catch (err) {
      console.error('[river-map/frame] meta failed:', err);
      return NextResponse.json({ error: 'Frame history temporarily unavailable' }, { status: 503 });
    }
  }

  if (request.nextUrl.searchParams.get('trend') === '1') {
    try {
      const supabase = createAdminClient();
      const since = new Date(Date.now() - 25 * 3_600_000).toISOString();
      const { data: times, error: timesError } = await supabase
        .from('national_map_frames')
        .select('captured_at')
        .gte('captured_at', since)
        .order('captured_at', { ascending: true });
      if (timesError) throw new Error(timesError.message);
      const byMs = new Map<number, string>();
      for (const r of (times ?? []) as Array<{ captured_at: string }>) {
        const t = Date.parse(r.captured_at);
        if (Number.isFinite(t)) byMs.set(t, r.captured_at);
      }
      const picked = hourlyPicks([...byMs.keys()]).map((t) => byMs.get(t)!);
      let points: TrendPoint[] = [];
      if (picked.length) {
        // ~45 ms a frame in production (2026-11-02): each body is detoasted to read two small keys.
        const { data, error } = await supabase
          .from('national_map_frames')
          .select('captured_at, fc:body->fc, sources:body->sources')
          .in('captured_at', picked);
        if (error) throw new Error(error.message);
        points = ((data ?? []) as Array<{ captured_at: string; fc: unknown; sources: { noaaOk?: unknown } | null }>)
          .map((r) => trendPointFromFrame(Date.parse(r.captured_at), r.sources?.noaaOk === true, r.fc))
          .filter((p): p is TrendPoint => p !== null)
          .sort((a, b) => a.t - b.t);
      }
      return NextResponse.json({ points }, { headers: cdnCacheHeaders(600, 1800) });
    } catch (err) {
      console.error('[river-map/frame] trend failed:', err);
      return NextResponse.json({ error: 'Flooding trend temporarily unavailable' }, { status: 503 });
    }
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
      if (at) return NextResponse.json({ error: 'No national frame recorded at or before that time' }, { status: 404 });
      // Nothing recorded yet: serve a live capture, unstored, briefly cached.
      const { frame } = await captureFrame(supabase);
      return NextResponse.json(frame, {
        headers: { ...cdnCacheHeaders(120, 300), 'X-Frame-Source': 'live-bootstrap' },
      });
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
