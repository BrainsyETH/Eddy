#!/usr/bin/env npx tsx
/**
 * Build the launch review queue for one lake from sources Eddy already holds.
 *
 *   npx tsx scripts/lakes/build-lake-launch-queue.ts \
 *     --lake table-rock --project "TABLE ROCK LAKE" \
 *     --polygon lake-polygons/table-rock-*.geojson \
 *     --agfc scripts/ingestion/agency-gis/2026-10-29/agfc-features.json \
 *     --mdc  scripts/ingestion/agency-gis/2026-10-29/mdc-features.json \
 *     --nwk  <nwk snapshot.json> --status <recreation status snapshot.json> \
 *     --existing <access points json> --out <dir>
 *
 * Every input is a file; nothing is fetched and nothing is written to the
 * database. The output is a queue for the access-point review workflow. The
 * join logic is tested in launch-queue.test.ts.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildLaunchQueue, type ExistingAccessPoint, type LaunchCandidate, type PolygonRings, type RecreationArea } from './launch-queue';
import { normalizeRampSnapshot } from './nwk-ramps';
import { normalizeStatusSnapshot, type StatusSnapshot } from './recreation-status';

function arg(args: string[], flag: string): string | null {
  const i = args.indexOf(flag);
  if (i < 0) return null;
  const value = args[i + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} needs a value`);
  return value;
}
function argList(args: string[], flag: string): string[] {
  const out: string[] = [];
  args.forEach((a, i) => { if (a === flag && args[i + 1] && !args[i + 1].startsWith('--')) out.push(args[i + 1]); });
  return out;
}
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));

interface AgencyFeature { attributes: Record<string, unknown>; geometry: { x: number; y: number } }

function polygonsFrom(path: string): PolygonRings[] {
  const geo = read(path);
  const out: PolygonRings[] = [];
  for (const f of geo.features ?? []) {
    if (f.geometry?.type === 'Polygon') out.push(f.geometry.coordinates);
    else if (f.geometry?.type === 'MultiPolygon') out.push(...f.geometry.coordinates);
  }
  if (!out.length) throw new Error(`${path}: no polygons`);
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const lake = arg(args, '--lake');
  const project = arg(args, '--project');
  const out = arg(args, '--out');
  const polygonPaths = argList(args, '--polygon');
  if (!lake || !project || !out || !polygonPaths.length) throw new Error('--lake, --project, --out and at least one --polygon are required');

  const polygons = polygonPaths.flatMap(polygonsFrom);
  const candidates: LaunchCandidate[] = [];

  const agfcPath = arg(args, '--agfc');
  if (agfcPath) {
    for (const f of read(agfcPath).features as AgencyFeature[]) {
      const a = f.attributes;
      if (a.ftype !== 'Boating Access') continue;
      candidates.push({ source: 'agfc', source_id: String(a.globalid).replace(/[{}]/g, '').toLowerCase(), name: String(a.fname ?? '(unnamed)'), source_type: String(a.ftype), source_waterbody: (a.waterbody as string | null) ?? null, agency: (a.owner as string | null) ?? null, lon: f.geometry.x, lat: f.geometry.y, source_updated_at: typeof a.last_verified_date === 'number' ? new Date(a.last_verified_date).toISOString() : null });
    }
  }
  const mdcPath = arg(args, '--mdc');
  if (mdcPath) {
    for (const f of read(mdcPath).features as AgencyFeature[]) {
      const a = f.attributes;
      candidates.push({ source: 'mdc', source_id: `${a.Area_ID}:${f.geometry.x.toFixed(6)},${f.geometry.y.toFixed(6)}`, name: String(a.Area_Name ?? '(unnamed)'), source_type: 'Boat Ramp', source_waterbody: null, agency: 'MDC', lon: f.geometry.x, lat: f.geometry.y, source_updated_at: null });
    }
  }
  const nwkPath = arg(args, '--nwk');
  if (nwkPath) {
    for (const r of normalizeRampSnapshot(read(nwkPath))) {
      candidates.push({ source: 'nwk', source_id: r.source_id, name: r.name, source_type: r.designation, source_waterbody: r.lake_name, agency: r.agency, lon: r.lon, lat: r.lat, source_updated_at: r.source_updated_at, ramp_bottom_elev_ft: r.ramp_bottom_elev_ft, ramp_closure_elev_ft: r.ramp_closure_elev_ft });
    }
  }

  const areas: RecreationArea[] = [];
  const statusPath = arg(args, '--status');
  if (statusPath) {
    for (const r of normalizeStatusSnapshot(read(statusPath) as StatusSnapshot)) {
      if (r.project !== project || !r.entrance) continue;
      areas.push({ area_id: r.area_id, name: r.name, subtype: r.subtype, lon: r.entrance.lon, lat: r.entrance.lat, boat_status: r.boat_status, boat_ramps: r.boat_ramps, source_updated_at: r.source_updated_at });
    }
  }

  const existingPath = arg(args, '--existing');
  const existing: ExistingAccessPoint[] = existingPath
    ? (read(existingPath).rows as Array<{ slug: string; name: string; river_slug: string; lon: number; lat: number }>).map((r) => ({ slug: r.slug, name: r.name, river_slug: r.river_slug, lon: r.lon, lat: r.lat }))
    : [];

  // Only this lake's NWK ramps are candidates; other lakes' ramps are not "off lake", they are elsewhere.
  const scoped = candidates.filter((c) => c.source !== 'nwk' || (c.source_waterbody ?? '').toLowerCase().startsWith(lake.split('-')[0]));
  const queue = buildLaunchQueue({ lake_slug: lake, polygons, candidates: scoped, areas, existing });

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, `launch-queue-${lake}.json`), `${JSON.stringify(queue, null, 1)}\n`);
  const md = [
    `# ${lake} — launch review queue`, '',
    `${queue.places.length} candidate places within 500 m of the lake polygon, from ${new Set(queue.places.flatMap((p) => p.sources.map((s) => s.source))).size} source(s). ${queue.off_lake.length} source feature(s) assigned to this lake sit beyond 500 m and are listed, not dropped. ${queue.areas_without_candidate.length} Corps area(s) report a ramp or a boat status with no candidate pin nearby.`, '',
    'Nothing here is approved, pinned or given a launch method. Each row is a place for the access-point review workflow; the review column says what to decide.', '',
    '| Place | Sources | Agency | Dist. to lake (m) | Nearest Corps area (m) | Area boat status · agency date | Existing Eddy place | Review |', '| --- | --- | --- | ---: | --- | --- | --- | --- |',
    ...queue.places.map((p) => `| ${p.name} | ${p.sources.map((s) => `${s.source}:${s.source_type ?? ''}`).join(', ')} | ${[...new Set(p.sources.map((s) => s.agency).filter(Boolean))].join(', ') || '—'} | ${p.distance_to_lake_m} | ${p.nearest_area ? `${p.nearest_area.name} (${p.nearest_area.distance_m})` : '—'} | ${p.nearest_area ? `${p.nearest_area.boat_status ?? 'none'} · ${p.nearest_area.source_updated_at?.slice(0, 10) ?? 'no date'}` : '—'} | ${p.existing_access_point ? `${p.existing_access_point.slug} (${p.existing_access_point.distance_m} m)` : '—'} | ${p.review.join(' ')} |`),
    '', '## Assigned to this lake but off the polygon', '',
    ...(queue.off_lake.length ? queue.off_lake.map((c) => `- ${c.name} (${c.source}, ${c.source_waterbody ?? 'no waterbody'}): ${c.distance_to_lake_m} m from the polygon${c.ramp_bottom_elev_ft != null ? `; thresholds ${c.ramp_bottom_elev_ft}/${c.ramp_closure_elev_ft} ft` : ''}`) : ['- none']),
    '', '## Corps areas reporting a ramp or boat status with no candidate pin', '',
    ...(queue.areas_without_candidate.length ? queue.areas_without_candidate.map((a) => `- ${a.name} (${a.subtype ?? ''}): ramps ${a.boat_ramps ?? '—'}, boat ${a.boat_status ?? 'none'}, agency date ${a.source_updated_at?.slice(0, 10) ?? 'none'}. The entrance is at ${a.lat.toFixed(5)}, ${a.lon.toFixed(5)}; the ramp needs its own pin from imagery or a ramp layer.`) : ['- none']),
    '',
  ].join('\n');
  writeFileSync(join(out, `launch-queue-${lake}.md`), md);
  console.log(`${lake}: ${queue.places.length} places, ${queue.off_lake.length} off lake, ${queue.areas_without_candidate.length} areas without a pin → ${out}`);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
