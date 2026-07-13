#!/usr/bin/env npx tsx
/**
 * Activate river(s) and report validate_river_data() findings for them.
 *
 * validate_river_data() only evaluates active rivers, so we flip active=true
 * first, then read back its findings. If any 'error'-severity finding appears
 * for a river, this script rolls that river back to inactive (errors mean the
 * condition badge / core UX is broken) and reports it. 'warning' findings are
 * printed but left active (they're the documented, intentional gaps).
 *
 * Usage:
 *   npx tsx scripts/ingestion/activate-rivers.ts <slug> [<slug> ...]
 *   npx tsx scripts/ingestion/activate-rivers.ts <slug> --dry   (validate only, no change)
 */
import { createAdminClient } from '../../src/lib/supabase/admin';

async function findings(db: ReturnType<typeof createAdminClient>, slugs: string[]) {
  const { data, error } = await db.rpc('validate_river_data');
  if (error) throw error;
  return ((data ?? []) as any[]).filter((r) => slugs.includes(r.river_slug));
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const slugs = args.filter((a) => !a.startsWith('--'));
  if (!slugs.length) { console.error('Usage: activate-rivers.ts <slug> [<slug> ...] [--dry]'); process.exit(1); }

  const db = createAdminClient();

  if (!dry) {
    const { error } = await db.from('rivers').update({ active: true }).in('slug', slugs);
    if (error) throw error;
    console.log(`Set active=true for: ${slugs.join(', ')}`);
  }

  const found = await findings(db, slugs);
  const errors = found.filter((f) => f.severity === 'error');
  const warnings = found.filter((f) => f.severity === 'warning');

  console.log(`\nvalidate_river_data(): ${errors.length} error(s), ${warnings.length} warning(s) across ${slugs.length} river(s)`);
  for (const f of found) {
    console.log(`  ${f.severity === 'error' ? '❌' : '⚠️ '} ${f.river_slug}  ${f.check_name}: ${f.detail}`);
  }

  // Roll back any river that produced an error (unless dry-run).
  if (!dry && errors.length) {
    const bad = Array.from(new Set(errors.map((e) => e.river_slug)));
    const { error } = await db.from('rivers').update({ active: false }).in('slug', bad);
    if (error) throw error;
    console.log(`\n❌ Rolled back to inactive (had errors): ${bad.join(', ')}`);
    process.exit(2);
  }

  if (!dry) {
    const active = slugs.filter((s) => !errors.some((e) => e.river_slug === s));
    console.log(`\n✅ Active & live: ${active.join(', ')}${warnings.length ? '  (with documented warnings above)' : ''}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
