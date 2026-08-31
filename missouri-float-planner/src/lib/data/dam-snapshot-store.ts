// src/lib/data/dam-snapshot-store.ts
// The stored half of a dam snapshot — assembled on a schedule, not per reader.
//
// ── Against the module that says not to store dam data ─────────────────────
//
// src/lib/data/dams.ts opens with READ-THROUGH, NOT STORED, and the argument is
// good: the Corps rewrites its release forecast daily and SWPA republishes
// seven schedule files on a rolling week, so yesterday's copy of either is
// worthless. dam-metric-history made the same case for observations and stored
// those. This is the third exception, and it is a different one again.
//
// Nothing here is kept for its history. The table holds exactly one row per
// dam, overwritten every hour, and a row is worth reading for as long as the
// snapshot inside it would have been worth assembling. What it buys is that
// the assembly does not happen while somebody is waiting:
//
//   /api/dams/[damId] reads seven CWMS series, up to three SWPA files, the
//   pattern table and a forecast series, per project. Measured cold: 8.16s.
//   The CDN entry that follows it: 0.12s. There are twenty dams, each with its
//   own cache key, and cdnCacheHeaders(900, 3600) means an entry goes cold
//   about seventy-five minutes after anyone last asked — so on a product this
//   size, most first visits to a dam page pay the full 8 seconds.
//
// A cache with a 75-minute horizon cannot fix that; only assembling ahead of
// the reader can. The cron does the reading, this table holds the answer, and
// the routes serve it.
//
// ── What is NOT solved by storing ──────────────────────────────────────────
//
// Freshness. A stored snapshot is by definition older than a live one, so:
//
//   1. Every metric carries its own observation time, and the routes re-band
//      `staleness` against the serving clock — see refreshStaleness in dams.ts.
//      A stored reading therefore ages honestly instead of insisting it is
//      fresh.
//   2. Past MAX_AGE_MS a row is ignored entirely and the route reads through
//      live. That is the behaviour this whole change is trying to avoid, which
//      is the point: a dead cron degrades to what the product did yesterday
//      rather than serving a schedule from last week.
//
// Reads and writes both go through the service client. The table carries no
// anon or authenticated grant and no RLS policy (see the migration header): its
// only readers are the two dam routes, and its only writer is
// /api/cron/sync-dam-snapshots.

import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { declaresNoSources } from '@/lib/data/dams';
import { getUsaceDam } from '@/lib/flow-providers/usace-registry';
import type { DamSnapshot } from '@shared/dam-types';

const TABLE = 'dam_snapshots';

/**
 * How old a stored snapshot may be before the routes stop trusting it.
 *
 * The cron runs hourly, so three hours is three consecutive failures — past
 * coincidence, and the point at which "the schedule Eddy is showing" and "the
 * schedule SWPA published" can genuinely differ, because SWPA republishes in
 * the afternoon and a stale row could straddle that.
 *
 * NOT derived from the CDN's s-maxage. That governs how long an assembled
 * response may be re-served; this governs how long an assembly is worth
 * re-serving at all. They answer different questions and a shared constant
 * would tie a cache policy to a data-quality bound.
 */
export const MAX_AGE_MS = 3 * 60 * 60 * 1000;

interface Row {
  dam_id: string;
  payload: DamSnapshot;
  built_at: string;
}

/**
 * Is this row still worth serving?
 *
 * Pure and exported so the routes and the tests agree on one definition of too
 * old, rather than each comparing against MAX_AGE_MS in its own direction.
 */
export function isFresh(builtAt: string, now = Date.now()): boolean {
  const at = Date.parse(builtAt);
  // An unparseable stamp is not "probably fine". It is a row this code cannot
  // date, and an undatable snapshot has to be read through.
  if (!Number.isFinite(at)) return false;
  const age = now - at;
  // A row from the future is a clock disagreement between the cron's host and
  // this one, not a reason to discard a snapshot that was just written.
  return age < MAX_AGE_MS;
}

/**
 * Every stored snapshot that is still fresh, by dam id.
 *
 * Returns an EMPTY MAP — never throws — when the table is unreachable or has
 * not been migrated yet. The caller's job is then to read through live, which
 * is what the product did before this table existed, so a database problem
 * costs latency rather than the dam layer.
 *
 * ── Whole payloads, including the pattern ─────────────────────────────────
 *
 * /api/dams narrows each one to a summary and throws the rest away, which
 * looks wasteful and is not worth avoiding: a detail payload is around ten
 * kilobytes and this route is CDN-cached for 900s, so the origin reads it a
 * handful of times an hour. Splitting the row into a stored summary and a
 * stored detail to save that would put two copies of one snapshot in one row,
 * with a rule that they must never disagree.
 *
 * There is no way to ask for a STALE row. An escape hatch existed here briefly,
 * for a version of decideWrites that decided what to store by looking at what
 * was already stored; that rule turned out to be wrong on a first deploy and is
 * gone, and with it the only caller that would ever have wanted one. Reading
 * past MAX_AGE_MS is the thing the bound exists to prevent.
 */
