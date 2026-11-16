// src/lib/data/dam-page-snapshot.ts
// The dam detail page's snapshot, read when the request arrives.
//
// The page used to be ISR (`revalidate = 60`) over pageDam (`unstable_cache`,
// revalidate 60). Both layers are stale-while-revalidate with no upper bound
// on age, so the first request after a quiet stretch got HTML rendered at the
// last visit, whenever that was. On 2026-11-08, Stockton, Truman, Mark Twain
// and Robert S. Kerr served "Today's generation · Sat, Nov 7". The client
// corrected itself after hydration, but the server HTML, which crawlers and
// link previews keep, still carried yesterday's date.
//
// The page now reads what /api/dams/[damId] reads: the cron-assembled stored
// row, trusted only while isFresh says so (MAX_AGE_MS), with each metric's
// staleness re-banded against the request clock (refreshStaleness), and a live
// read only when no usable row exists. The page renders per request
// (connection()), so the day the schedule calls Today is the reader's day.
// pageDam itself is unchanged; embeds still use it.

import { fetchDamDetail, refreshStaleness, type DamSnapshot } from './dams';
import { readStoredSnapshot } from './dam-snapshot-store';
import { getUsaceDam } from '@/lib/flow-providers/usace-registry';

export interface DamPageSnapshotSources {
  readStored: typeof readStoredSnapshot;
  readLive: typeof fetchDamDetail;
}

const SOURCES: DamPageSnapshotSources = { readStored: readStoredSnapshot, readLive: fetchDamDetail };

/** One dam for the detail page, as of `now`. Null only for an id the registry does not carry. */
export async function loadDamPageSnapshot(
  damId: string,
  now: number,
  sources: DamPageSnapshotSources = SOURCES,
): Promise<DamSnapshot | null> {
  // The registry decides what a dam is, not the table: same rule as the API route.
  if (!getUsaceDam(damId)) return null;
  const stored = await sources.readStored(damId, { now });
  if (stored) return refreshStaleness(stored, now);
  // Missing, too old, or unreadable. The live read never throws and dates
  // every value it returns; a total outage yields an empty snapshot that the
  // page renders as unavailable, not as a stale one.
  //
  // A deliberate trade-off, decided at review (2026-11): availability over a
  // uniformly fast first load. During a sync-job or database outage, each
  // request pays an upstream read (cold reads measured up to ~8s; CWMS/SWPA
  // fetches still share their own fetch cache). The alternative, rendering
  // the empty state with no upstream call, cannot recover on the client:
  // useDamPageClock's router.refresh() re-runs this same loader, so the page
  // would stay empty until the cron wrote a row again.
  return sources.readLive(damId);
}
