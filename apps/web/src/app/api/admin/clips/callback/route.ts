// src/app/api/admin/clips/callback/route.ts
// POST — Receives results from YouTube clip pipeline GitHub Actions workflow

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // Verify cron secret
  const auth = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { clips, status, error } = body as {
    clips?: Array<{
      youtube_video_id: string;
      clip_url: string;
      river_slug?: string;
      source_creator?: string;
    }>;
    status: 'completed' | 'failed';
    error?: string;
  };

  if (status === 'failed') {
    console.error('[ClipPipeline Callback] Pipeline failed:', error);
    return NextResponse.json({ ok: true, message: 'Failure acknowledged' });
  }

  console.log(`[ClipPipeline Callback] Received ${clips?.length || 0} clips`);

  return NextResponse.json({
    ok: true,
    message: `Processed ${clips?.length || 0} clips`,
  });
}
