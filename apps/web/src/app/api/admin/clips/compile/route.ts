// src/app/api/admin/clips/compile/route.ts
// POST — Dispatch the compile-highlights GitHub Actions workflow

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import { triggerCompileHighlights } from '@/lib/social/video-renderer';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { clipIds, title, postIds, outputFilename } = body as {
    clipIds: string[];
    title?: string;
    postIds?: string[];
    outputFilename?: string;
  };

  if (!clipIds || clipIds.length < 2) {
    return NextResponse.json(
      { error: 'Need at least 2 clip IDs' },
      { status: 400 },
    );
  }

  const success = await triggerCompileHighlights({
    clipIds: clipIds.join(','),
    title: title || '',
    postIds: postIds?.join(',') || '',
    outputFilename: outputFilename || `montage-${Date.now()}`,
  });

  if (!success) {
    return NextResponse.json(
      { error: 'Failed to dispatch highlights workflow' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, message: 'Highlights compilation dispatched' });
}
