#!/usr/bin/env npx tsx
/**
 * Turn a launch review queue into the SQL that stages its places as
 * UNAPPROVED lake_launches rows.
 *
 *   npx tsx scripts/lakes/stage-launch-candidates.ts --queue <launch-queue-<lake>.json> [--queue ...] --out <file.sql>
 *
 * Writes a file; executes nothing. The SQL inserts with approved = false, no
 * launch methods, and the queue's review notes, and it skips a (lake, slug)
 * that already exists, so re-running it stages nothing twice and never touches
 * a reviewed row. Approval, methods, amenities and the access-point link are a
 * reviewer's work, one row at a time, in the admin workflow or by hand.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import type { LaunchQueue, QueuedPlace } from './launch-queue';

function argList(args: string[], flag: string): string[] {
  const out: string[] = [];
  args.forEach((a, i) => { if (a === flag && args[i + 1] && !args[i + 1].startsWith('--')) out.push(args[i + 1]); });
  return out;
}

export function slugFor(place: QueuedPlace, taken: Set<string>): string {
  const base = place.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'launch';
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  taken.add(slug);
  return slug;
}

const q = (s: string | null | undefined) => (s == null ? 'null' : `'${s.replace(/'/g, "''")}'`);

export function stagingSql(queues: LaunchQueue[]): string {
  const lines: string[] = [
    '-- Staged from the Phase 0 launch review queues (scripts/ingestion/lakes/2026-11-09/).',
    '-- Every row is UNAPPROVED with no launch method; nothing renders until a reviewer',
    '-- approves it, sets its methods and amenities, and links it to an existing access',
    '-- point where the place already is one. Re-running stages nothing twice.',
    '-- Execute only against the explicitly confirmed Eddy project.',
    'begin;',
  ];
  for (const queue of queues) {
    const taken = new Set<string>();
    for (const place of queue.places) {
      const slug = slugFor(place, taken);
      const nwk = place.sources.find((s) => s.source === 'nwk');
      const agency = [...new Set(place.sources.map((s) => s.agency).filter(Boolean))].join(', ') || null;
      const sources = JSON.stringify(place.sources.map((s) => ({ provider: s.source, source_id: s.source_id, type: s.source_type, waterbody: s.source_waterbody, agency: s.agency, source_updated_at: s.source_updated_at })));
      const note = [
        ...place.review,
        place.nearest_area ? `Nearest Corps area: ${place.nearest_area.name} (${place.nearest_area.distance_m} m, by ${place.nearest_area.matched_by}).` : 'No Corps area within reach.',
        place.existing_access_point ? `Existing access point: ${place.existing_access_point.slug} (${place.existing_access_point.distance_m} m).` : null,
      ].filter(Boolean).join(' ');
      const hasThresholds = nwk && (nwk.ramp_bottom_elev_ft != null || nwk.ramp_closure_elev_ft != null);
      lines.push(
        `insert into public.lake_launches (lake_slug, slug, name, longitude, latitude, managing_agency, ramp_bottom_elev_ft, ramp_closure_elev_ft, elev_datum, elev_source, elev_source_updated_at, sources, review_note, approved)`,
        `  select ${q(queue.lake_slug)}, ${q(slug)}, ${q(place.name)}, ${place.lon}, ${place.lat}, ${q(agency)}, ${hasThresholds ? nwk.ramp_bottom_elev_ft ?? 'null' : 'null'}, ${hasThresholds ? nwk.ramp_closure_elev_ft ?? 'null' : 'null'}, ${hasThresholds ? "'NGVD29'" : 'null'}, ${hasThresholds ? "'USACE Kansas City District boat ramp layer (NWK_Boat_Ramps)'" : 'null'}, ${hasThresholds && nwk.source_updated_at ? q(nwk.source_updated_at) : 'null'}, ${q(sources)}::jsonb, ${q(note)}, false`,
        `  where not exists (select 1 from public.lake_launches where lake_slug = ${q(queue.lake_slug)} and slug = ${q(slug)});`,
      );
    }
  }
  lines.push('commit;', '');
  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const queues = argList(args, '--queue');
  const outIndex = args.indexOf('--out');
  const out = outIndex >= 0 ? args[outIndex + 1] : null;
  if (!queues.length || !out) throw new Error('Use --queue <file> [--queue <file>] --out <file.sql>');
  const parsed = queues.map((p) => JSON.parse(readFileSync(p, 'utf8')) as LaunchQueue);
  writeFileSync(out, stagingSql(parsed));
  console.log(`Wrote ${parsed.reduce((n, qn) => n + qn.places.length, 0)} unapproved rows to ${out}`);
}

if (require.main === module) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
}
