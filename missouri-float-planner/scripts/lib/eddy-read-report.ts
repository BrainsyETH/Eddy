// scripts/lib/eddy-read-report.ts
// The arithmetic behind scripts/report-eddy-reads.ts, kept apart from the
// queries so it can be tested on fixed rows.
//
// One line per day (or week) per kind of Read, one column per rule in
// src/lib/eddy/read-checks.ts, each cell the share of Reads that passed. A
// change to the prompt or to EDDY_KNOWLEDGE.md is judged by whether these
// columns move after it ships.

import { READ_CHECK_IDS, READ_CHECK_LABELS, type ReadCheckId, type ReadCheckResult } from '../../src/lib/eddy/read-checks';

export type ReadKind = 'river' | 'gauge';

export interface ScoredRead {
  /** Local calendar day the Read was written, YYYY-MM-DD. */
  day: string;
  kind: ReadKind;
  /** Which Read, for the examples: "current" or "meramec @ 07019000". */
  label: string;
  /** Characters in the short Read, or null when it has none. */
  readLength: number | null;
  results: ReadCheckResult[];
}

export interface ReadReportOptions {
  by: 'day' | 'week';
  /** Failing Reads to quote per rule, newest first. 0 for none. */
  examples: number;
}

const COLUMN: Record<ReadCheckId, string> = {
  summary_length: 'sum<=120',
  read_length: 'read<=240',
  read_measurements: 'no-nums',
  read_forecast_talk: 'no-fcst',
  flat_forecast: 'no-will',
  numbers_match_inputs: 'in-inputs',
  numbers_from_knowledge: 'not-file',
};

const KIND_TITLE: Record<ReadKind, string> = {
  river: 'RIVER READS (eddy_generation_log, model-written, whole river)',
  gauge: 'GAUGE READS (secondary gauges, model-written)',
};

/** The Monday that starts a day's week, so a week has one stable name. */
export function weekOf(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

interface Tally { pass: number; checked: number }

function tally(rows: ScoredRead[]): Record<ReadCheckId, Tally> {
  const out = Object.fromEntries(READ_CHECK_IDS.map((id) => [id, { pass: 0, checked: 0 }])) as Record<ReadCheckId, Tally>;
  for (const row of rows) {
    for (const result of row.results) {
      if (result.status === 'skip') continue;
      out[result.id].checked++;
      if (result.status === 'pass') out[result.id].pass++;
    }
  }
  return out;
}

/** "83%", or "-" when no Read could be checked against the rule. */
const rate = (t: Tally) => (t.checked ? `${Math.round((t.pass / t.checked) * 100)}%` : '-');

function table(rows: ScoredRead[], by: 'day' | 'week'): string[] {
  const periodOf = (row: ScoredRead) => (by === 'week' ? weekOf(row.day) : row.day);
  const periods = [...new Set(rows.map(periodOf))].sort();
  const head = [by === 'week' ? 'week of' : 'day', 'reads', ...READ_CHECK_IDS.map((id) => COLUMN[id]), 'med.len'];
  const body = periods.map((period) => {
    const group = rows.filter((row) => periodOf(row) === period);
    const t = tally(group);
    return [period, String(group.length), ...READ_CHECK_IDS.map((id) => rate(t[id])), String(median(group.flatMap((r) => r.readLength ?? [])) ?? '-')];
  });
  const total = tally(rows);
  const all = ['ALL', String(rows.length), ...READ_CHECK_IDS.map((id) => rate(total[id])), String(median(rows.flatMap((r) => r.readLength ?? [])) ?? '-')];
  const lines = [head, ...body, all];
  const widths = head.map((_, i) => Math.max(...lines.map((line) => line[i].length)));
  return lines.map((line) => `  ${line.map((cell, i) => (i === 0 ? cell.padEnd(widths[i]) : cell.padStart(widths[i]))).join('  ')}`);
}

function failures(rows: ScoredRead[], examples: number): string[] {
  const out: string[] = [];
  const total = tally(rows);
  const newestFirst = [...rows].sort((a, b) => b.day.localeCompare(a.day));
  for (const id of READ_CHECK_IDS) {
    const t = total[id];
    if (!t.checked) {
      out.push(`  ${COLUMN[id]}: not checked (inputs were not kept for these Reads)`);
      continue;
    }
    out.push(`  ${COLUMN[id]}: ${t.pass} of ${t.checked} passed`);
    if (!examples) continue;
    const failing = newestFirst
      .map((row) => ({ row, result: row.results.find((r) => r.id === id && r.status === 'fail') }))
      .filter((x) => x.result)
      .slice(0, examples);
    for (const { row, result } of failing) out.push(`      ${row.day} ${row.label}: ${result!.detail ?? ''}`.trimEnd());
  }
  return out;
}

export function readReport(rows: ScoredRead[], options: ReadReportOptions): string {
  const out: string[] = [];
  out.push('Each cell is the share of Reads that passed the rule. "-" means the rule could not be checked.');
  for (const id of READ_CHECK_IDS) out.push(`  ${COLUMN[id].padEnd(9)}  ${READ_CHECK_LABELS[id]}`);
  out.push('  med.len    median length of the short Read, in characters');

  for (const kind of ['river', 'gauge'] as const) {
    const group = rows.filter((row) => row.kind === kind);
    out.push('');
    out.push(KIND_TITLE[kind]);
    if (!group.length) {
      out.push('  none in this window');
      continue;
    }
    out.push(...table(group, options.by));
    out.push('');
    out.push(...failures(group, options.examples));
  }
  return out.join('\n');
}
