#!/usr/bin/env npx tsx
/**
 * Kansas City District ramp elevations, checked against each lake's documented
 * pools and written up for the Phase 0 review.
 *
 *   npx tsx scripts/lakes/nwk-ramp-dossier.ts --download <snapshot.json> --out <dir>
 *   npx tsx scripts/lakes/nwk-ramp-dossier.ts --from <snapshot.json> --out <dir>
 *
 * Read-only toward the Corps. Writes the snapshot (when downloading), one
 * dossier per lake in NWK_LAKE_POOLS, and a layer summary. Not in the `test`
 * script; the flag logic is tested in nwk-ramps.test.ts.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fetchAll } from '../ingestion/arcgis-fetch';
import { NWK_BOAT_RAMPS_SOURCE, NWK_LAKE_POOLS, assessRamp, normalizeRampSnapshot, type Ramp, type RampFlag, type RampSnapshot } from './nwk-ramps';

function arg(args: string[], flag: string): string | null {
  const i = args.indexOf(flag);
  if (i < 0) return null;
  const value = args[i + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} needs a value`);
  return value;
}

const FLAG_MEANING: Record<RampFlag, string> = {
  no_thresholds: 'no elevations published; the page must say so, never compare the pool',
  one_threshold_only: 'only one of bottom / closure published',
  closure_not_above_bottom: 'closure elevation is not above the ramp bottom; fields may be swapped',
  narrow_band: 'under 5 ft between bottom and closure; confirm the semantics at this ramp',
  thresholds_below_this_lake: 'both elevations sit well below this lake\'s multipurpose pool; probably a ramp on another waterbody filed under this lake',
  bottom_above_flood_pool: 'ramp bottom above the flood pool; check the number',
  closure_above_flood_pool: 'closure elevation above the flood pool; may mean "never closes for high water", confirm',
};

function slug(name: string) { return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

async function main() {
  const args = process.argv.slice(2);
  const downloadTo = arg(args, '--download');
  const from = arg(args, '--from');
  const out = arg(args, '--out');
  if ((downloadTo ? 1 : 0) + (from ? 1 : 0) !== 1 || !out) throw new Error('Use --download <file> | --from <file>, and --out <dir>');
  mkdirSync(out, { recursive: true });

  let snapshot: RampSnapshot;
  if (downloadTo) {
    const retrievedAt = new Date().toISOString();
    const { features } = await fetchAll({ url: NWK_BOAT_RAMPS_SOURCE.url, fields: NWK_BOAT_RAMPS_SOURCE.fields });
    snapshot = { url: NWK_BOAT_RAMPS_SOURCE.url, retrieved_at: retrievedAt, count: features.length, features: features.map((f) => ({ attributes: f.attributes, geometry: { x: f.geometry?.x, y: f.geometry?.y } })) };
    writeFileSync(downloadTo, `${JSON.stringify(snapshot, null, 1)}\n`);
  } else {
    snapshot = JSON.parse(readFileSync(from!, 'utf8'));
  }
  const ramps = normalizeRampSnapshot(snapshot);

  const byLake = new Map<string, Ramp[]>();
  for (const r of ramps) { const k = r.lake_name ?? '(none)'; byLake.set(k, [...(byLake.get(k) ?? []), r]); }
  const withBoth = ramps.filter((r) => r.ramp_bottom_elev_ft !== null && r.ramp_closure_elev_ft !== null).length;
  const summary = [
    `# Kansas City District boat ramps — layer summary`, '',
    `Retrieved ${snapshot.retrieved_at.slice(0, 19)}Z from ${snapshot.url}. ${ramps.length} ramps across ${byLake.size} lake assignments; ${withBoth} carry both a ramp-bottom and a closure elevation.`, '',
    '| Lake assignment | Ramps | With both elevations | Newest feature edit |', '| --- | ---: | ---: | --- |',
    ...[...byLake.entries()].sort().map(([lake, rs]) => `| ${lake} | ${rs.length} | ${rs.filter((r) => r.ramp_bottom_elev_ft !== null && r.ramp_closure_elev_ft !== null).length} | ${rs.map((r) => r.source_updated_at).filter(Boolean).sort().pop()?.slice(0, 10) ?? '—'} |`),
    '',
  ].join('\n');
  writeFileSync(join(out, 'nwk-ramps-summary.md'), summary);

  for (const lake of NWK_LAKE_POOLS) {
    const rs = (byLake.get(lake.lake_name) ?? []).sort((a, b) => a.name.localeCompare(b.name));
    const rows = rs.map((r) => ({ ...r, flags: assessRamp(r, lake) }));
    const flagged = rows.filter((r) => r.flags.length);
    const lines = [
      `# ${lake.lake_name} — ramp elevation dossier`, '',
      `${rs.length} ramps filed under this lake by the Kansas City District layer, retrieved ${snapshot.retrieved_at.slice(0, 10)}. Reference pools: multipurpose ${lake.multipurpose_pool_ft} ft, flood ${lake.flood_pool_ft} ft (${lake.datum}; ${lake.source}).`, '',
      `The layer documents \`elev_low\` as the bottom of the ramp and \`elev_high\` as the elevation at which the ramp is closed. ${rows.filter((r) => r.flags.length === 0).length} ramps carry both values with nothing to question; ${flagged.length} carry a flag below. A flag is a question for review, not a verdict.`, '',
      '| Ramp | Designation | Agency | Bottom (ft) | Closure (ft) | Feature edited | Flags |', '| --- | --- | --- | ---: | ---: | --- | --- |',
      ...rows.map((r) => `| ${r.name} | ${r.designation ?? ''} | ${r.agency ?? '—'} | ${r.ramp_bottom_elev_ft ?? '—'} | ${r.ramp_closure_elev_ft ?? '—'} | ${r.source_updated_at?.slice(0, 10) ?? '—'} | ${r.flags.join(', ')} |`),
      '', '## What each flag means', '',
      ...Object.entries(FLAG_MEANING).map(([k, v]) => `- \`${k}\`: ${v}`), '',
    ];
    writeFileSync(join(out, `nwk-ramps-${slug(lake.lake_name)}.md`), `${lines.join('\n')}\n`);
    writeFileSync(join(out, `nwk-ramps-${slug(lake.lake_name)}.json`), `${JSON.stringify({ lake, retrieved_at: snapshot.retrieved_at, ramps: rows }, null, 1)}\n`);
    console.log(`${lake.lake_name}: ${rs.length} ramps, ${flagged.length} flagged`);
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
