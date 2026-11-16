import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasValidMachineBearer } from '@/lib/security/machine-auth';
export const dynamic = 'force-dynamic';
/** Dedicated read-only monitoring credential, not an admin/cron credential. */
export async function GET(request: NextRequest) {
  const secret = process.env.ADMIN_MONITOR_SECRET;
  if (
    !secret ||
    !hasValidMachineBearer(request.headers.get('authorization'), secret)
  )
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  let ok = false;
  try {
    const { error } = await createAdminClient()
      .from('rivers')
      .select('id')
      .limit(1)
      .abortSignal(AbortSignal.timeout(3000));
    ok = !error;
  } catch {}
  return NextResponse.json(
    { ok, checkedAt: new Date().toISOString() },
    {
      status: ok ? 200 : 503,
      headers: { 'Cache-Control': 'private, no-store' },
    },
  );
}
