// src/app/api/cron/sync-dam-snapshots/route.ts
// GET/POST /api/cron/sync-dam-snapshots — assemble every dam's page before
// anybody asks for it.
//
// Writes one DamSnapshot per project into dam_snapshots, which /api/dams and
// /api/dams/[damId] then serve. The reason is latency and nothing else: a cold
// detail read is eight seconds of CWMS, SWPA, the pattern table and a forecast
// series, and with twenty dams on twenty CDN keys most first visits pay it.
// See the header of src/lib/data/dam-snapshot-store.ts.
//
// ── Why the DETAIL and not the summary ─────────────────────────────────────
// Because the detail is a superset and the summary is a pure projection of it
// (summaryOf), so one read per dam serves both routes. Assembling them
// separately would ask CWMS for the same three series twice an hour to produce
// two payloads that cannot legally disagree.
//
// ── Why not part of sync-dam-history ───────────────────────────────────────
// That route is the writer of record for observations and passes skipCache
// deliberately, because serving it a cached window would store the same hours
// forever. This one wants the opposite: it reads exactly what a reader would
// have read, cache and all, because what it is storing IS a reader's response.
// Folding them would mean one route with two cache policies.
//
// SCHEDULED AT :35 (vercel.json) — update-gauges holds the cron lock table at
// :00 and every 15 minutes, sync-gauge-latest at :20, sync-dam-history at :25.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { tryCronLock, releaseCronLock } from '@/lib/social/cron-lock';
import { logger } from '@/lib/logger';
import { fetchDamDetail, listDamIds } from '@/lib/data/dams';
import {
  decideWrites,
  pruneStoredSnapshots,
  writeStoredSnapshots,
} from '@/lib/data/dam-snapshot-store';

export const dynamic = 'force-dynamic';
// Twenty dams at four in flight, each reading seven CWMS series plus SWPA, the
// pattern table and a forecast. The equivalent work behind a single page is
// measured at ~8s cold; twenty of them, five deep, is comfortably inside this
// and nowhere near it on a good day. Mirrored in vercel.json's `functions`,
// which is what applies it on deploy.
export const maxDuration = 300;

const JOB = 'sync_dam_snapshots';

/** Parallel dams. CDA is the constraint, not us — the ceiling readMetrics uses. */
const DAM_CONCURRENCY = 4;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return out;
}

async function runSync(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('CRON_SECRET not configured');
    return NextResponse.json({ error: 'Cron secret not configured' }, { status: 500 });
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  const locked = await tryCronLock(supabase, JOB, 280);
  if (!locked) {
    return NextResponse.json({ skipped: 'another run holds the lock' });
  }

  const startedAt = Date.now();
  let stored = 0;
  let keptOnOutage = 0;

  try {
    const ids = listDamIds();

    const snapshots = await mapWithConcurrency(ids, DAM_CONCURRENCY, async (id) => {
      try {
        return await fetchDamDetail(id);
      } catch (err) {
        // fetchDamDetail is documented as never throwing; this is here so that
        // if that ever stops being true, one bad project costs one row rather
        // than the whole pass.
        logger.warn('sync-dam-snapshots: dam failed', {
          damId: id,
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      }
    });

    const decided = decideWrites(snapshots);
    keptOnOutage = decided.keptOnOutage;

    stored = await writeStoredSnapshots(supabase, decided.writable, startedAt);
    await pruneStoredSnapshots(supabase, ids);
  } finally {
    await releaseCronLock(supabase, JOB);
  }

  return NextResponse.json({
    ok: true,
    durationMs: Date.now() - startedAt,
    stored,
    // Counted and returned rather than logged only: a rising keptOnOutage is
    // how a district quietly changing its series ids shows up, and it is
    // invisible from the routes — they keep serving the last good row until it
    // ages out, then read through, and answer correctly the whole time. A
    // number equal to the dam count is an upstream outage, not a code problem.
    keptOnOutage,
  });
}

export async function GET(request: NextRequest) {
  return runSync(request);
}

export async function POST(request: NextRequest) {
  return runSync(request);
}
