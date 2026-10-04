/** Preview by default. Apply only after the web photo-credits/optimizer release. */
import { getScriptClient } from './lib/db';
import { reviewedPhotos, reviewedPhotoPatch, rowHasReviewedPhoto, type PhotoRow } from '../src/lib/photos/reviewed';

async function main() {
  const apply = process.argv.includes('--apply');
  const db = getScriptClient({ script: 'backfill-reviewed-photos', write: apply });
  // Read and validate the entire batch before the first mutation.
  const plan = [];
  for (const entry of reviewedPhotos) {
    const columns = entry.table === 'access_points' ? 'image_urls' : entry.table === 'points_of_interest' ? 'images,nps_id' : 'details';
    const { data, error } = await db.from(entry.table).select(`id,name,updated_at,${columns}`).eq('id', entry.id).single();
    if (error) throw error;
    const row = data as unknown as PhotoRow;
    plan.push({ entry, row, columns, patch: reviewedPhotoPatch(entry, row) });
  }
  console.table(plan.map(({ entry, row, patch }) => ({
    table: entry.table, name: entry.name,
    action: patch ? 'fill missing photo' : rowHasReviewedPhoto(entry, row) ? 'already applied' : 'keep existing photo',
  })));
  if (!apply) { console.log('Preview only. Use --apply with EXPECTED_SUPABASE_REF after the web release.'); return; }
  for (const { entry, row, columns, patch } of plan) {
    if (!patch) continue;
    let update = db.from(entry.table).update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', entry.id).eq('name', entry.name);
    // A concurrent NPS link must stop the write even if updated_at was unchanged.
    if (entry.table === 'points_of_interest') update = update.is('nps_id', null);
    update = row.updated_at == null ? update.is('updated_at', null) : update.eq('updated_at', row.updated_at);
    const { data, error } = await update.select(`id,name,updated_at,${columns}`);
    if (error) throw error;
    if (data?.length !== 1 || !rowHasReviewedPhoto(entry, data[0] as unknown as PhotoRow)) {
      throw new Error(`Concurrent change or failed write: ${entry.name}. Stopped; preview again before retrying.`);
    }
    const { data: verified, error: readError } = await db.from(entry.table)
      .select(`id,name,updated_at,${columns}`).eq('id', entry.id).single();
    if (readError) throw readError;
    if (!rowHasReviewedPhoto(entry, verified as unknown as PhotoRow)) throw new Error(`Read-back failed: ${entry.name}`);
    console.log(`Verified ${entry.name}`);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
