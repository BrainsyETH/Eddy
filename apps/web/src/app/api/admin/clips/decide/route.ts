// src/app/api/admin/clips/decide/route.ts
// GET — Preview what the content decision engine would recommend next

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import { decideNextPost } from '@/lib/social/content-decision-engine';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  try {
    const decision = await decideNextPost();
    return NextResponse.json({ decision });
  } catch (error) {
    console.error('[DecisionPreview] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate decision' },
      { status: 500 },
    );
  }
}