export async function readStoredSnapshots(
  options?: { now?: number },
): Promise<Map<string, DamSnapshot>> {
  const now = options?.now ?? Date.now();
  const out = new Map<string, DamSnapshot>();

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.from(TABLE).select('dam_id, payload, built_at');
    if (error) {
      logger.warn('dam-snapshot-store: read failed', { error: error.message });
      return out;
    }
    for (const row of (data ?? []) as unknown as Row[]) {
      if (!row.dam_id || !row.payload) continue;
      if (!isFresh(row.built_at, now)) continue;
      out.set(row.dam_id, row.payload);
    }
  } catch (err) {
    logger.warn('dam-snapshot-store: read threw', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return out;
}

/**
 * One dam's stored snapshot, or null.
 *
 * A separate query rather than a filter over readStoredSnapshots: the detail
 * route wants one project and the index wants all of them, and making the
 * single-dam page pay for twenty payloads — each carrying a week of hourly
 * pattern — would be a second version of the problem this table exists to fix.
 */
export async function readStoredSnapshot(
  damId: string,
  options?: { now?: number },
): Promise<DamSnapshot | null> {
  const now = options?.now ?? Date.now();

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from(TABLE)
      .select('dam_id, payload, built_at')
      .eq('dam_id', damId)
      .maybeSingle();
    if (error || !data) return null;

    const row = data as unknown as Row;
    if (!row.payload || !isFresh(row.built_at, now)) return null;
    return row.payload;
  } catch {
    return null;
  }
}

/**
 * Does this snapshot say anything?
 *
 * The same test the dam screen uses to decide whether it has anything to draw.
 * fetchDamDetail never throws — every source it reads is caught and contributes
 * nothing on failure — so a total upstream outage produces a well-formed
 * snapshot with nothing in it, identical in shape to a project that genuinely
 * publishes nothing.
 */
export function saysAnything(snapshot: DamSnapshot): boolean {
  return (
    Object.keys(snapshot.metrics).length > 0 ||
    snapshot.schedule.length > 0 ||
    Boolean(snapshot.generationForecast) ||
    Boolean(snapshot.pattern?.length)
  );
}

/**
 * Which of a pass's snapshots to write, and how many were held back.
 *
 * ── An empty snapshot is an OUTAGE unless the registry says otherwise ──────
 *
 * An empty read and a project with nothing to say produce the same payload, so
 * the payload cannot tell them apart. The registry can, before any request is
 * made — see declaresNoSources — and that is the only admissible evidence:
 *
 *   nothing read, sources declared → SKIPPED. CWMS or SWPA is down, or a series
 *                                    id moved. Whatever is stored stands; it
 *                                    ages honestly and ages OUT on its own past
 *                                    MAX_AGE_MS, at which point the routes go
 *                                    back to reading through. With nothing
 *                                    stored, nothing is written, and the routes
 *                                    read through — which is exactly what the
 *                                    product did before this table existed.
 *   nothing read, no sources       → written. Nobody could have read anything,
 *                                    so empty is the answer and worth keeping.
 *   something read                 → written. The newest answer.
 *
 * ── Why "was a row there before" is NOT the test ──────────────────────────
 *
 * It was, in the first draft of this file, and it is wrong in the worst
 * direction. On a first deploy — an empty table by definition — a cron pass
 * during a CWMS outage would write twenty empty rows, and the routes would
 * serve them as authoritative for three hours: every dam screen saying the
 * Corps publishes no readings for a project that was generating the whole time.
 * A cache is allowed to be out of date. It is not allowed to invent an absence.
 *
 * The skip is the rule useDams states for its module cache on the client
 * ("a rejected request is evicted immediately; `cached` is written only on
 * success"), applied to the server's copy.
 *
 * Pure over its inputs, so the whole rule can be held without a database.
 */
export function decideWrites(
  snapshots: (DamSnapshot | null)[],
): { writable: DamSnapshot[]; keptOnOutage: number } {
  const writable: DamSnapshot[] = [];
  let keptOnOutage = 0;

  for (const snapshot of snapshots) {
    if (!snapshot) continue;
    if (saysAnything(snapshot)) {
      writable.push(snapshot);
      continue;
    }
    const dam = getUsaceDam(snapshot.id);
    if (dam && declaresNoSources(dam)) writable.push(snapshot);
    else keptOnOutage += 1;
  }

  return { writable, keptOnOutage };
}

/** Write the snapshots decideWrites selected. Returns how many rows landed. */
export async function writeStoredSnapshots(
  supabase: ReturnType<typeof createAdminClient>,
  snapshots: DamSnapshot[],
  now = Date.now(),
): Promise<number> {
  if (snapshots.length === 0) return 0;

  const builtAt = new Date(now).toISOString();
  const rows = snapshots.map((snapshot) => ({
    dam_id: snapshot.id,
    payload: snapshot as unknown as Record<string, unknown>,
    built_at: builtAt,
    updated_at: builtAt,
  }));

  const { error } = await supabase.from(TABLE).upsert(rows, { onConflict: 'dam_id' });
  if (error) {
    logger.warn('dam-snapshot-store: write failed', { error: error.message, rows: rows.length });
    return 0;
  }
  return rows.length;
}

/**
 * Drop rows for dams the registry no longer carries.
 *
 * The table has no foreign key — dams are read-through and have no rows to
 * point at, the same reason starred_dams and dam_metric_readings have none — so
 * a project removed from USACE_DAMS would otherwise leave a row that
 * /api/dams happily serves forever. summaryOf already refuses to build one
 * (it needs the registry entry), but a row nothing can render is still a row
 * that should not be there.
 */
export async function pruneStoredSnapshots(
  supabase: ReturnType<typeof createAdminClient>,
  knownDamIds: string[],
): Promise<void> {
  if (knownDamIds.length === 0) return; // Never interpret "no registry" as "delete everything".
  const { error } = await supabase.from(TABLE).delete().not('dam_id', 'in', `(${knownDamIds.map((id) => `"${id}"`).join(',')})`);
  if (error) logger.warn('dam-snapshot-store: prune failed', { error: error.message });
}
