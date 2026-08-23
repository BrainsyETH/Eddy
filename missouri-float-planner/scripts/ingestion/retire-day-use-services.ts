#!/usr/bin/env npx tsx
/**
 * Remove two day-use sites recorded in the directory as campgrounds.
 *
 * ── WHY ────────────────────────────────────────────────────────────────────
 *
 * `npm run db:check-services` flagged 13 rows of type='campground' offering
 * neither Tent Camping nor RV Sites. Eleven were a lost offering. Two were not
 * campgrounds:
 *
 *   Dillard Mill State Historic Site — a day-use historic site on Huzzah Creek.
 *     Missouri State Parks lists picnicking, trails, fishing and mill tours and
 *     no camping. Its slug says `dillard-mill-campground` anyway. Eddy already
 *     holds the place as an access point (`dillard-mill`) on the same creek, so
 *     removing the directory row loses nothing a reader can see.
 *
 *   Fred Berry Conservation Education Center on Crooked Creek — an AGFC nature
 *     centre: a classroom for 40, a pavilion, six miles of trail and an archery
 *     range, open 8:30 to 4:30. No overnight anything.
 *
 * A row typed `campground` is an offer of somewhere to sleep. Making that offer
 * where nobody may sleep is worse than a missing amenity, and `service_type`
 * has only outfitter | campground | cabin_lodge, so there is no honest value to
 * move them to. Until the directory can say "day use", they should not be in it.
 *
 * ── WHAT STOPS THIS DELETING SOMETHING IT SHOULD NOT ───────────────────────
 *
 * The premise is checked before the delete, not assumed. A row is retired only
 * if it still claims no camping, and only if nothing else points at it — an
 * access-point link or a campsite facility would mean the row is load-bearing
 * somewhere this note did not look, and the run stops instead.
 *
 * Usage:
 *   npx tsx scripts/ingestion/retire-day-use-services.ts            # dry run
 *   npx tsx scripts/ingestion/retire-day-use-services.ts --delete   # write
 */

import { getScriptClient } from '../lib/db';

const RETIRE: Array<{ slug: string; because: string }> = [
  {
    slug: 'dillard-mill-campground',
    because:
      'Dillard Mill State Historic Site is day-use; MO State Parks lists no camping, ' +
      'and the place is already an access point (dillard-mill) on Huzzah Creek',
  },
  {
    slug: 'fred-berry-conservation-education-center-on-crooked-creek',
    because: 'AGFC nature centre, open 08:30–16:30, no overnight accommodation',
  },
];

const CAMPING_OFFERINGS = ['camping_primitive', 'camping_rv'];

async function main() {
  const shouldDelete = process.argv.includes('--delete');
  const supabase = getScriptClient({ script: 'retire-day-use-services', write: shouldDelete });

  console.log(`\nRetire day-use directory rows — ${shouldDelete ? 'DELETE' : 'DRY RUN'}\n`);

  let blocked = 0;
  let removed = 0;

  for (const { slug, because } of RETIRE) {
    const { data: rows, error } = await supabase
      .from('nearby_services')
      .select('id, name, type, services_offered')
      .eq('slug', slug);
    if (error) throw new Error(`Could not read ${slug}: ${error.message}`);

    const row = (rows ?? [])[0] as
      | { id: string; name: string; type: string; services_offered: string[] | null }
      | undefined;
    if (!row) {
      console.log(`  · ${slug} — already gone`);
      continue;
    }

    // The premise: it must still be claiming no camping.
    const camping = (row.services_offered ?? []).filter((o) => CAMPING_OFFERINGS.includes(o));
    if (camping.length > 0) {
      console.error(
        `  ✗ ${slug} now offers ${camping.join(', ')} — somebody has decided it IS a ` +
          'campground. Not deleting; re-read the note at the top of this file.',
      );
      blocked++;
      continue;
    }

    // Nothing else may depend on it. A reference means the row is load-bearing
    // somewhere the note above did not look, so this row is skipped entirely —
    // not merely counted.
    let referenced = false;
    for (const [table, column] of [
      ['access_point_services', 'nearby_service_id'],
      ['campsite_facilities', 'nearby_service_id'],
    ] as const) {
      const { data: refs, error: refErr } = await supabase.from(table).select('id').eq(column, row.id);
      if (refErr) throw new Error(`Could not check ${table} for ${slug}: ${refErr.message}`);
      if ((refs ?? []).length > 0) {
        console.error(`  ✗ ${slug} is referenced by ${(refs ?? []).length} ${table} row(s) — not deleting`);
        referenced = true;
      }
    }
    if (referenced) { blocked++; continue; }

    const { data: links } = await supabase.from('service_rivers').select('id').eq('service_id', row.id);
    console.log(`  · ${row.name}`);
    console.log(`      ${because}`);
    console.log(`      type=${row.type} offerings={${(row.services_offered ?? []).join(',')}} ` +
      `river links=${(links ?? []).length}`);

    if (!shouldDelete) continue;

    const { error: unlinkErr } = await supabase.from('service_rivers').delete().eq('service_id', row.id);
    if (unlinkErr) throw new Error(`Could not unlink ${slug}: ${unlinkErr.message}`);
    const { error: delErr } = await supabase.from('nearby_services').delete().eq('id', row.id);
    if (delErr) throw new Error(`Could not delete ${slug}: ${delErr.message}`);

    const { data: after } = await supabase.from('nearby_services').select('id').eq('slug', slug);
    if ((after ?? []).length > 0) throw new Error(`${slug} is still present after delete`);
    console.log('      ✓ removed');
    removed++;
  }

  console.log(`\n${blocked ? '✗' : '✓'} ${removed} removed, ${blocked} blocked\n`);
  if (blocked > 0) process.exit(1);
  if (!shouldDelete) console.log('💡 Dry run. Re-run with --delete to write.\n');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
