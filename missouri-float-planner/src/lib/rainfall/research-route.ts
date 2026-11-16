import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasValidMachineBearer } from '@/lib/security/machine-auth';
import { releaseCronLock, tryCronLockDetailed } from '@/lib/social/cron-lock';
import { collectResearch } from './research-sync';
import { researchFetch, researchJson } from './research-fetch';

export async function runResearch(request: NextRequest, mode: 'observations' | 'forecasts') {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: 'Cron secret not configured' }, { status: 500 });
  if (!hasValidMachineBearer(request.headers.get('authorization'), process.env.CRON_SECRET)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // Collection can be activated independently of every public rain feature.
  if (process.env.RAINFALL_RESEARCH_ENABLED !== 'true') return NextResponse.json({ monitoring_status: 'skipped', skipped: true });
  const db = createAdminClient(AbortSignal.timeout(280_000)), job = `rainfall_research_${mode}`;
  const lock = await tryCronLockDetailed(db, job, 330);
  if (!lock.acquired) return NextResponse.json({ monitoring_status: lock.reason === 'contended' ? 'skipped' : 'error' }, { status: lock.reason === 'contended' ? 200 : 503 });
  try {
    return NextResponse.json(await collectResearch(db, mode, AbortSignal.timeout(250_000), { json: researchJson, bytes: researchFetch }));
  } catch {
    return NextResponse.json({ monitoring_status: 'error', error: 'Rain research collection failed' }, { status: 503 });
  } finally {
    // Separate deadline: a timed-out collector must still release its lock.
    await releaseCronLock(createAdminClient(AbortSignal.timeout(3000)), job);
  }
}
