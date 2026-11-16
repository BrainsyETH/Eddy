// src/app/api/cron/generate-dam-updates/route.ts
// Hourly cron: writes Eddy's Read for each dam in DAM_READ_DAM_IDS when it is
// due, and only then. "Due" is dam-update-policy.ts's needsRewrite: no Read
// for today yet, a new posted SWPA schedule, or six hours since the last one.
// Most runs write nothing; the run after midnight Central and the run after
// SWPA's overnight posting (usually by about 04:35 Central) are the ones that do.
//
// SCHEDULED AT :47 (vercel.json), after sync-dam-snapshots at :35, so a new
// schedule version is in the snapshot this reads.

import { withJobRun } from '@/lib/admin/dashboard/job-run';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { tryCronLock, releaseCronLock } from '@/lib/social/cron-lock';
import { DAM_READ_DAM_IDS } from '@/lib/eddy/dam-read-facts';
import { currentDamSnapshot, generateDamUpdate, scheduleHashOf } from '@/lib/eddy/generate-dam-update';
import {
  DAM_UPDATE_RETENTION_DAYS,
  damReadExpiresAt,
  needsRewrite,
} from '@/lib/eddy/dam-update-policy';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const JOB = 'generate_dam_updates';

async function runGeneration(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[DamUpdatesCron] CRON_SECRET not configured');
    return NextResponse.json({ error: 'Cron secret not configured' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!(await tryCronLock(supabase, JOB, 280))) {
    return NextResponse.json({ skipped: 'another run holds the lock' });
  }

  const now = Date.now();
  const written: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  try {
    // ?force=1 rewrites every dam, for a manual run after a wording change.
    const force = request.nextUrl.searchParams.get('force') === '1';

    for (const damId of DAM_READ_DAM_IDS) {
      try {
        const snapshot = await currentDamSnapshot(damId, now);
        const hash = snapshot ? scheduleHashOf(snapshot) : null;
        const { data: latest, error: readError } = await supabase
          .from('dam_updates')
          .select('generated_at, schedule_hash')
          .eq('dam_id', damId)
          .order('generated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (readError) throw new Error(`read latest: ${readError.message}`);

        const due = force || needsRewrite(
          latest ? { generatedAt: latest.generated_at, scheduleHash: latest.schedule_hash } : null,
          hash,
          now,
        );
        if (!due) {
          skipped.push(damId);
          continue;
        }

        const update = await generateDamUpdate(damId, now);
        if (!update) {
          skipped.push(damId);
          continue;
        }

        const { error } = await supabase.from('dam_updates').insert({
          dam_id: update.damId,
          // The headline and story as written, kept for the record. The route
          // re-renders the whole Read from `facts` against the schedule posted
          // when it is served. Written in code, so no model or token columns.
          summary_text: update.headline,
          eddy_read: null,
          quote_text: update.story,
          facts: update.facts,
          schedule_hash: update.scheduleHash,
          used_fallback: false,
          sources_used: update.sourcesUsed,
          generated_at: new Date(now).toISOString(),
          expires_at: damReadExpiresAt(now),
        });
        if (error) throw new Error(`insert: ${error.message}`);
        written.push(damId);
      } catch (err) {
        errors.push(`${damId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    await supabase
      .from('dam_updates')
      .delete()
      .lt('generated_at', new Date(now - DAM_UPDATE_RETENTION_DAYS * 86_400_000).toISOString());
  } finally {
    await releaseCronLock(supabase, JOB);
  }

  return NextResponse.json({
    message: 'Dam Read generation complete',
    written,
    skipped,
    errors: errors.length ? errors : undefined,
  }, { status: errors.length === DAM_READ_DAM_IDS.length ? 500 : 200 });
}

async function handleGET(request: NextRequest) {
  return runGeneration(request);
}

async function handlePOST(request: NextRequest) {
  return runGeneration(request);
}

export const GET = withJobRun('generate-dam-updates', handleGET);

export const POST = withJobRun('generate-dam-updates', handlePOST);
