#!/usr/bin/env npx tsx
/**
 * Record the Corps' recreation-area statuses into Eddy's observation ledger,
 * and report how each project maintains them.
 *
 *   npx tsx scripts/lakes/record-usace-recreation.ts --download <snapshot.json>
 *   npx tsx scripts/lakes/record-usace-recreation.ts --record <ledger.json> [--from <snapshot.json>]
 *   npx tsx scripts/lakes/record-usace-recreation.ts --report <ledger.json> [--out <report.md>] [--project <NAME> ...]
 *
 * Read-only toward the Corps and toward Eddy's database: it writes the ledger
 * file it is given and nothing else. A partial download never becomes a run
 * (`normalizeStatusSnapshot` refuses it). Not in the `test` script: it needs the
 * network. The pure logic it calls is tested in recreation-status.test.ts.
 *
 * The daily recording is .github/workflows/usace-recreation-ledger.yml, which
 * runs `--record` and commits the ledger to the data branch it names.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fetchAll } from '../ingestion/arcgis-fetch';
import {
  USACE_RECREATION_STATUS_SOURCE, classifyProjects, mergeLedger, normalizeStatusSnapshot,
  type Ledger, type ProjectSummary, type StatusSnapshot,
} from './recreation-status';

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

async function download(): Promise<StatusSnapshot> {
  const retrievedAt = new Date().toISOString();
  const { features } = await fetchAll({ url: USACE_RECREATION_STATUS_SOURCE.url, fields: USACE_RECREATION_STATUS_SOURCE.fields });
  return { url: USACE_RECREATION_STATUS_SOURCE.url, retrieved_at: retrievedAt, count: features.length, features: features.map((f) => ({ attributes: f.attributes, geometry: f.geometry && typeof f.geometry.x === 'number' && typeof f.geometry.y === 'number' ? { x: f.geometry.x, y: f.geometry.y } : null })) };
}

function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 1)}\n`);
}

/** One area per line, so a day's diff on the data branch reads as the areas that changed. */
export function serializeLedger(ledger: Ledger): string {
  const { areas, ...head } = ledger;
  const lines = Object.keys(areas).sort().map((id) => `${JSON.stringify(id)}:${JSON.stringify(areas[id])}`);
  return `{${JSON.stringify(head).slice(1, -1)},\n"areas":{\n${lines.join(',\n')}\n}}\n`;
}

function writeLedger(path: string, ledger: Ledger) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serializeLedger(ledger));
}

export function renderReport(summaries: ProjectSummary[], ledger: Ledger, now: string): string {
  const lines: string[] = [];
  lines.push(`# USACE recreation-area status — project classification`, '');
  lines.push(`Ledger started ${ledger.started_at.slice(0, 10)}, ${ledger.runs} run(s), last recorded ${ledger.last_recorded_at.slice(0, 19)}Z, classified at ${now.slice(0, 19)}Z. Source: ${ledger.source}.`, '');
  const counts = summaries.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s.class]: (acc[s.class] ?? 0) + 1 }), {});
  lines.push(`Projects: ${summaries.length} · maintained ${counts.maintained ?? 0} · static ${counts.static ?? 0} · stale ${counts.stale ?? 0} · unmaintained ${counts.unmaintained ?? 0}.`, '');
  lines.push('A class is a summary; the newest agency date beside it is the evidence. "maintained" means the newest `date_updated` is within 120 days or Eddy has seen a status change; nothing is promoted for staying the same.', '');
  lines.push('| Project | District | Areas | With status | Boat status | Newest agency date | Oldest | Ramp areas | Lanes | Kayak launch areas | Stale notes | Changes seen | Class |');
  lines.push('| --- | --- | ---: | ---: | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |');
  for (const s of summaries) {
    lines.push(`| ${s.project} | ${s.district ?? ''} | ${s.areas} | ${s.with_status} | ${s.with_boat_status} | ${s.newest_source_update?.slice(0, 10) ?? '—'} | ${s.oldest_source_update?.slice(0, 10) ?? '—'} | ${s.boat_ramp_areas} | ${s.launch_lanes} | ${s.canoe_kayak_launch_areas} | ${s.stale_notes} | ${s.changes_observed} | ${s.class} |`);
  }
  return `${lines.join('\n')}\n`;
}

async function main() {
  const args = process.argv.slice(2);
  const downloadTo = arg(args, '--download');
  const recordTo = arg(args, '--record');
  const reportFrom = arg(args, '--report');
  const modes = [downloadTo, recordTo, reportFrom].filter(Boolean).length;
  if (modes !== 1) throw new Error('Use exactly one of --download <file>, --record <ledger>, --report <ledger>');

  if (downloadTo) {
    const snapshot = await download();
    normalizeStatusSnapshot(snapshot);
    writeJson(downloadTo, snapshot);
    console.log(`Wrote ${snapshot.count} areas to ${downloadTo} (retrieved ${snapshot.retrieved_at})`);
    return;
  }

  if (recordTo) {
    const from = arg(args, '--from');
    const snapshot: StatusSnapshot = from ? JSON.parse(readFileSync(from, 'utf8')) : await download();
    const records = normalizeStatusSnapshot(snapshot);
    const previous: Ledger | null = existsSync(recordTo) ? JSON.parse(readFileSync(recordTo, 'utf8')) : null;
    const outcome = mergeLedger(previous, records, snapshot.retrieved_at);
    writeLedger(recordTo, outcome.ledger);
    console.log(`Run ${outcome.ledger.runs}: ${records.length} areas, ${outcome.added} added, ${outcome.changed} changed, ${outcome.missing} missing → ${recordTo}`);
    return;
  }

  if (reportFrom) {
    const ledger: Ledger = JSON.parse(readFileSync(reportFrom, 'utf8'));
    const now = new Date().toISOString();
    const only = new Set(argList(args, '--project'));
    const summaries = classifyProjects(ledger, now).filter((s) => only.size === 0 || only.has(s.project));
    const report = renderReport(summaries, ledger, now);
    const out = arg(args, '--out');
    if (out) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, report); console.log(`Wrote ${out}`); }
    else process.stdout.write(report);
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
