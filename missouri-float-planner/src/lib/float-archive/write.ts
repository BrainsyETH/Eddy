import type { SupabaseClient } from '@supabase/supabase-js';
import type { ArchiveRow, ArchiveWriteResult, CompletedFloat } from '@shared/float-archive';
import { archiveRow } from './validation';
import { waterAtStart } from './water';

/** Reject only invalid rows. Infrastructure failures remain retryable for the batch. */
export async function writeArchiveBatch(
  db: SupabaseClient,
  userId: string,
  input: unknown[],
  lookupWater = waterAtStart,
): Promise<ArchiveWriteResult[]> {
  const rows: ArchiveRow[] = [];
  const results: ArchiveWriteResult[] = input.map((item) => {
    const parsed = archiveRow.safeParse(item);
    if (!parsed.success) return {
      status: 'rejected',
      reason: 'Some trip details are not supported. Your float is still saved on this phone.',
    };
    rows.push(parsed.data as ArchiveRow);
    return { status: 'accepted' };
  });
  if (!rows.length) return results;
  const ids = rows.filter((r) => r.kind === 'completed' && !r.deleted).map((r) => r.id);
  const existing = new Set<string>();
  if (ids.length) {
    const { data, error } = await db.from('float_archive').select('id').eq('user_id', userId).in('id', ids);
    if (error) throw new Error('Could not check existing floats');
    for (const row of data ?? []) existing.add(row.id);
  }
  const enriched = await Promise.all(rows.map(async (row) => {
    if (row.kind !== 'completed' || row.deleted || existing.has(row.id)) return row;
    const trip = row.payload as CompletedFloat;
    return { ...row, payload: { ...trip, water: await lookupWater(db, trip) } };
  }));
  // Still pass existing IDs through the RPC: it protects immutable summaries,
  // deletion tombstones and consent against races with this read.
  const { error } = await db.rpc('write_float_archive', { p_user: userId, p_rows: enriched });
  if (error) throw new Error('Archive write failed');
  return results;
}
