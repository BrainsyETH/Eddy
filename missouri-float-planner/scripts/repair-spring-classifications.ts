/**
 * Repair reviewed POI classifications without changing geometry or prose.
 * Run from missouri-float-planner with configured Supabase admin credentials:
 *   npx tsx scripts/repair-spring-classifications.ts          # preview
 *   EXPECTED_SUPABASE_REF=ilefwfpvphadsbptiaur npx tsx scripts/repair-spring-classifications.ts --apply
 * Uses the shared project guard; never classifies records by name substring.
 */
import { getScriptClient } from './lib/db';

const corrections = [
  { id: '47a60123-788c-464e-b2b7-59cac17c51fb', name: 'Welch Spring and Hospital', river: 'current', from: 'cave', to: 'spring' },
  { id: '0c45779f-ca96-4b5e-bc31-80eedd0ecdab', name: 'Medlock Cave and Spring', river: 'current', from: 'cave', to: 'spring' },
  { id: 'd4c401dd-3ae9-4f5a-90c8-81382ff4b8f3', name: 'Big Spring', river: 'current', from: 'cave', to: 'spring' },
  { id: '1b638dce-9404-486d-acc0-c1c69a529b98', name: "Granny Henderson's Cabin", river: 'buffalo', from: 'spring', to: 'historical_site' },
] as const;

async function main() {
  const apply = process.argv.includes('--apply');
  const db = getScriptClient({ script: 'repair-spring-classifications', write: apply });
  const { data: rivers, error: riverError } = await db.from('rivers').select('id,slug').in('slug', ['current', 'buffalo']);
  if (riverError) throw riverError;
  const { data: rows, error } = await db.from('points_of_interest')
    .select('id,name,type,river_id').in('id', corrections.map(c => c.id));
  if (error) throw error;
  // Validate every identity before the first write. Unexpected state needs review.
  const plan = corrections.map(c => {
    const row = rows?.find(r => r.id === c.id);
    const river = rivers?.find(r => r.slug === c.river);
    if (!row || !river || row.name !== c.name || row.river_id !== river.id ||
        (row.type !== c.from && row.type !== c.to)) {
      throw new Error(`Unexpected identity/classification for ${c.name}; no corrections started.`);
    }
    return { ...c, riverId: river.id, current: row.type };
  });
  console.table(plan.map(c => ({ name: c.name, current: c.current, desired: c.to })));
  if (!apply) { console.log('Preview only. Add --apply with the project pin to write.'); return; }
  for (const c of plan) {
    if (c.current === c.to) continue;
    // Compare the observed classification and identity again at write time.
    const { data: changed, error: updateError } = await db.from('points_of_interest')
      .update({ type: c.to, updated_at: new Date().toISOString() })
      .eq('id', c.id).eq('name', c.name).eq('river_id', c.riverId).eq('type', c.from)
      .select('id,type');
    if (updateError) throw updateError;
    if (changed?.length !== 1 || changed[0].type !== c.to) {
      throw new Error(`Concurrent change to ${c.name}; stopped. Earlier corrections may have applied; rerun the preview.`);
    }
    console.log(`Updated ${c.name}: ${c.from} -> ${c.to}`);
  }
  const { data: verified, error: verifyError } = await db.from('points_of_interest')
    .select('id,type').in('id', corrections.map(c => c.id));
  if (verifyError) throw verifyError;
  if (corrections.some(c => verified?.find(r => r.id === c.id)?.type !== c.to)) {
    throw new Error('Post-write verification failed; inspect current classifications.');
  }
  console.log('Verified all four classifications in the database. Verify the refreshed public offline bundle before declaring the map fixed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
