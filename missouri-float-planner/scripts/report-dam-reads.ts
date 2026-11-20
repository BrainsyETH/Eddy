#!/usr/bin/env npx tsx
/**
 * report-dam-reads.ts — what the dam Reads have been saying, counted.
 *
 * Read-only. For the linked Supabase project it takes every stored dam Read
 * (dam_updates.facts) in the window, renders its compact card with today's
 * code at the time it was written, and prints how often each headline came up
 * per dam, with the newest summary under the most common ones.
 *
 * Run it before and after a change to the card's rules in
 * src/lib/eddy/dam-read-facts.ts (ADR 0017 decision 4). See the header of
 * scripts/lib/dam-read-report.ts for what the count can and cannot show.
 *
 * Usage: npm run report:dam-reads [-- --days 30] [--examples 3]
 */

import { getScriptClient } from './lib/db';
import { damReadReport, type StoredDamRead } from './lib/dam-read-report';

const PAGE = 500;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const days = Number(arg('--days') ?? 30);
  if (!Number.isFinite(days) || days <= 0) throw new Error('--days needs a positive number');
  const examples = Number(arg('--examples') ?? 3);
  if (!Number.isInteger(examples) || examples < 0) throw new Error('--examples needs a whole number');

  const supabase = getScriptClient({ script: 'report-dam-reads', write: false });
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const rows: StoredDamRead[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('dam_updates')
      .select('dam_id, generated_at, facts')
      .gte('generated_at', since)
      .order('generated_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`dam_updates: ${error.message}`);
    for (const row of data ?? []) {
      if (row.facts) rows.push({ damId: row.dam_id, generatedAt: row.generated_at, facts: row.facts });
    }
    if (!data || data.length < PAGE) break;
  }

  console.log('');
  console.log(`Dam Read cards, last ${days} days, one render per stored Read.`);
  console.log(damReadReport(rows, { examples }));
}

main().catch((e) => {
  console.error(`\n❌ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
