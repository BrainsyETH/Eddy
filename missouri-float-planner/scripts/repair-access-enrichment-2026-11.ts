/**
 * Apply the reviewed one-off access-point enrichment (November 2026).
 * Exact-ID, compare-and-set, preview by default.
 *
 * Reads only the rows marked accept=y in
 * scripts/ingestion/agency-gis/2026-11-oneoff/review.csv, which is produced by
 * scripts/ingestion/oneoff-access-enrichment-2026-11.ts. Flags are never
 * applied. It touches existing access_points columns only. It adds no access
 * points and moves no pins.
 *
 * Run from missouri-float-planner with configured Supabase admin credentials:
 *   npx tsx scripts/repair-access-enrichment-2026-11.ts                 # preview
 *   EXPECTED_SUPABASE_REF=ilefwfpvphadsbptiaur npx tsx scripts/repair-access-enrichment-2026-11.ts --apply
 *   npx tsx scripts/repair-access-enrichment-2026-11.ts --sheet=/path/review.csv
 *
 * Before the first write, every row is checked:
 *   - identity: the id still has the sheet's slug;
 *   - value: every field holds either the sheet's `current` value or its
 *     `proposed` one, which means it is already done.
 * Any surprise stops the run with nothing written. Each write is conditioned
 * on the row's updated_at being unchanged since it was read, so a concurrent
 * edit stops the run instead of being overwritten. A rerun skips fields
 * already applied. The preview prints the current values, which are the
 * rollback.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { getScriptClient } from './lib/db';
import { correctionsFromSheet, parseCsv } from './ingestion/access-enrichment-2026-11';

type Fields = Record<string, unknown>;

/** The sheet writes an empty amenities/road_surface list as [] where the column may hold NULL. */
const empty = (v: unknown) => (Array.isArray(v) && v.length === 0 ? null : v ?? null);
const same = (a: unknown, b: unknown) => {
  if (typeof a === 'number' || typeof b === 'number') return a != null && b != null && Number(a) === Number(b);
  return isDeepStrictEqual(empty(a), empty(b));
};

async function main() {
  const apply = process.argv.includes('--apply');
  for (const a of process.argv.slice(2)) {
    if (a !== '--apply' && !a.startsWith('--sheet=')) throw new Error(`Unknown argument ${a}`);
  }
  const sheet = process.argv.find((a) => a.startsWith('--sheet='))?.slice(8)
    ?? join(__dirname, 'ingestion', 'agency-gis', '2026-11-oneoff', 'review.csv');
  const { corrections, skipped } = correctionsFromSheet(parseCsv(readFileSync(sheet, 'utf8')));
  for (const s of skipped) console.warn(`  skipped ${s}`);
  if (corrections.length === 0) { console.log('No accepted rows. Nothing to do.'); return; }

  const db = getScriptClient({ script: 'repair-access-enrichment-2026-11', write: apply });
  const columns = [...new Set(['id', 'slug', 'updated_at', ...corrections.flatMap((c) => Object.keys(c.to))])];
  const read = async () => {
    const out: Fields[] = [];
    const ids = corrections.map((c) => c.id);
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await db.from('access_points').select(columns.join(',')).in('id', ids.slice(i, i + 100));
      if (error) throw error;
      out.push(...((data as unknown as Fields[]) ?? []));
    }
    return out;
  };
  const rows = await read();

  // Validate every row before the first write. Unexpected state needs review.
  const plan = corrections.map((c) => {
    const row = rows.find((r) => r.id === c.id);
    if (!row || row.slug !== c.slug) throw new Error(`Unexpected identity for ${c.slug} (${c.id}); nothing written.`);
    for (const field of Object.keys(c.to)) {
      if (!same(row[field], c.from[field]) && !same(row[field], c.to[field])) {
        throw new Error(
          `${c.slug}.${field} is ${JSON.stringify(row[field])}, neither the reviewed ${JSON.stringify(c.from[field])} ` +
            `nor the proposed value; nothing written. Regenerate the sheet.`,
        );
      }
    }
    return { c, row, pending: Object.keys(c.to).filter((f) => !same(row[f], c.to[f])) };
  });

  const fieldCounts: Record<string, number> = {};
  for (const { pending } of plan) for (const f of pending) fieldCounts[f] = (fieldCounts[f] ?? 0) + 1;
  console.log(`${corrections.length} access points, ${plan.reduce((n, p) => n + p.pending.length, 0)} pending field changes:`);
  console.table(fieldCounts);
  console.table(plan.map(({ c, pending }) => ({ access: c.slug, pending: pending.join(', ') || '(done)' })));
  console.log('Current values (rollback):');
  console.log(JSON.stringify(plan.map(({ c, row }) => ({ id: c.id, slug: c.slug, ...Object.fromEntries(Object.keys(c.to).map((f) => [f, row[f] ?? null])) })), null, 2));
  if (!apply) { console.log('Preview only. Nothing written. Add --apply with the project pin to write.'); return; }

  for (const { c, row, pending } of plan) {
    if (pending.length === 0) continue;
    const update = Object.fromEntries(pending.map((f) => [f, c.to[f]]));
    const { data: changed, error } = await db.from('access_points')
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq('id', c.id)
      .eq('updated_at', row.updated_at as string)
      .select('id');
    if (error) throw error;
    if (changed?.length !== 1) {
      throw new Error(`Concurrent change to ${c.slug}; stopped. Earlier rows may have applied; rerun the preview.`);
    }
    console.log(`Updated ${c.slug}: ${pending.join(', ')}`);
  }

  const verified = await read();
  for (const c of corrections) {
    const row = verified.find((r) => r.id === c.id);
    for (const field of Object.keys(c.to)) {
      if (!row || !same(row[field], c.to[field])) throw new Error(`Post-write verification failed for ${c.slug}.${field}.`);
    }
  }
  console.log(`Verified all ${corrections.length} access points. Web responses refresh within the CDN TTL; iOS on the next detail load.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
