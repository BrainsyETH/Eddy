// src/app/api/dams/route.ts
// GET /api/dams — every USACE dam Eddy tracks, with its current state.
//
// ── Assembled ahead of the reader, not stored as history ───────────────────
// This used to read through to CWMS and SWPA on the request, on the reasoning
// that the Corps rewrites its forecast daily and SWPA republishes a rolling
// week, so there is nothing here worth storing. That is still true of KEEPING
// the data and was never true of WHEN it is assembled: the read-through is five
// to fifty seconds cold, the CDN's 900s/3600s window leaves an entry cold about
// seventy-five minutes after the last request, and the iOS map layer, the Today
// tab, Favourites and every river screen all wait on it.
//
// So a cron assembles each dam hourly and this serves what it assembled — one
// row per dam, overwritten in place, never a second copy. See
// src/lib/data/dam-snapshot-store.ts for the full argument and
// /api/cron/sync-dam-snapshots for the writer.
//
// The live read-through is kept as the fallback, so a table that is empty,
// stale, or not yet migrated costs latency and nothing else.
//
// Cached more coarsely than gauge endpoints because generation schedules post
// once each afternoon and pool elevation moves slowly.

import { NextResponse } from 'next/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { fetchDamSummaries, listDamIds, refreshStaleness, summaryOf } from '@/lib/data/dams';
import { readStoredSnapshots } from '@/lib/data/dam-snapshot-store';
import { withX402Route } from '@/lib/x402-config';
import type { DamSnapshot } from '@shared/dam-types';

export const dynamic = 'force-dynamic';

/**
 * Every dam the registry carries: stored where there is a stored row, read
 * live where there is not.
 *
 * ── Why per dam and not all-or-nothing ────────────────────────────────────
 *
 * Because a rule of "serve stored only when every dam has a row" has a cliff in
 * it. One project that never stores — a district publishing nothing, a series
 * id that moved, a dam added between cron passes — would put all twenty back on
 * the live path indefinitely, and nothing would say so: the route would keep
 * answering correctly, just slowly, which is the failure this whole change
 * exists to end and the one it would be hiding.
 *
 * Per dam, a project that cannot be assembled ahead of time costs its own live
 * read and nobody else's. The ORDER is the registry's, not the table's, so the
 * response is the same list in the same order either way.
 */
async function damSummaries(now: number): Promise<DamSnapshot[]> {
  const ids = listDamIds();
  const stored = await readStoredSnapshots({ now });

  // summaryOf answers null for a project no longer in the registry, which
  // cannot happen for an id that came FROM the registry — the narrowing is
  // what makes that unrepresentable rather than assumed.
  const fromStore = new Map<string, DamSnapshot>();
  for (const id of ids) {
    const snapshot = stored.get(id);
    if (!snapshot) continue;
    const summary = summaryOf(refreshStaleness(snapshot, now));
    if (summary) fromStore.set(id, summary);
  }

  const live = await fetchDamSummaries(ids.filter((id) => !fromStore.has(id)));
  for (const summary of live) fromStore.set(summary.id, summary);

  return ids.map((id) => fromStore.get(id)).filter((d): d is DamSnapshot => d !== undefined);
}

async function _GET() {
  try {
    const dams = await damSummaries(Date.now());
    return NextResponse.json(
      { dams },
      { headers: cdnCacheHeaders(900, 3600) }
    );
  } catch (error) {
    console.error('[api/dams] failed:', error);
    return NextResponse.json({ error: 'Failed to fetch dams' }, { status: 500 });
  }
}

export const GET = withX402Route(_GET, '/api/dams');
