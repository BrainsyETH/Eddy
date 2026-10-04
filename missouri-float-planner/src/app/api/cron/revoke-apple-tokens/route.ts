import { NextRequest, NextResponse } from 'next/server';
import { withJobRun } from '@/lib/admin/dashboard/job-run';
import { drainAppleRevocations } from '@/lib/apple/revocation-queue';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasValidMachineBearer } from '@/lib/security/machine-auth';
import { releaseCronLock, tryCronLockDetailed } from '@/lib/social/cron-lock';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const JOB = 'revoke_apple_tokens';

async function run(request: NextRequest) {
  if (!hasValidMachineBearer(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const admin = createAdminClient();
  const lock = await tryCronLockDetailed(admin, JOB, 90);
  if (!lock.acquired) {
    return NextResponse.json({ ok: lock.reason === 'contended', skipped: true, reason: lock.reason },
      { status: lock.reason === 'contended' ? 200 : 503 });
  }
  try {
    const result = await drainAppleRevocations(admin);
    logger.info('[apple-revocation] pass complete', result);
    // Pending failures are visible in job monitoring, even though retries persist.
    return NextResponse.json({ ok: result.pending === 0, ...result }, { status: result.pending ? 503 : 200 });
  } catch {
    logger.error('[apple-revocation] queue unavailable');
    return NextResponse.json({ error: 'Apple revocation queue unavailable' }, { status: 503 });
  } finally {
    await releaseCronLock(admin, JOB);
  }
}

export const GET = withJobRun('revoke-apple-tokens', run);
export const POST = withJobRun('revoke-apple-tokens', run);
