// src/app/api/admin/clips/trigger-pipeline/route.ts
// POST — Dispatch the YouTube clip pipeline GitHub Actions workflow

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import { triggerClipPipeline } from '@/lib/social/video-renderer';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { youtubeUrl, riverSlug, peakNumber, maxClips } = body as {
    youtubeUrl?: string;
    riverSlug?: string;
    peakNumber?: number;
    maxClips?: number;
  };

  const result = await triggerClipPipeline({
    youtubeUrl,
    riverSlug,
    peakNumber: peakNumber || 1,
    maxClips: maxClips || 3,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || 'Failed to dispatch clip pipeline workflow' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, message: 'Clip pipeline dispatched' });
}
