#!/usr/bin/env npx tsx
/**
 * audit-eddy-reads.ts — how Eddy's Read is actually being produced.
 *
 * Read-only. Prints, for the linked Supabase project:
 *
 *   - how many whole-river and section Reads are model-written versus
 *     code-written fallbacks, from the newest stored row per target;
 *   - why, from eddy_generation_log, once that table exists;
 *   - what EDDY_KNOWLEDGE.md covers against river_sections, in both
 *     directions, and how many of its reach blocks can reach a Read at all;
 *   - which rivers hand the prompt a malformed note, no note, or no rain lag.
 *
 * These are the counts the 2026-11-16 review was built on. They were run by
 * hand then; this is the same audit as a command, so the numbers can be
 * checked rather than taken on trust, and compared after a change.
 *
 * Usage: npm run audit:eddy-reads [-- --days 14]
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getScriptClient } from './lib/db';
import { auditReport, type AuditLogRow, type AuditPublished } from './lib/eddy-read-audit';
import { listKnowledgeRiverSlugs, listKnowledgeSectionSlugs } from '../src/lib/eddy/knowledge';
import { RAIN_LAG } from '../src/lib/eddy/rain-lag';

const PAGE = 1000;

/** PostgREST caps a response at 1000 rows; a fortnight of the log is more. */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

async function loadLog(supabase: SupabaseClient, days: number): Promise<AuditLogRow[] | null> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  try {
    const rows = await fetchAll<{ outcome: string; reason: string | null; model_used: string | null; cache_read_tokens: number | null }>((from, to) =>
      supabase.from('eddy_generation_log')
        .select('outcome, reason, model_used, cache_read_tokens')
        .eq('workload', 'river_update')
        .gte('created_at', since)
        .order('created_at', { ascending: true })
        .range(from, to));
    return rows.map((r) => ({ outcome: r.outcome, reason: r.reason, modelUsed: r.model_used, cacheReadTokens: r.cache_read_tokens }));
  } catch (e) {
    const code = (e as { code?: string }).code;
    // The table arrives with a migration that is applied by hand.
    if (code === '42P01' || code === 'PGRST205') return null;
    throw e;
  }
}

async function main() {
  const daysArg = process.argv.indexOf('--days');
  const logDays = daysArg > -1 ? Number(process.argv[daysArg + 1]) : 14;
  if (!Number.isFinite(logDays) || logDays <= 0) throw new Error('--days needs a positive number');

  const supabase = getScriptClient({ script: 'audit-eddy-reads', write: false });

  const riverRows = await fetchAll<{ id: string; slug: string; river_characteristics: unknown }>((from, to) =>
    supabase.from('rivers')
      .select('id, slug, river_characteristics(river_note, rain_lag_hours)')
      .eq('active', true).order('slug').range(from, to));
  const riverById = new Map(riverRows.map((r) => [r.id, r.slug]));

  const sectionRows = await fetchAll<{ river_id: string; section_slug: string }>((from, to) =>
    supabase.from('river_sections').select('river_id, section_slug').order('river_id').order('section_slug').range(from, to));
  const primaryRows = await fetchAll<{ river_id: string }>((from, to) =>
    supabase.from('river_gauges').select('river_id').eq('is_primary', true).order('river_id').range(from, to));
  const withPrimary = new Set(primaryRows.map((g) => g.river_id));

  // Newest first, so the first row seen for a target is the one being served.
  const updateRows = await fetchAll<{ river_slug: string; section_slug: string | null; model_used: string | null }>((from, to) =>
    supabase.from('eddy_updates')
      .select('river_slug, section_slug, model_used')
      .order('generated_at', { ascending: false }).range(from, to));
  const newest = new Map<string, AuditPublished>();
  for (const row of updateRows) {
    const key = `${row.river_slug}/${row.section_slug ?? ''}`;
    if (!newest.has(key)) newest.set(key, { riverSlug: row.river_slug, sectionSlug: row.section_slug, modelUsed: row.model_used });
  }

  const knowledgeRivers = listKnowledgeRiverSlugs();

  console.log('');
  console.log(auditReport({
    rivers: riverRows.map((r) => {
      const rc = (Array.isArray(r.river_characteristics) ? r.river_characteristics[0] : r.river_characteristics) as
        { river_note: string | null; rain_lag_hours: number | null } | null | undefined;
      return {
        slug: r.slug,
        riverNote: rc?.river_note ?? null,
        // The generator reads the database first and falls back to this map.
        hasRainLag: rc?.rain_lag_hours != null || r.slug in RAIN_LAG,
        hasPrimaryGauge: withPrimary.has(r.id),
      };
    }),
    sections: sectionRows
      .filter((s) => riverById.has(s.river_id))
      .map((s) => ({ riverSlug: riverById.get(s.river_id)!, sectionSlug: s.section_slug })),
    published: [...newest.values()],
    knowledgeSections: Object.fromEntries(knowledgeRivers.map((slug) => [slug, listKnowledgeSectionSlugs(slug)])),
    knowledgeRivers,
    log: await loadLog(supabase, logDays),
    logDays,
  }));
}

main().catch((e) => {
  console.error(`\n❌ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
