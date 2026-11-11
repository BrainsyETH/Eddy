import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const denied = await requireAdminAuth(request);
  if (denied) return denied;
  const db = createAdminClient();
  const results = await Promise.allSettled([
    db
      .from('admin_incidents')
      .select('*')
      .order('last_seen_at', { ascending: false })
      .limit(100)
      .abortSignal(AbortSignal.timeout(5000)),
    db
      .from('admin_jobs')
      .select('id,kind,state,output,error,created_at,updated_at')
      .order('created_at', { ascending: false })
      .limit(50)
      .abortSignal(AbortSignal.timeout(5000)),
    db
      .from('admin_job_runs')
      .select('id,job,status,started_at,finished_at,duration_ms')
      .order('started_at', { ascending: false })
      .limit(100)
      .abortSignal(AbortSignal.timeout(5000)),
  ]);
  const read = (index: number) => {
    const r = results[index];
    return r.status === 'fulfilled' && !r.value.error
      ? { state: 'ok', rows: r.value.data }
      : { state: 'unknown', rows: null };
  };
  return NextResponse.json(
    {
      incidents: read(0),
      jobs: read(1),
      runs: read(2),
      deployment: {
        servingCommit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
        servingUrl: process.env.VERCEL_URL ?? null,
        environment: process.env.VERCEL_ENV ?? 'local',
        latestAttempt: 'See Vercel deployment history',
      },
      monitor: {
        configured: !!process.env.ADMIN_MONITOR_SECRET,
        lastCheck: null,
      },
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
