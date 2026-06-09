// src/app/api/admin/social/preflight/route.ts
// Admin-auth wrapper around runPreflight() — for manual checks from the
// admin dashboard or curl. The cron version lives at
// /api/cron/social-preflight and uses CRON_SECRET auth.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import { runPreflight } from '@/lib/social/preflight';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  const result = await runPreflight();
  return NextResponse.json(result, { status: result.httpStatus });
}
