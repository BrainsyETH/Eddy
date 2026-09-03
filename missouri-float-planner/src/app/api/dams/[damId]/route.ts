// src/app/api/dams/[damId]/route.ts
// GET /api/dams/[damId] — one dam, with the multi-day hourly generation
// schedule the index omits.
//
// damId is an Eddy slug ('swl-table-rock-dam'), not a CWMS location name —
// those contain spaces and percent signs and cannot be a URL segment. See
// src/lib/flow-providers/usace-registry.ts.
//
// ── Assembled ahead of the reader ──────────────────────────────────────────
// This is the eight-second route. Seven CWMS series, up to three SWPA files,
// the pattern table and a forecast series, per project, with twenty projects on
// twenty CDN keys that go cold about seventy-five minutes after the last
// request — so most first visits to a dam page paid the whole assembly, and the
// iOS screen showed a full-screen spinner for the duration.
//
// A cron now assembles each dam hourly and this serves what it assembled. The
// live read is kept as the fallback for a row that is missing, stale, or a
// table not yet migrated. See src/lib/data/dam-snapshot-store.ts.

import { NextRequest, NextResponse } from 'next/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { fetchDamDetail, refreshStaleness } from '@/lib/data/dams';
import { readStoredSnapshot } from '@/lib/data/dam-snapshot-store';
import { getUsaceDam } from '@/lib/flow-providers/usace-registry';
import { withX402Route } from '@/lib/x402-config';

export const dynamic = 'force-dynamic';

async function _GET(
  _request: NextRequest,
  { params }: { params: Promise<{ damId: string }> }
) {
  try {
    const { damId } = await params;
    const now = Date.now();

    // The registry decides what a dam is, not the table. The index route asks
    // summaryOf, which refuses an id the registry no longer carries; this route
    // read the stored row first and would have served a decommissioned or
    // renamed dam for up to an hour, until the cron pruned it.
    if (!getUsaceDam(damId)) {
      return NextResponse.json({ error: 'Dam not found' }, { status: 404 });
    }

    // Re-banded against THIS clock, never served with the staleness it was
    // stamped with an hour ago — see refreshStaleness. Everything else in the
    // payload dates itself.
    const stored = await readStoredSnapshot(damId, { now });
    const dam = stored ? refreshStaleness(stored, now) : await fetchDamDetail(damId);

    if (!dam) {
      return NextResponse.json({ error: 'Dam not found' }, { status: 404 });
    }

    return NextResponse.json(dam, { headers: cdnCacheHeaders(900, 3600) });
  } catch (error) {
    console.error('[api/dams/:damId] failed:', error);
    return NextResponse.json({ error: 'Failed to fetch dam' }, { status: 500 });
  }
}

export const GET = withX402Route<{ params: Promise<{ damId: string }> }>(
  _GET,
  '/api/dams/:damId',
);
