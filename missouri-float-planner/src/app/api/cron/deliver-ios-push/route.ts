import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkPushReceipts, enqueuePushDeliveries, sendPendingPushes } from '@/lib/push/expo';
import { releaseCronLock, tryCronLock } from '@/lib/social/cron-lock';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function run(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const admin = createAdminClient();
  if (!await tryCronLock(admin, 'deliver-ios-push', 600)) {
    return NextResponse.json({ ok: true, skipped: 'already_running' });
  }
  try {
    const receipts = await checkPushReceipts(admin);
    const enqueued = await enqueuePushDeliveries(admin);
    const sent = await sendPendingPushes(admin);
    return NextResponse.json({ ok: true, receipts, enqueued, sent, completedAt: new Date().toISOString() });
  } catch (error) {
    console.error('[iOSPush] delivery pass failed:', error);
    return NextResponse.json({ error: 'Push delivery failed' }, { status: 500 });
  } finally {
    await releaseCronLock(admin, 'deliver-ios-push');
  }
}

export const GET = run;
export const POST = run;
