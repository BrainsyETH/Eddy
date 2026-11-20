// scripts/lib/dam-read-report.ts
// The arithmetic behind scripts/report-dam-reads.ts, kept apart from the query
// so it can be tested on fixed rows.
//
// A dam's Read is written by code from stored facts (ADR 0017), so there is no
// prompt to score. What can go wrong is the selection: the same card written
// every day whatever the schedule held. On 2026-11-19 that was the finding:
// one card compared the day's first start with the usual one and said nothing
// about a day posted for a quarter of its usual hours. So this re-renders each
// stored Read with today's code, at the time it was written, and counts how
// often each headline comes up per dam. A headline that takes most of a dam's
// Reads is either that dam's real pattern or a rule that fires too easily, and
// the example beside it is how to tell which.
//
// What it cannot see: a Read is re-rendered every hour it is served, against
// the schedule posted then. This counts one render per stored row, with the
// schedule that row was written against. Rows stored before 2026-11-20 carry
// no whole-day totals or run sizes, so the short-day, long-day and morning
// cards cannot fire for them.

import { damReadTakeaway, type DamReadFacts } from '../../src/lib/eddy/dam-read-facts';

export interface StoredDamRead {
  damId: string;
  generatedAt: string;
  facts: unknown;
}

export interface HeadlineCount {
  headline: string;
  count: number;
  /** The most recent summary written under this headline. */
  example: string;
  exampleAt: string;
}

export interface DamReadTally {
  damId: string;
  reads: number;
  headlines: HeadlineCount[];
  /** Reads with no second sentence: nothing stood out and no track record existed. */
  oneSentence: number;
  /** Rows whose stored facts today's code could not render. */
  unrenderable: number;
}

function sentences(summary: string): number {
  return summary.split(/[.!?](?:\s|$)/).filter(Boolean).length;
}

/** One tally per dam, headlines most common first. */
export function tallyDamReads(rows: readonly StoredDamRead[]): DamReadTally[] {
  const byDam = new Map<string, DamReadTally & { index: Map<string, HeadlineCount> }>();
  for (const row of [...rows].sort((a, b) => a.generatedAt.localeCompare(b.generatedAt))) {
    let tally = byDam.get(row.damId);
    if (!tally) {
      tally = { damId: row.damId, reads: 0, headlines: [], oneSentence: 0, unrenderable: 0, index: new Map() };
      byDam.set(row.damId, tally);
    }
    let rendered: { headline: string; summary: string };
    try {
      rendered = damReadTakeaway(row.facts as DamReadFacts);
    } catch {
      tally.unrenderable += 1;
      continue;
    }
    tally.reads += 1;
    if (sentences(rendered.summary) < 2) tally.oneSentence += 1;
    const seen = tally.index.get(rendered.headline);
    // Rows arrive oldest first, so the last one seen is the newest example.
    if (seen) Object.assign(seen, { count: seen.count + 1, example: rendered.summary, exampleAt: row.generatedAt });
    else tally.index.set(rendered.headline, { headline: rendered.headline, count: 1, example: rendered.summary, exampleAt: row.generatedAt });
  }
  return [...byDam.values()]
    .map(({ index, ...tally }) => ({
      ...tally,
      headlines: [...index.values()].sort((a, b) => b.count - a.count || a.headline.localeCompare(b.headline)),
    }))
    .sort((a, b) => a.damId.localeCompare(b.damId));
}

const share = (count: number, of: number) => (of ? `${Math.round((count / of) * 100)}%` : '-');

/** The printed report. `examples` quotes the newest summary under that many headlines per dam. */
export function damReadReport(rows: readonly StoredDamRead[], options: { examples: number }): string {
  const tallies = tallyDamReads(rows);
  if (!tallies.length) return '  No stored dam Reads in this window.';
  const lines: string[] = [];
  for (const tally of tallies) {
    lines.push('');
    lines.push(`${tally.damId}: ${tally.reads} Reads, ${tally.headlines.length} different headlines`);
    tally.headlines.forEach((h, i) => {
      lines.push(`  ${share(h.count, tally.reads).padStart(4)}  ${String(h.count).padStart(4)}  ${h.headline}`);
      if (i < options.examples) lines.push(`              ${h.exampleAt.slice(0, 16)}Z  ${h.example}`);
    });
    lines.push(`  one sentence only: ${tally.oneSentence} of ${tally.reads} (${share(tally.oneSentence, tally.reads)})`);
    if (tally.unrenderable) lines.push(`  could not be rendered: ${tally.unrenderable}`);
  }
  return lines.join('\n');
}
