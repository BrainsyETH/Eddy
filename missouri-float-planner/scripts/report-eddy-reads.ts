#!/usr/bin/env npx tsx
/**
 * report-eddy-reads.ts — how well Eddy's Reads keep the rules their prompts set.
 *
 * Read-only. For the linked Supabase project it scores every model-written
 * river Read in eddy_generation_log and every model-written secondary-gauge
 * Read, with the rules in src/lib/eddy/read-checks.ts, and prints the pass rate
 * per rule per day (or per week over a long window).
 *
 * Gauge Reads come from eddy_generation_log on the days it holds them, and
 * from gauge_updates before that. gauge_updates keeps the published text but
 * not the prompt, so the two number rules show "-" for those days.
 *
 * Run it before and after a change to the prompt or to EDDY_KNOWLEDGE.md. The
 * rules are evidence, not a gate: see the header of read-checks.ts for what
 * they cannot see.
 *
 * Usage: npm run report:eddy-reads [-- --days 14] [--by day|week] [--examples 3]
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getScriptClient } from './lib/db';
import { readReport, type ScoredRead } from './lib/eddy-read-report';
import { checkRead } from '../src/lib/eddy/read-checks';

const PAGE = 500;
/** Reads are written for Ozarks rivers; a "day" is a Central day. */
const DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' });
const dayOf = (iso: string) => DAY.format(new Date(iso));

async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}

interface LogRow {
  created_at: string;
  workload: string;
  river_slug: string;
  section_slug: string | null;
  usgs_site_id: string | null;
  user_prompt: string | null;
  published: { summaryText?: string | null; eddyRead?: string | null; quoteText?: string | null } | null;
}

async function loadLog(supabase: SupabaseClient, since: string): Promise<LogRow[]> {
  try {
    return await fetchAll<LogRow>((from, to) =>
      supabase.from('eddy_generation_log')
        .select('created_at, workload, river_slug, section_slug, usgs_site_id, user_prompt, published')
        .eq('outcome', 'model')
        .gte('created_at', since)
        .order('created_at', { ascending: true })
        .range(from, to));
  } catch (e) {
    const code = (e as { code?: string }).code;
    // The table arrives with a migration that is applied by hand.
    if (code === '42P01' || code === 'PGRST205') return [];
    throw e;
  }
}

interface GaugeUpdateRow {
  generated_at: string;
  river_slug: string;
  usgs_site_id: string;
  summary_text: string | null;
  eddy_read: string | null;
  quote_text: string | null;
}

async function main() {
  const days = Number(arg('--days') ?? 14);
  if (!Number.isFinite(days) || days <= 0) throw new Error('--days needs a positive number');
  const by = (arg('--by') ?? (days > 21 ? 'week' : 'day')) as 'day' | 'week';
  if (by !== 'day' && by !== 'week') throw new Error('--by is day or week');
  const examples = Number(arg('--examples') ?? 3);
  if (!Number.isInteger(examples) || examples < 0) throw new Error('--examples needs a whole number');

  const supabase = getScriptClient({ script: 'report-eddy-reads', write: false });
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const log = await loadLog(supabase, since);
  const rows: ScoredRead[] = [];
  const gaugeDaysInLog = new Set<string>();

  for (const row of log) {
    if (!row.published) continue;
    const isGauge = row.workload === 'gauge_update';
    // Stretch Reads are paused and no screen shows them; they are not scored.
    if (!isGauge && row.section_slug != null) continue;
    const day = dayOf(row.created_at);
    if (isGauge) gaugeDaysInLog.add(day);
    rows.push({
      day,
      kind: isGauge ? 'gauge' : 'river',
      label: isGauge ? `${row.river_slug} @ ${row.usgs_site_id ?? '?'}` : row.river_slug,
      readLength: row.published.eddyRead?.length ?? null,
      results: checkRead(
        { summary: row.published.summaryText ?? null, eddyRead: row.published.eddyRead ?? null, full: row.published.quoteText ?? null },
        { prompt: row.user_prompt },
      ),
    });
  }

  const gaugeUpdates = await fetchAll<GaugeUpdateRow>((from, to) =>
    supabase.from('gauge_updates')
      .select('generated_at, river_slug, usgs_site_id, summary_text, eddy_read, quote_text')
      .not('model_used', 'is', null)
      .gte('generated_at', since)
      .order('generated_at', { ascending: true })
      .range(from, to));
  for (const row of gaugeUpdates) {
    const day = dayOf(row.generated_at);
    // The log has this day's gauge Reads, with their prompts. Do not count them twice.
    if (gaugeDaysInLog.has(day)) continue;
    rows.push({
      day,
      kind: 'gauge',
      label: `${row.river_slug} @ ${row.usgs_site_id}`,
      readLength: row.eddy_read?.length ?? null,
      results: checkRead({ summary: row.summary_text, eddyRead: row.eddy_read, full: row.quote_text }, { prompt: null }),
    });
  }

  console.log('');
  console.log(`Eddy Read checks, last ${days} days, by ${by}.`);
  console.log(readReport(rows, { by, examples }));
}

main().catch((e) => {
  console.error(`\n❌ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
