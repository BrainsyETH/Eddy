#!/usr/bin/env npx tsx
/**
 * Append one record per Savannah project describing what the scheduled-energy
 * series contained at this read.
 *
 *   npx tsx scripts/lakes/record-savannah-schedule.ts --append <records.jsonl>
 *
 * Read-only toward CWMS; appends to the file it is given. Run daily by
 * .github/workflows/usace-recreation-ledger.yml beside the status ledger. The
 * summary logic is tested in savannah-schedule.test.ts.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { SAVANNAH_SCHEDULE_SERIES, scheduleRunRecord, type CwmsValue } from './savannah-schedule';

const CDA = 'https://cwms-data.usace.army.mil/cwms-data/timeseries';

async function readSeries(office: string, name: string, begin: string, end: string): Promise<CwmsValue[]> {
  const url = `${CDA}?${new URLSearchParams({ office, name, begin, end, unit: 'MWh', 'page-size': '2000' })}`;
  const res = await fetch(url, { headers: { Accept: 'application/json;version=2' }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const body = (await res.json()) as { values?: CwmsValue[] };
  if (!Array.isArray(body.values)) throw new Error(`${name}: no values array`);
  return body.values;
}

async function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--append');
  const out = i >= 0 ? args[i + 1] : null;
  if (!out || out.startsWith('--')) throw new Error('Use --append <records.jsonl>');
  const now = new Date();
  const begin = new Date(now.getTime() - 36 * 3_600_000).toISOString();
  const end = new Date(now.getTime() + 4 * 86_400_000).toISOString();
  mkdirSync(dirname(out), { recursive: true });
  for (const series of SAVANNAH_SCHEDULE_SERIES) {
    const [scheduled, observed] = await Promise.all([
      readSeries(series.office, series.scheduled, begin, end),
      readSeries(series.office, series.observed, begin, end),
    ]);
    const record = scheduleRunRecord(series.project, scheduled, observed, now.toISOString());
    appendFileSync(out, `${JSON.stringify(record)}\n`);
    console.log(`${series.project}: scheduled ${record.scheduled.points} points, ${record.scheduled.nonzero_hours_ahead} nonzero hours ahead, reaches ${record.scheduled.last_at}`);
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
